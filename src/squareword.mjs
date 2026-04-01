import fetch from "node-fetch";
import {getDateDisplay, getDayDifference, subDays} from "./helpers.mjs";

const base_script = "https://squareword.org/";
const start_puzzle_date = "February 1 2022";
const start_puzzle_number = 1;
const scheduled_time = {
    'hours': 18,
    'minutes': 0
};

async function getScriptUrl(url, file_name) {
    
    const res = await fetch(url);
    const html = await res.text();
    
    // Regex to match index.<anything> (js, css, hashed files, etc.)
    const regex = new RegExp("assets\/" + file_name + "\.[a-zA-Z0-9._-]+\.js");
    
    const matches = html.match(regex);
    
    return (matches) ? base_script + matches[0] : false;
    
}

async function getAllAnswers() {
    
    let index_url = await getScriptUrl(base_script, 'index');
    if (!index_url) {
        return false;
    }
    
    let script_url = await getScriptUrl(index_url, 'script');
    if (!script_url) {
        return false;
    }
    
    const response = await fetch(script_url);
    const html = await response.text();
    return [...html.matchAll(/(\w{25})/g)].map(m => m[1]);
}

async function getAnswersFromSite(date_string, answers_to_get = 1) {
    
    const answers = await getAllAnswers();
    if (!answers) {
        return false;
    }
    
    const marker_date = '2026/01/27';
    const marker_index = answers.lastIndexOf('swatsthreeeasedalongdense');
    const date_diff = getDayDifference(marker_date, date_string);
    
    let answer_selection = answers.slice((marker_index + date_diff), (marker_index + date_diff) + answers_to_get);
    let mapped = answer_selection.map(str => str.toUpperCase().match(/.{1,5}/g));
    
    return mapped.map(array => array.join(' |~~| '));
}

export async function getAnswers(date_string, number_to_get) {
    
    const published = new Date(date_string);
    const scheduled = subDays( published, 1 );
    scheduled.setHours(scheduled_time.hours);
    scheduled.setMinutes(scheduled_time.minutes);
    
    const diff = getDayDifference(start_puzzle_date, published.toDateString());
    const start = start_puzzle_number + diff;
    
    let answers = await getAnswersFromSite(date_string, number_to_get);
    
    if (!answers) {
        return false;
    }
    
    return {
        'type': 'Squareword',
        'publishedDate': getDateDisplay(published),
        'scheduledDate': getDateDisplay(scheduled, true),
        'startingNumber': start,
        'answers': answers
    };
    
}
//await getAnswers('January 16 2026', 7).then(r => console.dir(r) )