import fetch from "node-fetch";
import {
    getSpecificDay,
    getCurrentDayInTimezone,
    convertDateForSQL
} from "./helpers.mjs";

const Config = {
    number: 723,
    date: getSpecificDay('2024-02-16'),
    schedule: {
        h: 20,
        m: 15
    },
    tz: 'America/Puerto_Rico'
}

const guessIds = [481,217,283,189,294,18,110,207];
const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";
const sec_ua = "`\"Chromium`\";v=`\"134`\", `\"Not:A-Brand`\";v=`\"24`\", `\"Google Chrome`\";v=`\"134`\"";
const default_headers = {
    "Accept": "*/*",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Accept-Language": "en-US,en;q=0.9",
    "Accepts": "application/json",
    "Cache-Control": "no-cache",
    "DNT": 1,
    "Pragma": "no-cache",
    "Referer": "https://poeltl.nbpa.com/",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "sec-ch-ua": sec_ua,
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"Windows\"",
    "User-Agent": ua
};

let headers = null;

function resetHeaders() {
    headers = {...default_headers};
}

async function makeGuess(guess_id, historic_date = '') {
    
    let fetch_url;
    
    if (historic_date) {
        fetch_url = `https://poeltl.nbpa.com/historic/${historic_date}/guess/${guess_id}`
    } else {
        fetch_url = `https://poeltl.nbpa.com/api/guess/${guess_id}`;
    }
    
    const guess = await fetch(fetch_url, {
        "headers": headers,
        "content-type": "application/json",
        "method": "GET"
    });
    
    return await guess.json();
}

async function getAnswerFromSite( date = '') {
    
    // Reset headers to default values.
    resetHeaders();
    
    const fetch_url = (date) ? `https://poeltl.nbpa.com/historic/${date}` : "https://poeltl.nbpa.com/api/sync";
    let answer = false;
    
    const initialRequest = await fetch(fetch_url, {
        "headers": headers,
        "body": null,
        "method": "GET"
    });
    
    if (initialRequest.status === 200) {
        // Set the request cookies from the initial request so we can make subsequent requests.
        headers['cookie'] = initialRequest.headers.get('set-cookie');
        // Add referrer if date is provided.
        if ( date ) {
            headers['Referer'] = fetch_url;
        }
        
        let response;
        
        for (let i = 0; i < guessIds.length; i++) {
            response = await makeGuess(guessIds[i], date);
            if (response && response.mysteryPlayer) {
                answer = response.mysteryPlayer.firstname + " " + response.mysteryPlayer.lastname;
                break;
            }
        }
    }
    
    return answer;
}

export async function getAnswer(date_string = '') {
    
    let date;
    if ( date_string === null ) {
        date = getCurrentDayInTimezone(Config.tz);
    } else {
        date = getSpecificDay(date_string);
    }
    
    const latestDate = getCurrentDayInTimezone(Config.tz);
    
    const published = date.toString();
    const scheduled = convertDateForSQL( date.subtract({days: 1}), Config.schedule.h, Config.schedule.m );
    const diff = date.since(Config.date).days;
    const puzzleNumber = Config.number + diff;
    
    const isCurrent = (latestDate.toString() === date.toString() );
    
    let answers = [];
    let answer = null;
    
    let date_param = (isCurrent) ? '' : date.toString();
    await getAnswerFromSite(date_param).then(r => answer = r);
    if (!answer) return false;
    
    answers.push(answer);
    
    return {
        'type': 'Poeltl',
        'publishedDate': published,
        'scheduledDate': scheduled,
        'startingNumber': puzzleNumber,
        'answers': answers
    };
}