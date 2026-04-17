import fetch from "node-fetch";
import {
    convertDateForSQL,
    getCurrentDayInTimezone,
    getSpecificDay
} from "./helpers.mjs";

const Config = {
    number: 1,
    date: getSpecificDay('2023-06-22'),
    schedule: {
        h: 18,
        m: 0
    },
    tz: 'Etc/UTC'
}

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
    
    const all_answers = await getAllAnswers();
    
    let answers = all_answers.slice(diff, diff + number_to_get );
    
    if (!answers) {
        return false;
    }
   
    answers = answers.map(a => a.answer +  ' |~~~~| ' + a.text);
    
    return {
        'type': 'Searchle',
        'publishedDate': published,
        'scheduledDate': scheduled,
        'startingNumber': puzzleNumber,
        'answers': answers
    };
    
}