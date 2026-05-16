import {
    convertDateForSQL,
    getCurrentDayInTimezone,
    getSpecificDay, proxyWebsite
} from "./helpers.mjs";

const Config = {
    number: 310,
    date: getSpecificDay('2026-02-22'),
    schedule: {
        h: 21,
        m: 0
    },
    tz: 'America/Chicago'
}

const revealed_url = "https://www.britannica.com/games/revealed";
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
        
        return await proxyWebsite( revealed_url );
        
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
    
    let date_string = targetDate.toString();
    let gameData = await getGameData();
    
    return (gameData) ? gameData.find( x => x['published_date'] === date_string) : null;
}

export async function getAnswers(date_string, number_to_get) {
    
    let date;
    if (date_string === null) {
        date = getCurrentDayInTimezone(Config.tz);
    } else {
        date = getSpecificDay(date_string);
    }
    
    const published = date.toString();
    const scheduled = convertDateForSQL(date.subtract({days: 1}), Config.schedule.h, Config.schedule.m);
    const diff = date.since(Config.date).days;
    const puzzleNumber = Config.number + diff;
    
    let answers = [];
    
    let i = 0;
    while (i < number_to_get) {
        
        let puzzle = await getPuzzle(date.add({days: i}));
        
        if (puzzle) {
            answers.push(puzzle.title);
        }
        
        i++;
    }
    
    return {
        'type': 'Revealed',
        'publishedDate': published,
        'scheduledDate': scheduled,
        'startingNumber': puzzleNumber,
        'answers': answers
    };
    
}