import fetch from "node-fetch";
import {
    convertDateForSQL,
    getCurrentDayInTimezone,
    getSpecificDay,
} from "./helpers.mjs";

const Config = {
    number: 1,
    date: getSpecificDay('2022-02-01'),
    schedule: {
        h: 18,
        m: 0
    },
    tz: 'Etc/UTC'
}
const base_script = "https://squareword.org/";

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

async function getAnswersFromSite( date, answers_to_get = 1) {
    
    const answers = await getAllAnswers();
    if (!answers) {
        return false;
    }
    
    const marker_date = getSpecificDay('2026-01-27');
    const marker_index = answers.lastIndexOf('swatsthreeeasedalongdense');
    const date_diff = date.since(marker_date).days;
    
    let answer_selection = answers.slice((marker_index + date_diff), (marker_index + date_diff) + answers_to_get);
    let mapped = answer_selection.map(str => str.toUpperCase().match(/.{1,5}/g));
    
    return mapped.map(array => array.join(' |~~| '));
}

export async function getAnswers(date_string, number_to_get) {
    
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
    
    let answers = await getAnswersFromSite(date, number_to_get);
    
    if (!answers) {
        return false;
    }
    
    return {
        'type': 'Squareword',
        'publishedDate': published,
        'scheduledDate': scheduled,
        'startingNumber': puzzleNumber,
        'answers': answers
    };
    
}