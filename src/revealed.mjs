import fetch from "node-fetch";
import { HttpsProxyAgent } from "https-proxy-agent";
import {
    dayDiff,
    getUTCDateDisplay,
    midnightInZone,
    modifyDays,
    setTimeInZone, utcYMD
} from "./helpers.mjs";

const revealed_url = "https://www.britannica.com/games/revealed";
const reset_timezone = 'America/New_York';
const start_puzzle_date = midnightInZone('2026-02-22', reset_timezone);
const start_puzzle_number = 310;
const scheduled_time = {
    'hours': 21,
    'minutes': 0
};
let cachedGameData = [];

function extractGameData(html) {
    // Match all the script tags
    const scriptTagRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    
    while ((match = scriptTagRegex.exec(html)) !== null) {
        const scriptContent = match[1];
        
        // Find the script content that contains the gameData
        if (
            scriptContent.includes("self.__next_f.push") &&
            scriptContent.includes('\\"gameData\\"')
        ) {
            const pushMatch = scriptContent.match(
                /self\.__next_f\.push\(\[1,\s*("(?:[^"\\]|\\.)*")\]\)/
            );
            
            if (!pushMatch) continue;
            
            let innerString;
            try {
                innerString = JSON.parse(pushMatch[1]);
            } catch (e) {
                console.error("Failed to parse inner string:", e.message);
                continue;
            }
            
            // Strip the RSC row prefix (e.g. "13:" or "ab3f:") before the JSON value
            const colonIndex = innerString.indexOf(":");
            if (colonIndex === -1) continue;
            const jsonPart = innerString.slice(colonIndex + 1);
            
            let payload;
            try {
                payload = JSON.parse(jsonPart);
            } catch (e) {
                console.error("Failed to parse payload:", e.message);
                continue;
            }
            
            // Find gameData within the parsed array
            const dataChunk = JSON.stringify(payload);
            
            const gameDataIndex = dataChunk.indexOf('"gameData"');
            if (gameDataIndex === -1) continue;
            
            const valueColonIndex = dataChunk.indexOf(":", gameDataIndex);
            const valueStart = dataChunk.indexOf("{", valueColonIndex);
            
            let depth = 0;
            let valueEnd = -1;
            for (let i = valueStart; i < dataChunk.length; i++) {
                if (dataChunk[i] === "{") depth++;
                else if (dataChunk[i] === "}") {
                    depth--;
                    if (depth === 0) {
                        valueEnd = i;
                        break;
                    }
                }
            }
            
            if (valueEnd === -1) continue;
            
            const gameDataJson = dataChunk.slice(valueStart, valueEnd + 1);
            
            try {
                return JSON.parse(gameDataJson).data;
            } catch (e) {
                console.error("Failed to parse gameData JSON:", e.message);
            }
        }
    }
    
    return null;
}

async function getResponseText() {
    
    let response;
    if (process.env.NODE_ENV === 'production') {
        
        const agent = new HttpsProxyAgent(
            `https://${process.env.PROXY_USERNAME}:${process.env.PROXY_PASSWORD}@unblock.oxylabs.io:60000`
        );
        
        // We recommend accepting our certificate instead of allowing insecure (http) traffic
        process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;
        
        const headers = {
            'X-Oxylabs-Render': 'html',
        }
        
        response = await fetch(revealed_url, {
            method: 'get',
            headers: headers,
            agent: agent,
        });
        
    } else {
        response = await fetch(revealed_url);
    }
    
    return await response.text();
}

async function getGameData() {
    
    if (Array.isArray(cachedGameData) && cachedGameData.length === 0) {
        
        const html = await getResponseText();
        cachedGameData = extractGameData(html);
    }
    
    return cachedGameData;
}

async function getPuzzle( targetDate ) {
    
    let date_string = utcYMD(targetDate);
    let gameData = await getGameData();
    
    return (gameData) ? gameData.find( x => x['published_date'] === date_string) : null;
}

export async function getAnswers( date_string, number_to_get ) {
    
    let answers = [];
    
    const published = midnightInZone( date_string, reset_timezone );
    const scheduled = setTimeInZone(
        modifyDays( published, 1, false ),
        scheduled_time.hours,
        scheduled_time.minutes,
        reset_timezone
    );
    
    const diff = dayDiff( published, start_puzzle_date );
    const start = start_puzzle_number + diff;
    
    let i = 0;
    while( i < number_to_get ) {
        
        let puzzleDate = modifyDays( midnightInZone( date_string, reset_timezone ), i );
        let puzzle = await getPuzzle( puzzleDate );
        
        if ( puzzle ) {
            answers.push( puzzle.title );
        }
        
        i++;
    }
    
    return {
        'type': 'Revealed',
        'publishedDate': getUTCDateDisplay( published ),
        'scheduledDate': getUTCDateDisplay( scheduled, true ),
        'startingNumber': start,
        'answers': answers
    };
    
}
// await getAnswers('2026-03-24', 2).then( result => console.log(result) );
