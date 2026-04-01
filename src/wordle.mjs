import fetch from "node-fetch";
import {addDays, getDateDisplay, getDayDifference, subDays} from "./helpers.mjs";

const api_url = "https://www.nytimes.com/svc/wordle/v2/";
const start_puzzle_date = "May 30 2023";
const start_puzzle_number = 710;
const scheduled_time = {
    'hours': 18,
    'minutes': 0
};

function leadingZero( string ) {
    return ("0" + string).slice(-2);
}

async function getAnswer( date_string ) {

    const date = new Date( date_string );
    const month = leadingZero( date.getUTCMonth()+1 );
    const day = leadingZero( date.getUTCDate() );
    let file_name = date.getUTCFullYear() + '-' + month + '-' + day + '.json';
    
    return fetch( api_url + file_name )
        .then((response) => response.json())
        .then((data) =>
            {
                
                return data.solution.toUpperCase();
            }
        
        );
    
}

export async function getAnswers( date_string, number_to_get ) {
    
    let date = new Date( date_string );
    let answers = [];
    
    let published = new Date(date_string);
    let scheduled = subDays( published, 1 )
        scheduled.setHours( scheduled_time.hours );
        scheduled.setMinutes( scheduled_time.minutes );
    
    const diff = getDayDifference( start_puzzle_date, date_string );
    const start = start_puzzle_number + diff;
    
    for( let i = 0; i < number_to_get; i++ ) {
        
        let targetDate = addDays( date, i );
        
        let answer = await getAnswer( targetDate );
        answers.push( answer );
    }
    
    return {
        'type': 'Wordle',
        'publishedDate': getDateDisplay( published ),
        'scheduledDate': getDateDisplay( scheduled, true ),
        'startingNumber': start,
        'answers': answers
    };
    
}