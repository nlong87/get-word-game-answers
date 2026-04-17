import fetch from "node-fetch";
import {
    convertDateForSQL,
    getCurrentDayInTimezone,
    getSpecificDay
} from "./helpers.mjs";

const Config = {
    number: 0,
    date: getSpecificDay('2022-09-18'),
    schedule: {
        h: 14,
        m: 0
    },
    tz: 'Australia/Sydney'
}
let api_url = "https://api.contexto.me/machado/en/giveup/";
let hint_url = "https://api.contexto.me/machado/en/tip/";

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
    
    let date;
    if ( date_string === null ) {
        date = getCurrentDayInTimezone(Config.tz);
    } else {
        date = getSpecificDay(date_string);
    }
    
    const published = date.toString();
    const scheduled = convertDateForSQL( date.subtract({days: 1}), Config.schedule.h, Config.schedule.m );
    
    let diff = date.since(Config.date).days;
    let puzzleNumber = Config.number + diff;
    let answers = [];
    
    for( let i = 0; i < number_to_get; i++ ) {
        let answer = await getAnswer( puzzleNumber+i );
        if ( answer ) {
            answers.push( answer );
        }
    }
    
    return {
        'type': 'Contexto',
        'publishedDate': published,
        'scheduledDate': scheduled,
        'startingNumber': puzzleNumber,
        'answers': answers
    };

}