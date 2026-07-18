import fetch from "node-fetch";
import {
    convertDateForSQL,
    getCurrentDayInTimezone,
    getSpecificDay
} from "./helpers.mjs";
import { colornames } from 'color-name-list';
import { getColordleAnswer } from "./_colordle-functions.js";

/*
This is the way Colordle gets the day number for the answer, we use our own way instead.

import moment from 'moment';

let startDay = moment([2023, 7, 7]);
let today = moment([]);
let dayOffset = 500;
let dayNum = today.diff(startDay, "days") + dayOffset;

*/

const Config = {
    number: 500,
    date: getSpecificDay('2023-08-07'),
    schedule: {
        h: 18,
        m: 0
    },
    tz: 'Etc/GMT-7'
}
const offset = 0;
let siteAnswers = [];


async function getAnswersFromSite() {
    if ( !siteAnswers.length ) {
        await fetch("https://colordle.ryantanen.com/colors.json", {
            headers: {
                "Content-Type": "application/json", Accept: "application/json",
            },
        }).then(function (response) {
            return response.json();
        }).then(data => siteAnswers = data);
    }
  
    return siteAnswers;
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
    const start = offset + diff;
    
    let answer_names = [];
    let answers = [];
    
    for (let i = start; i < start + number_to_get; i++) {
        let answer = await getColordleAnswer(i);
        if (answer) {
            answers.push(answer);
        }
    }
    
    // Search through colors from Color-Name-List to find the nice name for the answer
    // Colordle's answers are inconsistently having and lacking spaces and are all lower-case.
    answers.forEach( (answer) => {
        // Find the color by removing white space and converting to lowercase for both values
        let color = colornames.find( color =>
            color.name.replace(' ', '').toLowerCase() === answer.replace(' ', '') );
        if ( color ) {
            answer_names.push( color.name );
        } else {
            // Fallback to whatever answer was given if we didn't find it
            answer_names.push( answer );
        }
    })
    
    return {
        'type': 'Colordle',
        'publishedDate': published,
        'scheduledDate': scheduled,
        'startingNumber': Config.number + start,
        'answers': answer_names
    };
    
}