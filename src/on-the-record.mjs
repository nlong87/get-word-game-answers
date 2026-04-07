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
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    return `${y}/${m}/${d}`;
}


async function getAnswer( targetDate ) {
    
    const date_string = ymdSlash( targetDate );
    const keyword_url = `https://games-service-prod.site.aws.wapo.pub/on-the-record/levels/questions/${date_string}`;
    
    const response = await fetch(keyword_url);
    const data = await response.json();
    let answers = [];
    
    if ( data && data.hasOwnProperty('questions') ) {
        answers = data.questions.map( (item) => { return item.answers[0]; })
        return answers.join(' |~~| ');
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
        'type': 'On the Record',
        'publishedDate': getUTCDateDisplay( published ),
        'scheduledDate': getUTCDateDisplay( scheduled, true ),
        'startingNumber': start,
        'answers': answers
    };
}
// getAnswers( '2026-03-23', 5).then(r => console.log(r));