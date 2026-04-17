import fetch from "node-fetch";
import {JSDOM } from "jsdom";
import JSON5 from "json5";
import {
    convertDateForSQL,
    getCurrentDayInTimezone,
    getSpecificDay,
} from "./helpers.mjs";

const Config = {
    number: 1,
    date: getSpecificDay('2025-10-20'),
    schedule: {
        h: 3,
        m: 15
    },
    tz: 'America/Los_Angeles'
}
const answer_base_url = 'https://www.newyorker.com/puzzles-and-games-dept/shuffalo/';

function ymdSlash(date) {
    const y = date.year;
    const m = String(date.month).padStart(2, '0');
    const d = String(date.day).padStart(2, '0');
    return `${y}/${m}/${d}`;
}

/**
 * Retrieves the answer based on the provided date string.
 *
 * @returns {Promise} The promise representing the response in JSON format.
 * @throws {Error} if there is an issue with the fetch request or response.
 * @param date
 */
async function getAnswer( date ) {
    
    const ymd = ymdSlash(date);
    const response = await fetch(answer_base_url + ymd );
    const html = await response.text();
    const puzzlesAndGames = await extractPuzzlesAndGames( html );
    const answers = [];

    if ( puzzlesAndGames !== null ) {
        
        let data = puzzlesAndGames.game.data;
        for( let i = 0; i < data.levels.length; i++ ) {
            answers.push( data.levels[i].recommendedSolution );
        }
    }
    
    return answers;
    
}


async function extractPuzzlesAndGames(html) {
    // Parse HTML into a DOM
    const dom = new JSDOM(html);
    const scripts = dom.window.document.querySelectorAll("script");
    
    for (const script of scripts) {
        const content = script.textContent || "";
        
        // Look for the key name in the script’s text
        if (content.includes('"puzzlesAndGames"') || content.includes("'puzzlesAndGames'")) {
            // Try to extract a JSON-like object block
            const match = content.match(/\{[\s\S]*"puzzlesAndGames"[\s\S]*\}/);
            
            if (match) {
                const jsonBlock = match[0];
                
                try {
                    // Use JSON5 to tolerate non-strict syntax
                    const data = JSON5.parse(jsonBlock);
                    
                    // Confirm the property actually exists
                    if (data.transformed.puzzlesAndGames) {
                        return data.transformed.puzzlesAndGames;
                    }
                } catch (err) {
                    console.warn("Failed to parse JSON in script:", err.message);
                }
            }
        }
    }
    
    return null;
}

export async function getAnswers( date_string, number_to_get ) {
    
    let date;
    if (date_string === null) {
        date = getCurrentDayInTimezone(Config.tz);
    } else {
        date = getSpecificDay(date_string);
    }
    
    const published = date.toString();
    const scheduled = convertDateForSQL(date, Config.schedule.h, Config.schedule.m);
    const diff = date.since(Config.date).days;
    const puzzleNumber = Config.number + diff;
    
    let answers = [];
    let i = 0;
    while( i < number_to_get ) {
        const answer = await getAnswer( date.add({ days: i } ) );
        answers.push( answer.join(' |~~| ') );
        i++;
    }
    
    return {
        'type': 'Shuffalo',
        'publishedDate': published,
        'scheduledDate': scheduled,
        'startingNumber': puzzleNumber,
        'answers': answers
    };
    
}