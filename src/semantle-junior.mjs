import {getDateDisplay, getDayDifference, subDays} from "./helpers.mjs";
import fetch from "node-fetch";

const gameStartDays = 19134;
let start_date = new Date('June 12, 2023');
let start_number = 386;
let scheduled_time = {
    'hours': 14,
    'minutes': 0
}

function getPuzzleNumber( day ) {
    return day - gameStartDays;
}

async function getSecretWord(day) {
    
    let puzzleNumber = getPuzzleNumber(day);
    let url = 'https://server.semantle.com/semantle/junior/game/' + puzzleNumber;
    
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Accept': 'application/json, text/javascript, */*'
        }
    })
    
    const json = await response.json();
    return json['secretWord'];
}

export async function getAnswers( date_string, number_to_get) {
    
    let target_date = new Date(date_string);
    let now = target_date.getTime();
    
    // 86400000 = Day in Milliseconds
    let today = Math.floor(now / 86400000);
    
    let day_diff = getDayDifference( start_date, date_string );
    let answers = [];
    
    let published = new Date(date_string);
    let scheduled = subDays( published, 1 );
    scheduled.setHours( scheduled_time.hours );
    scheduled.setMinutes( scheduled_time.minutes );
    let answer;
    
    for( let i = 0; i < number_to_get; i++ ) {
        await getSecretWord( today + i ).then(r => answer = r.toUpperCase() );
        answers.push( answer );
    }
    
    return {
        'type': 'Semantle Junior',
        'publishedDate': getDateDisplay( published ),
        'scheduledDate': getDateDisplay( scheduled, true ),
        'startingNumber': start_number + day_diff,
        'answers': answers
    };
}