import fetch from "node-fetch";
import {JSDOM } from "jsdom";
import JSON5 from "json5";
import {addDays, getDateDisplay, getDayDifference, subDays} from "./helpers.mjs";

const start_date = 'October 20 2025';
const start_puzzle_number = 1;
const scheduled_time = {
    'hours': 3,
    'minutes': 15
};
const answer_base_url = 'https://www.newyorker.com/puzzles-and-games-dept/shuffalo/';

/**
 * Retrieves the answer based on the provided date string.
 *
 * @param {string} date_string - The date string used to fetch the answer.
 * @returns {Promise} The promise representing the response in JSON format.
 * @throws {Error} if there is an issue with the fetch request or response.
 */
async function getAnswer( date_string ) {
    
    const dateObject = new Date(date_string);
    let year = dateObject.getFullYear();
    let month = dateObject.getMonth()+1;
    let dt = dateObject.getDate();
    
    if (dt < 10) {
        dt = '0' + dt;
    }
    if (month < 10) {
        month = '0' + month;
    }
    const response = await fetch(answer_base_url + year + '/' + month + '/' + dt );
    
    let html = await response.text();
    
    const puzzlesAndGames = await extractPuzzlesAndGames( html );
    let answers = [];
    

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
    
    let day_diff = getDayDifference( start_date, date_string );
    let start = start_puzzle_number+day_diff;
    let published = new Date( date_string );
    let scheduled = published;
    scheduled.setHours( scheduled_time.hours );
    scheduled.setMinutes( scheduled_time.minutes );
    
    let puzzleDate = new Date(date_string);
    let answers = [];
    let i = 0;
    let answer;
    while( i < number_to_get ) {
        
        puzzleDate = addDays( date_string, i );
        answer = await getAnswer( `${puzzleDate.toLocaleDateString("en-US",{timeZone: 'Europe/Prague'})}` );
        
        answers.push( answer.join(' |~~| ') );
        i++;
    }
    
    return {
        'type': 'Shuffalo',
        'publishedDate': getDateDisplay( published ),
        'scheduledDate': getDateDisplay( scheduled, true ),
        'startingNumber': start,
        'answers': answers
    };
    
}
// await getAnswers('12/20/2025', 3).then( r => console.log(r));