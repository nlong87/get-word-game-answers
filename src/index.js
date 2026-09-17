import './env.mjs';
import { pathToFileURL } from 'node:url';
import express from 'express';
import WPAPI from 'wpapi';
import {startXvfb} from "./browser.mjs";
import process_answers from "./process.mjs";

const PORT = process.env.PORT || 8080;
// Cloud Run's request timeout is 300s (--timeout 300 in the deploy script); warn shortly before.
const WATCHDOG_MS = Number(process.env.WATCHDOG_MS) || 280000;
const isProd = process.env.NODE_ENV === 'production';

/*
Nothing outside the request handler had any error coverage, so a failure during startup (Xvfb) or
any stray rejection killed the container silently. Alert, give the webhook a bounded moment to
flush - the process would otherwise exit before the request leaves - then exit non-zero.
*/
const FLUSH_MS = 2000;

function installCrashHandlers() {
    
    let handling = false;
    
    const report = async (label, error) => {
        if (handling) return;
        handling = true;
        
        console.error(`${label}:`, error);
        
        try {
            await Promise.race([
                send_discord_message(`${label}: ${error?.message ?? error}`),
                new Promise(resolve => setTimeout(resolve, FLUSH_MS))
            ]);
        } catch {}
        
        process.exit(1);
    };
    
    process.on('unhandledRejection', (reason) => report('Unhandled rejection', reason));
    process.on('uncaughtException', (error) => report('Uncaught exception', error));
}

installCrashHandlers();

const app = express();
app.use(express.json());

// Only listen when this file is the entry point. Importing it (scripts.js, one-off tooling)
// should hand back manual_post_answers without also binding a port.
const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
    app.listen(PORT, () => {
        console.log(`Listening on port ${PORT}`);
        if (isProd) {
            startXvfb();
        }
    });
}


export async function manual_post_answers(puzzle_type, amount_to_return = 8, start_date = null) {
    
    let answer_data = [];
    answer_data = await process_answers(puzzle_type, amount_to_return, start_date).then(r => answer_data = r);
    
    if (answer_data) {
        return await post_data(answer_data);
    } else {
        return false;
    }
}

export async function post_data(data) {
    
    const endpoint = process.env.REST_ENDPOINT;
    const username = process.env.REST_USERNAME;
    const password = process.env.REST_PASSWORD;
    
    let wp = new WPAPI({
        endpoint: endpoint,
        username: username,
        password: password
    });
    
    wp.tryhard = wp.registerRoute('tryhardguides/v1', '/add_answers', {
        params: ['data']
    });
    
    return wp.tryhard().create({
        data: Object.values(data)
    }).then(function (response) {
        console.log(response);
        return response;
    }).catch(async function (error) {
        // Previously this returned the error as though it were a response, so a 400 such as
        // shuffalo's empty_answers looked exactly like a successful post.
        const code = error?.code ?? 'request_failed';
        const message = error?.message ?? String(error);
        const status = error?.data?.status ?? '';
        
        console.error(`  WordPress rejected the post [${code}${status ? ' ' + status : ''}]: ${message}`);
        await send_discord_message(`WordPress rejected the answers post [${code}${status ? ' ' + status : ''}]: ${message}`);
        
        throw error;
    });
    
}

async function send_discord_message(message) {
    
    const discord_url = process.env.DISCORD_WEBHOOK;
    
    if (!discord_url) {
        // Surfaced in Cloud Logging so a missing webhook does not look like "no failures".
        console.error(`  DISCORD_WEBHOOK not set - alert dropped: ${message}`);
        return false;
    }
    
    return await fetch(discord_url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            content: message
        })
    }).then(function (response) {
        return response;
    }).catch(function (error) {
        console.error('  failed to deliver Discord alert:', error?.message ?? error);
        return false;
    });
}

if (process.env.NODE_ENV !== 'production') {
    app.get('/post_answers', async (req, res) => {
        // just forward to the same handler
        req.method = 'POST';
        app.handle(req, res);
    });
}

/*
Retry signal. A run that collected nothing also posted nothing, so simply running it again later is
safe - and is usually all that is needed, because the source (parseword, most often) just was not
live yet at the scheduled minute. The route answers 503 in that case and Cloud Scheduler retries it
per the job's retryConfig; a job without one merely records a failed execution, which is still
better visibility than today's silent 200. Anything that did reach WordPress stays 200: re-posting
a batch WordPress has already seen is not safely idempotent.
*/
function collectedNothing(answer_data) {
    return !Object.values(answer_data ?? {}).some(
        obj => Array.isArray(obj?.answers) && obj.answers.length > 0
    );
}

