import './env.mjs';
import { pathToFileURL } from 'node:url';
import express from 'express';
import WPAPI from 'wpapi';
import {startXvfb} from "./browser.mjs";
import process_answers from "./process.mjs";
import { Temporal } from '@js-temporal/polyfill';
import { build, send_discord_message } from './discord.mjs';
import { alert_time, get_attempt, human_time_diff, local_date, parse_job } from './scheduler-attempt.mjs';

// letroso-host.mjs reaches the webhook through here.
export { send_discord_message };

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
                send_discord_message(build(`\u{274C} ${label}`, 'error', [[error?.message ?? String(error)]], 'get-word-game-answers')),
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

/*
`alert: false` leaves the Discord alert to the caller. The route does that, because only it knows
which scheduler attempt this is and whether a retry is coming.
*/
export async function post_data(data, { alert = true } = {}) {

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
        console.error(`  WordPress rejected the post ${describe_post_error(error)}`);

        if (alert) {
            await send_discord_message(build(
                is_connect_failure(error) ? "\u{274C} Couldn't reach WordPress" : '\u{274C} WordPress rejected the answers post',
                'error',
                [[describe_post_error(error)]],
                Object.keys(data ?? {}).join(', ')
            ));
        }

        throw error;
    });

}

function describe_post_error(error) {

    const code = error?.code ?? 'request_failed';
    const message = error?.message ?? String(error);
    const status = error?.data?.status ?? '';

    return `[${code}${status ? ' ' + status : ''}]: ${message}`;
}

/*
Failures that happen before a byte of the request leaves, so WordPress cannot have the batch and a
retry is safe. A reset or timeout mid-request (ECONNRESET, superagent's ECONNABORTED) may have
landed, and an API error (wpapi hands back the response body, whose `code` is e.g. rest_forbidden)
certainly reached it - neither is listed.
*/
const CONNECT_FAILURES = ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH'];

