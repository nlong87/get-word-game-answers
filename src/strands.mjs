import fetch from "node-fetch";
import {
    convertDateForSQL,
    getCurrentDayInTimezone,
    getSpecificDay
} from "./helpers.mjs";

const Config = {
    number: 1107,
    date: getSpecificDay('2026-09-08'),
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
    let answerSchedule = [];
    
    for ( let i = 0; i < number_to_get; i++ ) {
        
        const day = date.add({days: i});
        const puzzle = await getAnswer( day );
        
        // NYT hasn't published this far ahead yet, so stop rather than leaving a hole.
        if ( !puzzle || puzzle.status !== 'OK' ) {
            break;
        }
        
        answers.push( formatStrandsAnswer( puzzle ) );
        
        // Strands ids aren't monotonic by date (1109, 1111, 1110), so carry each puzzle's own
        // number instead of letting it be extrapolated from startingNumber.
        answerSchedule.push({
            'publishedDate': puzzle.printDate,
            'scheduledDate': convertDateForSQL( day.subtract({days: 1}), Config.schedule.h, Config.schedule.m ),
            'number': puzzle.id
        });
    }
    
    return {
        'type': 'NYT Strands',
        'publishedDate': published,
        'scheduledDate': scheduled,
        'startingNumber': answerSchedule.length ? answerSchedule[0].number : puzzleNumber,
        'answers': answers,
        'answerSchedule': answerSchedule
    };
    
}
