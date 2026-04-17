import fetch from "node-fetch";
import {
    convertDateForSQL,
    getCurrentDayInTimezone,
    getSpecificDay,
} from "./helpers.mjs";

const Config = {
    number: 710,
    date: getSpecificDay('2023-05-30'),
    schedule: {
        h: 18,
        m: 0
    },
    tz: 'Etc/UTC'
}
const api_url = "https://www.nytimes.com/svc/wordle/v2/";

async function getAnswer( date ) {

    const date_string = date.toString();
    const url = api_url + date_string + '.json';
    
    const response = await fetch(url);
    const data = await response.json();
    
    return data.solution.toUpperCase();
}

export async function getAnswers( date_string, number_to_get ) {
    
    let date;
    if (date_string === null) {
        date = getCurrentDayInTimezone(Config.tz);
    } else {
        date = getSpecificDay(date_string);
    }
    
    const published = date.toString();
    const scheduled = convertDateForSQL(date.subtract({days: 1}), Config.schedule.h, Config.schedule.m);
    const diff = date.since(Config.date).days;
    const puzzleNumber = Config.number + diff;
    
    let answers = [];
    
    for( let i = 0; i < number_to_get; i++ ) {
        
        const answer = await getAnswer( date.add( { days: i } ) );
        answers.push( answer );
    }
    
    return {
        'type': 'Wordle',
        'publishedDate': published,
        'scheduledDate': scheduled,
        'startingNumber': puzzleNumber,
        'answers': answers
    };
    
}