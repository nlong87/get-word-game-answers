import fetch from "node-fetch";
import {
    convertDateForSQL,
    getCurrentDayInTimezone,
    getSpecificDay
} from "./helpers.mjs";

/*
Config.number is the number NYT *displays*, which is not the `id` in the JSON payload. The id is
an internal identifier and jumps around (2026-09-13 is id 1110 but shows as #924); the displayed
number is simply the count of days since launch. Anchoring at launch makes that self-evident.
*/
const Config = {
    number: 1,
    date: getSpecificDay('2024-03-04'), // NYT Strands #1
    schedule: {
        h: 18,
        m: 0
    },
    tz: 'Etc/UTC'
}
const api_url = 'https://www.nytimes.com/svc/strands/v2/';

/**
 * Builds the answer string for a Strands payload.
 *
 * Shared with the Colorful Strands bonus puzzle, which returns the same field names.
 *
 * @param {Object} puzzle - A parsed Strands JSON payload.
 * @returns {string} spangram, theme words and clue joined with the extra-data delimiter.
 */
export function formatStrandsAnswer( puzzle ) {
    return {
        "answer": puzzle.themeCoords,
        "spangram": puzzle.spangram,
        "clue": puzzle.clue,
        "startingBoard": puzzle.startingBoard
    };
}

async function getAnswer( date ) {
    
    const response = await fetch( api_url + date.toString() + '.json', {
        method: 'GET',
        headers: {
            'Accept': 'application/json, text/javascript, */*'
        },
    });
    
    if ( !response.ok ) {
        return false;
    }
    
    return await response.json();
}

export async function getAnswers( date_string, number_to_get ) {
    
    let date;
    if ( date_string === null ) {
        date = getCurrentDayInTimezone(Config.tz);
    } else {
        date = getSpecificDay(date_string);
    }
    
    const published = date.toString();
    const scheduled = convertDateForSQL( date.subtract({days: 1}), Config.schedule.h, Config.schedule.m );
    const diff = date.since(Config.date).days;
    const puzzleNumber = Config.number + diff;
    
    let answers = [];
    
    for ( let i = 0; i < number_to_get; i++ ) {
        
        const puzzle = await getAnswer( date.add({days: i}) );
        
        // NYT hasn't published this far ahead yet, so stop rather than leaving a hole.
        if ( !puzzle || puzzle.status !== 'OK' ) {
            break;
        }
        
        answers.push( formatStrandsAnswer( puzzle ) );
    }
    
    // No answerSchedule: dates are consecutive and displayed numbers are sequential, so the plain
    // envelope describes this correctly. (It was added when the non-monotonic ids were mistaken
    // for the puzzle numbers.)
    return {
        'type': 'NYT Strands',
        'publishedDate': published,
        'scheduledDate': scheduled,
        'startingNumber': puzzleNumber,
        'answers': answers
    };
    
}
