import 'dotenv/config';
import {
    convertDateForSQL,
    getCurrentDayInTimezone,
    getSpecificDay,
    proxyWebsite
} from "./helpers.mjs";

const Config = {
    number: 1,
    date: getSpecificDay('2026-01-29'),
    schedule: {
        h: 2,
        m: 10
    },
    tz: 'America/Chicago'
}

async function getAnswerJson( date_string ) {
    let response;
    const fetch_url = `https://www.parseword.com/puzzles/${date_string}.json`;
    
    if (process.env.NODE_ENV === 'production') {
        return await proxyWebsite( fetch_url );
    } else {
        response = await fetch(fetch_url);
        return await response.json();
    }
}

async function getAnswer(date_string) {
    
    const json_data = await getAnswerJson(date_string);
    let mutation_answers = [];
    let answer = null;
    
    if (json_data) {
        let mutations = json_data['mutations'];
        answer = json_data['solution'];
        
        for (let i = 0; i < mutations.length; i++) {
            mutation_answers.push({
                'before': mutations[i]['before'] ?? null,
                'after': mutations[i]['after'] ?? null,
                'type': mutations[i]['type'] ?? null,
                'indicator': mutations[i]['indicator'] ?? null,
            });
        }
    }
    
    return {
        'answer': answer,
        'extra': mutation_answers,
    }
}

export async function getAnswers( date_string, number_to_get) {
    
    let date;
    if ( date_string === null ) {
        date = getCurrentDayInTimezone(Config.tz);
    } else {
        date = getSpecificDay(date_string);
    }
    
    const published = date.toString();
    const scheduled = convertDateForSQL(date, Config.schedule.h, Config.schedule.m);
    
    let puzzleNumber = Config.number + date.since(Config.date).days;
    let answers = [];
    
    for( let i = 0; i < number_to_get; i++ ) {
        let answer = await getAnswer( date.add({days: i}).toString() );
        if ( answer.answer !== null ) {
            answers.push( answer );
        }
    }
    
    answers = answers.map(a => a.answer +  ' |~~~~| ' + JSON.stringify(a.extra));
    
    return {
        'type': 'Parseword',
        'publishedDate': published,
        'scheduledDate': scheduled,
        'startingNumber': puzzleNumber,
        'answers': answers
    };
    
}