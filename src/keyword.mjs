import fetch from "node-fetch";
import {
    convertDateForSQL,
    getCurrentDayInTimezone,
    getSpecificDay
} from "./helpers.mjs";

const Config = {
    number: 1,
    date: getSpecificDay('2026-03-23'),
    schedule: {
        h: 21,
        m: 0
    },
    tz: 'America/New_York'
}

function ymdSlash(date) {
    const y = date.year;
    const m = String(date.month).padStart(2, '0');
    const d = String(date.day).padStart(2, '0');
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
    
    let i = 0;
    while( i < number_to_get ) {
        
        let answer = await getAnswer( date.add({days: i}) );
        
        if ( answer ) {
            answers.push( answer );
        }
        
        i++;
    }
    
    return {
        'type': 'Keyword',
        'publishedDate': published,
        'scheduledDate': scheduled,
        'startingNumber': puzzleNumber,
        'answers': answers
    };
    
}