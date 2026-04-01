import fetch from "node-fetch";
import {
    dayDiff,
    getUTCDateDisplay,
    midnightInZone,
    modifyDays,
    setTimeInZone, utcYMD
} from "./helpers.mjs";

const reset_timezone = 'America/New_York';
const start_puzzle_date = midnightInZone('2026-03-23', reset_timezone);
const start_puzzle_number = 1;
const scheduled_time = {
    'hours': 21,
    'minutes': 0
};

function ymdSlash(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}/${m}/${d}`;
}


async function getAnswer( targetDate ) {
    
    const date_string = ymdSlash( targetDate );
    const keyword_url = `https://keyword-client-prod.red.aws.wapo.pub/levels/${date_string}.json`;
    
    const response = await fetch(keyword_url);
    const data = await response.json();
    
    if ( data ) {
        return data.answer;
    } else {
        return '';
    }
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
        
        let puzzleDate = modifyDays( published, i );
        let answer = await getAnswer( puzzleDate );
        
        if ( answer ) {
            answers.push( answer );
        }
        
        i++;
    }
    
    return {
        'type': 'Keyword',
        'publishedDate': getUTCDateDisplay( published ),
        'scheduledDate': getUTCDateDisplay( scheduled, true ),
        'startingNumber': start,
        'answers': answers
    };
    
}