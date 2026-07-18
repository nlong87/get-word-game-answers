import 'dotenv/config';
import express from 'express';
import WPAPI from 'wpapi';
import {startXvfb} from "./browser.mjs";
import {get_answers} from "./get-answers.mjs";

const PORT = process.env.PORT || 8080;
const isProd = process.env.NODE_ENV === 'production';

const app = express();
app.use(express.json());
app.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
    if (isProd) {
        startXvfb();
    }
});


export async function manual_post_answers(puzzle_type, amount_to_return = 8, start_date = null) {
    
    let answer_data = [];
    answer_data = await process_answers(puzzle_type, amount_to_return, start_date).then(r => answer_data = r);
    
    if (answer_data) {
        return await post_data(answer_data);
    } else {
        return false;
    }
}

export async function process_answers(type, amount_to_return, start_date = null) {
    
    let data = [];
    
    switch (type) {
        
        case 'colordle':
            data = await get_answers('colordle', start_date, amount_to_return);
            break;
        case 'connections':
            data = await get_answers('connections', start_date, amount_to_return);
            break;
        case 'contexto':
            data = await get_answers('contexto', start_date, amount_to_return);
            break;
        case 'harmonies':
            data = await get_answers('harmonies', start_date, amount_to_return);
            break;
        case 'jumble':
            data = await get_answers('jumble', start_date, amount_to_return);
            break;
        case 'keyword':
            data = await get_answers('keyword', start_date, amount_to_return);
            break;
        case 'letroso':
            data = await get_answers('letroso', start_date, amount_to_return);
            break;
        case 'marveldle':
            data = await get_answers('marveldle', start_date, amount_to_return);
            break;
        case 'nerdle':
            data = await get_answers('nerdle', start_date, amount_to_return);
            break;
        case 'on_the_record':
            data = await get_answers('on_the_record', start_date, amount_to_return);
            break;
        case 'parseword':
            data = await get_answers('parseword', start_date, amount_to_return);
            break;
        case 'phrazle':
            data = await get_answers('phrazle', start_date, amount_to_return);
            break;
        case 'pimantle':
            data = await get_answers('pimantle', start_date, amount_to_return);
            break;
        case 'poeltl':
            data = await get_answers('poeltl', start_date, amount_to_return);
            break;
        case 'quordle':
            data = await get_answers('quordle', start_date, amount_to_return);
            break;
        case 'revealed':
            data = await get_answers('revealed', start_date, amount_to_return);
            break;
        case 'searchle':
            data = await get_answers('searchle', start_date, amount_to_return);
            break;
        case 'semantle-junior':
            data = await get_answers('semantle-junior', start_date, amount_to_return);
            break;
        case 'shuffalo':
            data = await get_answers('shuffalo', start_date, amount_to_return);
            break;
        case 'squareword':
            data = await get_answers('squareword', start_date, amount_to_return);
            break;
        case 'weaver':
            data = await get_answers('weaver', start_date, 8);
            break;
        case 'weaver-x':
            data = await get_answers('weaver-x', start_date, 8);
            break;
        case 'wordle':
            data = await get_answers('wordle', start_date, amount_to_return);
            break;
        
    }
    
    return data;
}

async function post_data(data) {
    
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
    const answer_data = await process_answers(puzzle_type, amount);
    
    if (answer_data) {
        const obj = answer_data[puzzle_type];
        if (
            process.env.NODE_ENV === 'production' &&
            Object.hasOwn(obj, 'answers') &&
            Array.isArray(obj.answers)
        ) {
            if (obj.answers.length === 0) {
                await send_discord_message(`Posting Answers for ${puzzle_type} failed to return any data.`);
            } else if ( obj.answers.length < amount) {
                await send_discord_message(`Posting Answers for ${puzzle_type} posted ${obj.answers.length} out of the ${amount} requested.`);
            }
        }
        await post_data(answer_data).then(r => res.status(200).send(r));
        
    } else {
        res.send(false);
    }
    
});