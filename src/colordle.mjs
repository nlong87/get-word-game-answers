import fetch from "node-fetch";
import {getDateDisplay, getDayDifference, subDays} from "./helpers.mjs";
import { colornames } from 'color-name-list';

/*
This is the way Colordle gets the day number for the answer, we use our own way instead.

import moment from 'moment';

let startDay = moment([2023, 7, 7]);
let today = moment([]);
let dayOffset = 500;
let dayNum = today.diff(startDay, "days") + dayOffset;

*/

const start_puzzle_date = "August 7 2023";
const start_puzzle_number = 500;
const start_offset = 0;
const scheduled_time = {
    'hours': 18,
    'minutes': 0
};
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
    
    const published = new Date( date_string );
    const scheduled = subDays( published, 1 );
    scheduled.setHours( scheduled_time.hours );
    scheduled.setMinutes( scheduled_time.minutes );
    
    const diff = getDayDifference( start_puzzle_date, published.toDateString() );
    const start = start_offset + diff;
    
    let all_answers = await getAnswersFromSite();
    
    let answers = all_answers.colors.slice(start, start + number_to_get)
    
    if ( ! answers ) {
        return false;
    }
    
    let answer_names = [];
    
    
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
        'publishedDate': getDateDisplay( published ),
        'scheduledDate': getDateDisplay( scheduled, true ),
        'startingNumber': start_puzzle_number + start,
        'answers': answer_names
    };
    
}