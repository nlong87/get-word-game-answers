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

async function getAnswer( targetDate, bonus = false ) {
    
    const date_string = ymdSlash( targetDate );
    let keyword_url;
    if ( bonus ) {
        keyword_url = `https://games-service-prod.site.aws.wapo.pub/on-the-record/levels/wager/${date_string}`;
    } else {
        keyword_url = `https://games-service-prod.site.aws.wapo.pub/on-the-record/levels/questions/${date_string}`;
    }
    const response = await fetch(keyword_url);
    const text = await response.text();
    if ( !text ) return null;
    try {
        const data = JSON.parse(text);
        let answers = [];
        
        if ( data && data.hasOwnProperty('questions') ) {
            answers = data.questions.map( (item) => { return item.answers[0]; })
            return answers.join(' |~~| ');
        } else {
            return '';
        }
    } catch {
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
        
        let d = date.add({ days: i });
        let answer = await getAnswer(d);
        let bonus = '';
        
        // Check if the current date is a Friday
        if (d.dayOfWeek === 5) {
            bonus = await getAnswer(d, true);
        }
        
        if (answer) {
            if ( bonus ) {
                answer = answer.concat(' |~~~~| ' + bonus);
            }
            answers.push(answer);
        }
        
        i++;
    }
    
    return {
        'type': 'On the Record',
        'publishedDate': published,
        'scheduledDate': scheduled,
        'startingNumber': puzzleNumber,
        'answers': answers
    };
}