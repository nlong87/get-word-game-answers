import fetch from "node-fetch";
import {getDateDisplay, getDayDifference, subDays} from "./helpers.mjs";

let api_url = "https://api.contexto.me/machado/en/giveup/";
let hint_url = "https://api.contexto.me/machado/en/tip/";
const start_date = 'September 18 2022';
const start_puzzle_number = 0;
const scheduled_time = {
    'hours': 7,
    'minutes': 0
};

async function getAnswer( puzzleNumber ) {

    const response = await fetch(api_url + puzzleNumber, {
        method: 'GET',
        headers: {
            'Accept': 'application/json, text/javascript, */*'
        },
    });

    const data = await response.json();
    if ( !data.word ) {
        return '';
    }
    const hints = await getHints( puzzleNumber );
    
    return data.word.toUpperCase() + ' |~~~~| ' + hints.join(', ');
}

async function getHints( puzzleNumber ) {
    
    let start = 20;
    let end = 10;
    
    let words = [];
    
    for( let i = start; i > end; i-- ) {
        await getHint( puzzleNumber, i).then( r => words.push(r) );
    }
    
    return words;
}

async function getHint( puzzleNumber, number ) {
    
    const response = await fetch(hint_url + puzzleNumber + "/" + number, {
        method: 'GET',
        headers: {
            'Accept': 'application/json, text/javascript, */*'
        },
    });
    
    const data = await response.json();
    
    return (data.word) ? data.word.toUpperCase() : '';
    
}

export async function getAnswers( date_string, number_to_get ) {
    
    let day_diff = getDayDifference( start_date, date_string );
    let puzzleNumber = start_puzzle_number + day_diff;
    let answers = [];
    
    let published = new Date(date_string);
    let scheduled = subDays( published, 1 )
        scheduled.setHours( scheduled_time.hours );
        scheduled.setMinutes( scheduled_time.minutes );
    
    for( let i = 0; i < number_to_get; i++ ) {
        let answer = await getAnswer( puzzleNumber+i );
        if ( answer ) {
            answers.push( answer );
        }
    }
    
    return {
        'type': 'Contexto',
        'publishedDate': getDateDisplay( published ),
        'scheduledDate': getDateDisplay( scheduled, true ),
        'startingNumber': start_puzzle_number + day_diff,
        'answers': answers
    };

}