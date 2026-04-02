import fetch from 'node-fetch';
import {
    getDayDifference, getUTCDateDisplay,
    midnightInZone,
    modifyDays,
    utcYMD
} from "./helpers.mjs";

const start_date = '2026-01-29';
const start_puzzle_number = 1;
const scheduled_time = {
    'hours': 18,
    'minutes': 0
};
const reset_timezone = 'America/Los_Angeles';

async function getAnswerJson( date ) {
    let date_string = utcYMD( date );
    const response = await fetch(`https://www.parseword.com/puzzles/${date_string}.json`, {
        method: 'GET',
        headers: {
            'Accept': 'application/json, text/javascript, */*'
        },
    });
    
    return await response.json();
}

async function getAnswer(date) {
    
    const json_data = await getAnswerJson(date);
    let mutation_answers = [];
    let answer;
    
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
    
    let published = midnightInZone(date_string, reset_timezone);
    let scheduled = modifyDays( published, 1, false);
    
    scheduled.setHours( scheduled_time.hours );
    scheduled.setMinutes( scheduled_time.minutes );
    
    let day_diff = getDayDifference( start_date, date_string );
    
    let puzzleNumber = start_puzzle_number + day_diff;
    let answers = [];
    let answerDate = published;
    
    for( let i = 0; i < number_to_get; i++ ) {
        let answer = await getAnswer( answerDate );
        answers.push( answer );
        answerDate = modifyDays( answerDate, 1 );
    }
    
    answers = answers.map(a => a.answer +  ' |~~~~| ' + JSON.stringify(a.extra));
    
    return {
        'type': 'Parseword',
        'publishedDate': getUTCDateDisplay( published ),
        'scheduledDate': getUTCDateDisplay( scheduled, true ),
        'startingNumber': puzzleNumber,
        'answers': answers
    };
    
}