app.post('/post_answers', async (req, res) => {
    // Optional: verify the request is from Cloud Scheduler
    const userAgent = req.headers['user-agent'] || '';
    if (isProd && !userAgent.includes('Google-Cloud-Scheduler')) {
        return res.status(403).send('Forbidden');
    }
    
    const puzzle_type = req.query.type || req.body.type;
    const amount = req.query.amount || req.body.amount;
    
    // Cloud Run kills the instance at --timeout 300, and nothing in-process can report after
    // that, so warn just before the axe falls.
    const watchdog = setTimeout(() => {
        send_discord_message(`Posting Answers for ${puzzle_type} has run ${Math.round(WATCHDOG_MS / 1000)}s and is about to hit the Cloud Run timeout.`);
    }, WATCHDOG_MS);
    
    let answer_data;
    try {
        answer_data = await process_answers(puzzle_type, amount);
    } catch (error) {
        clearTimeout(watchdog);
        // Express 4 does not catch async rejections, so without this the process exits and
        // nothing is posted at all.
        console.error(`Unhandled failure processing ${puzzle_type}:`, error);
        await send_discord_message(`Posting Answers for ${puzzle_type} threw: ${error.message} - nothing was posted, answering 503 so the scheduler can retry.`);
        return res.status(503).send({ error: error.message, retryable: true });
    }
    
    clearTimeout(watchdog);
    
    // A knowingly disabled puzzle is not a failure; say so once and stop.
    if (answer_data?.disabled) {
        return res.status(200).send({ disabled: puzzle_type });
    }
    
    // Failures land in two places: get-answers attaches dispatch-level errors to the result
    // object, and a module (letroso) may attach its own to its envelope. Both are non-enumerable,
    // so they have to be read explicitly rather than via Object.entries.
    const failures = [ ...(answer_data?.errors ?? []) ];
    
    for (const obj of Object.values(answer_data ?? {})) {
        if (obj?.errors?.length) {
            failures.push(...obj.errors);
        }
    }
    
    for (const message of failures) {
        await send_discord_message(`Posting Answers for ${puzzle_type}: ${message}`);
    }
    
    // Posting an empty payload only earns a WordPress rejection and a second, misleading alert,
    // so stop here instead and let the caller come back.
    if (collectedNothing(answer_data)) {
        await send_discord_message(`Posting Answers for ${puzzle_type} returned no data - nothing was posted, answering 503 so the scheduler can retry.`);
        return res.status(503).send({ error: 'no answers collected', type: puzzle_type, retryable: true });
    }
    
    // Past this point at least one key has answers. A key that came back empty alongside a full
    // one (nerdle, nyt-bonus) is still worth an alert, but not a retry - the full keys are about
    // to be posted.
    if (process.env.NODE_ENV === 'production') {
        for (const [key, obj] of Object.entries(answer_data)) {
            if (!obj || !Array.isArray(obj.answers)) {
                continue;
            }
            if (obj.answers.length === 0) {
                await send_discord_message(`Posting Answers for ${key} failed to return any data.`);
            } else if (!obj.clamped && obj.answers.length < amount) {
                // clamped puzzles are capped by how far ahead the source has published,
                // so a short result is expected rather than a failure.
                await send_discord_message(`Posting Answers for ${key} posted ${obj.answers.length} out of the ${amount} requested.`);
            }
            
            // WordPress only rejects a batch when *every* answer is blank, so a partly blank
            // one posts silently and writes an empty entry.
            const blanks = obj.answers
                .map((answer, index) => (typeof answer === 'string' && answer.trim() === '') ? index : -1)
                .filter(index => index !== -1);
            
            if (blanks.length) {
                await send_discord_message(`Posting Answers for ${key} has ${blanks.length} blank answer(s) at index ${blanks.join(', ')}.`);
            }
        }
    }
    
    try {
        const response = await post_data(answer_data);
        res.status(200).send(response);
    } catch (error) {
        // post_data has already alerted with the WordPress code and message. This stays 200: the
        // batch may well have been written before the failure, and a retry would duplicate it.
        res.status(200).send({ error: error?.message ?? String(error) });
    }
    
});