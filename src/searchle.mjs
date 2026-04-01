import fetch from "node-fetch";
import {getDateDisplay, getDayDifference, subDays} from "./helpers.mjs";

const start_puzzle_date = "June 22 2023";
const start_puzzle_number = 1;
const scheduled_time = {
    'hours': 18,
    'minutes': 0
};

async function getAllAnswers() {
    
    const str = await getScriptContents();
    
    const regex = /\[[^\]]*text:"should i explore a city by"[^\]]*\]/g;
    
    const matches = str.match(regex);
    
    if (matches) {
        return Function("return " + matches[0])();
    }
    
    return false;
}

async function getScriptContents() {
    const js_file = 'https://searchle.net/static/js/main.a220a4dd.js';
    
    const response = await fetch(js_file);
    return await response.text();
}

export async function getAnswers(date_string, number_to_get) {
    
    const published = new Date(date_string);
    const scheduled = subDays( published, 1 );
    scheduled.setHours(scheduled_time.hours);
    scheduled.setMinutes(scheduled_time.minutes);
    
    const diff = getDayDifference(start_puzzle_date, published.toDateString());
    const index_diff = getDayDifference(start_puzzle_date, date_string);
    
    const start = start_puzzle_number + diff;
    
    const all_answers = await getAllAnswers();
    
    let answers = all_answers.slice(index_diff, index_diff + number_to_get );
    
    if (!answers) {
        return false;
    }
   
    answers = answers.map(a => a.answer +  ' |~~~~| ' + a.text);
    
    return {
        'type': 'Searchle',
        'publishedDate': getDateDisplay(published),
        'scheduledDate': getDateDisplay(scheduled, true),
        'startingNumber': start,
        'answers': answers
    };
    
}
// await getAnswers('January 25 2026', 7).then(r => console.dir(r) );