function is_connect_failure(error) {
    return !error?.response && CONNECT_FAILURES.includes(error?.code);
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
better visibility than today's silent 200. The same goes for a post that never connected to
WordPress. Anything that did reach WordPress stays 200: re-posting a batch WordPress has already
seen is not safely idempotent.
*/
function collectedNothing(answer_data) {
    return !Object.values(answer_data ?? {}).some(
        obj => Array.isArray(obj?.answers) && obj.answers.length > 0
    );
}

/*
Alerts follow the crossword scheduler's format (try-hard-core's Scheduler::format_*_alert): a title
with the job and attempt, the puzzle date, what went wrong, and what happens next - a retry time, or
why there won't be one. A retry that then succeeds says so, so a source that came back twenty
minutes later doesn't look the same in the channel as one that is still down.
*/
function alert_title(icon, name, attempt, suffix = '') {

    // "2/4" in a retry ladder, "1" for a job without one, nothing for a manual run.
    const count = attempt?.attempt
        ? ` (${attempt.total > 1 ? `${attempt.attempt}/${attempt.total}` : attempt.attempt})`
        : '';

    return `${icon} ${name}${count}${suffix ? ` - ${suffix}` : ''}`;
}

function alert_date(attempt, answer_data) {

    const published = Object.values(answer_data ?? {}).find(obj => obj?.publishedDate)?.publishedDate;

    return published ?? local_date(Temporal.Now.instant(), attempt?.time_zone ?? 'Etc/UTC');
}

// The last line of a 503 alert: when the scheduler comes back, or why it won't.
function next_step(attempt) {

    if (!attempt?.job) {
        return ['\u{26D4} Not a scheduled run - not retried.', 'red'];
    }

    if (attempt.unknown) {
        return [`\u{26D4} Retry status unknown - ${attempt.unknown}`, 'red'];
    }

    if (attempt.total === 1) {
        return ['\u{26D4} Retries are not enabled for this job - nothing was posted.', 'red'];
    }

    if (attempt.next_at) {
        return [
            `\u{21A9}\u{FE0F} ${alert_time(attempt.next_at, attempt.time_zone)} (in ${human_time_diff(Temporal.Now.instant(), attempt.next_at)})`,
            'yellow'
        ];
    }

    return [`\u{26D4} Retries exhausted after ${attempt.total} attempts - nothing was posted.`, 'red'];
}

app.post('/post_answers', async (req, res) => {
    // Optional: verify the request is from Cloud Scheduler
    const userAgent = req.headers['user-agent'] || '';
    if (isProd && !userAgent.includes('Google-Cloud-Scheduler')) {
        return res.status(403).send('Forbidden');
    }

    const puzzle_type = req.query.type || req.body.type;
    const amount = req.query.amount || req.body.amount;

    // ?only=gamedle-event narrows a fan-out type to the listed keys. Each Gamedle mode has its own
    // scheduler job this way, so a 503 retries that one mode without re-posting the others.
    const only_param = req.query.only || req.body.only;
    const only = only_param ? String(only_param).split(',').map(key => key.trim()).filter(Boolean) : null;
    const label = only ? `${puzzle_type} [${only.join(', ')}]` : puzzle_type;

    // Alerts are titled by the scheduler job when there is one (Gamedle-Cover reads better than
    // gamedle [gamedle-cover]) and footed with the route's query, so either is greppable.
    const job_header = req.get('X-CloudScheduler-JobName');
    const name = parse_job(job_header)?.id ?? label;
    const footer = [`type=${puzzle_type}`, amount && `amount=${amount}`, only && `only=${only.join(',')}`]
        .filter(Boolean).join('&');

    // Looked up only once something needs it: a failure, or a success that may be a recovery.
    let attempt_lookup;
    const attempt = () => attempt_lookup ??= get_attempt(job_header);

    const alert_failure = async (lines, answer_data = null) => {
        const info = await attempt();
        await send_discord_message(build(
            alert_title('\u{274C}', name, info),
            'error',
            [[alert_date(info, answer_data)], ...lines.map(text => [text]), next_step(info)],
            footer
        ));
    };

    // Cloud Run kills the instance at --timeout 300, and nothing in-process can report after
    // that, so warn just before the axe falls. The kill logs as a failed attempt, so the next
    // attempt still reports whether it recovered.
    const watchdog = setTimeout(() => {
        send_discord_message(build(
            alert_title('\u{23F1}\u{FE0F}', name, null, 'about to hit the Cloud Run timeout'),
            'warn',
            [[`Still running after ${Math.round(WATCHDOG_MS / 1000)}s.`]],
            footer
        ));
    }, WATCHDOG_MS);

    let answer_data;
    try {
        answer_data = await process_answers(puzzle_type, amount, null, only);
    } catch (error) {
        clearTimeout(watchdog);
        // Express 4 does not catch async rejections, so without this the process exits and
        // nothing is posted at all.
        console.error(`Unhandled failure processing ${label}:`, error);
        await alert_failure([`Threw: ${error.message}`]);
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

    // A narrowed job whose keys the module left out on purpose, with no error (the Gamedle event
    // outside its window), has nothing to do today. Without this it would 503 and alert daily.
    if (only && collectedNothing(answer_data) && !failures.length
        && !only.some(key => Object.hasOwn(answer_data ?? {}, key))) {
        console.log(`  ${label}: nothing scheduled today`);
        return res.status(200).send({ skipped: only });
    }

    // Posting an empty payload only earns a WordPress rejection and a second, misleading alert,
    // so stop here instead and let the caller come back.
    if (collectedNothing(answer_data)) {
        await alert_failure(failures.length ? failures : ['No answers collected.'], answer_data);
        return res.status(503).send({ error: 'no answers collected', type: puzzle_type, retryable: true });
    }

    // Past this point at least one key has answers. A key that came back empty alongside a full
    // one (nerdle, nyt-bonus) is still worth an alert, but not a retry - the full keys are about
    // to be posted. They're gathered into one alert, sent once the post's outcome is known.
    const problems = [...failures];

    if (process.env.NODE_ENV === 'production') {
        for (const [key, obj] of Object.entries(answer_data)) {
            if (!obj || !Array.isArray(obj.answers)) {
                continue;
            }
            if (obj.answers.length === 0) {
                problems.push(`${key} failed to return any data.`);
            } else if (!obj.clamped && obj.answers.length < amount) {
                // clamped puzzles are capped by how far ahead the source has published,
                // so a short result is expected rather than a failure.
                problems.push(`${key} posted ${obj.answers.length} out of the ${amount} requested.`);
            }

            // WordPress only rejects a batch when *every* answer is blank, so a partly blank
            // one posts silently and writes an empty entry.
            const blanks = obj.answers
                .map((answer, index) => (typeof answer === 'string' && answer.trim() === '') ? index : -1)
                .filter(index => index !== -1);

            if (blanks.length) {
                problems.push(`${key} has ${blanks.length} blank answer(s) at index ${blanks.join(', ')}.`);
            }
        }
    }

    const problem_lines = problems.map(text => [text, 'yellow']);

    let response;
    try {
        response = await post_data(answer_data, { alert: false });
    } catch (error) {
        // Nothing left this machine, so WordPress can't have the batch: retry like an empty run.
        if (is_connect_failure(error)) {
            await alert_failure([`Couldn't reach WordPress ${describe_post_error(error)}`], answer_data);
            return res.status(503).send({ error: error?.message ?? String(error), retryable: true });
        }

        // This stays 200: the batch may well have been written before the failure, and a retry
        // would duplicate it.
        const info = await attempt();
        await send_discord_message(build(
            alert_title('\u{274C}', name, info, 'WordPress rejected the post'),
            'error',
            [
                [alert_date(info, answer_data)],
                [describe_post_error(error)],
                ...problem_lines,
                ['\u{26D4} Not retried - WordPress may already have this batch.', 'red']
            ],
            footer
        ));
        return res.status(200).send({ error: error?.message ?? String(error) });
    }

    const info = await attempt();

    if (info.attempt > 1) {
        await send_discord_message(build(
            alert_title('\u{2705}', name, info),
            'success',
            [
                [alert_date(info, answer_data)],
                [info.first_at && `\u{23F1}\u{FE0F} First attempt ran ${human_time_diff(info.first_at, Temporal.Now.instant())} earlier.`, 'green']
            ],
            footer
        ));
    }

    if (problem_lines.length) {
        await send_discord_message(build(
            alert_title('\u{26A0}\u{FE0F}', name, info, 'posted with problems'),
            'warn',
            [
                [alert_date(info, answer_data)],
                ...problem_lines,
                ['\u{26D4} Not retried - the rest of the batch was posted.']
            ],
            footer
        ));
    }

    res.status(200).send(response);

});
