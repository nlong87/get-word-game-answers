import './env.mjs';
import { pathToFileURL } from 'node:url';
import express from 'express';
import WPAPI from 'wpapi';
import {startXvfb} from "./browser.mjs";
import process_answers from "./process.mjs";

const PORT = process.env.PORT || 8080;
const isProd = process.env.NODE_ENV === 'production';

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
    }).catch(function (response) {
        console.log(response);
        return response;
    });
    
}

async function send_discord_message(message) {
    
    const discord_url = process.env.DISCORD_WEBHOOK;
    
    if (!discord_url) {
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
    }).catch(function (response) {
        console.log(response);
        return response;
    });
}

if (process.env.NODE_ENV !== 'production') {
    app.get('/post_answers', async (req, res) => {
        // just forward to the same handler
        req.method = 'POST';
        app.handle(req, res);
    });
}

app.post('/post_answers', async (req, res) => {
    // Optional: verify the request is from Cloud Scheduler
    const userAgent = req.headers['user-agent'] || '';
    if (isProd && !userAgent.includes('Google-Cloud-Scheduler')) {
        return res.status(403).send('Forbidden');
    }
    
    const puzzle_type = req.query.type || req.body.type;
    const amount = req.query.amount || req.body.amount;
    
    let answer_data;
    try {
        answer_data = await process_answers(puzzle_type, amount);
    } catch (error) {
        // Express 4 does not catch async rejections, so without this the process exits and
        // nothing is posted at all.
        console.error(`Unhandled failure processing ${puzzle_type}:`, error);
        await send_discord_message(`Posting Answers for ${puzzle_type} threw: ${error.message}`);
        return res.status(200).send({ error: error.message });
    }
    
    if (answer_data?.errors?.length) {
        for (const message of answer_data.errors) {
            await send_discord_message(`Posting Answers: ${message}`);
        }
    }
    
    if (answer_data) {
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
            }
        }
        await post_data(answer_data).then(r => res.status(200).send(r));
        
    } else {
        res.send(false);
    }
    
});