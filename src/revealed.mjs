import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import {
    dayDiff,
    getUTCDateDisplay,
    midnightInZone,
    modifyDays,
    utcYMD
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
    let text;
    if (process.env.NODE_ENV === 'production') {
        
        puppeteer.use(StealthPlugin());
        
        const browser = await puppeteer.launch({
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ],
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
        });
        const page = await browser.newPage();
        
        const realUA = await browser.userAgent();
        const patchedUA = realUA.replace('HeadlessChrome', 'Chrome');
        
        const client = await page.createCDPSession();
        await client.send('Network.setUserAgentOverride', {
            userAgent: patchedUA,
        });
        
        response = await page.goto(revealed_url, {
            timeout: 60000,
            waitUntil: 'domcontentloaded',
        });
        
        text = await response.text();
        
        await browser.close();
        
    } else {
        response = await fetch(revealed_url);
        
        text = await response.text();
    }
    
    return text;
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
    let scheduled = modifyDays( published, 1, false);
    scheduled.setHours( scheduled_time.hours );
    scheduled.setMinutes( scheduled_time.minutes );
    
    
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
