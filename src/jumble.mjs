import fetch from 'node-fetch';
import {
    convertDateForSQL,
    getCurrentDayInTimezone,
    getSpecificDay
} from "./helpers.mjs";

const Config = {
    number: 450,
    date: getSpecificDay('2023-05-24'),
    schedule: {
        h: 0,
        m: 30
    },
    tz: 'America/Los_Angeles'
}

function getFormattedDate( date ) {
    const y = date.year;
    const m = String(date.month).padStart(2, '0');
    const d = String(date.day).padStart(2, '0');
    return `${m}/${d}/${y}`;
}

async function getAnswer( targetDate ) {
    
    let date_string = getFormattedDate(targetDate);
    let day = targetDate.dayOfWeek;
    let product_ID = ( day === 7 ) ? 'jumblesun' : 'jumbledaily';
    
    const params = new URLSearchParams();
    params.append('apiKey', '28731af1e0f08418dbdbe583dbf2470ff87a1664bc461b83413742053d793d8f');
    // params.append('productId', 'jumbledaily'); // Daily is Mon - Saturday
    params.append('productId', product_ID); // Sunday has a separate dedicated ID
    params.append('publicationDate', '');
    params.append('prvNxt', '');
    params.append('langCode', 'en-US');
    params.append('ldt', date_string);
    
    
    const response = await fetch("https://puzzles.tribunecontentagency.com/puzzles/pzzResource/puzzle.do", {
        method: 'POST',
        headers: {
            'Accept': 'application/json, text/javascript, */*'
        },
        body: params
    })
    
    const body = await response.json();
    
    let answers = [];
    let scrambled = [];
    let bonus = [];
    let caption = '';
    
    // Loop through Clues
    for (let prop in body.puzzleDetails.clues) {
        scrambled.push(body.puzzleDetails.clues[prop].word)
        answers.push(body.puzzleDetails.clues[prop].answer);
    }
    
    // Loop through bonuses
    for (let prop in body.puzzleDetails.bonusPuzzle.solutions) {
        bonus.push(body.puzzleDetails.bonusPuzzle.solutions[prop].word);
    }
    
    scrambled.push( body.puzzleDetails.bonusPuzzle.puzzleStr );
    
    answers.push( bonus.join(' ') );
    
    return answers.join(', ') + ' |~~~~| ' + scrambled.join(', ') + ' |~~~~| ' + body.puzzleDetails.bonusPuzzle.caption;
}

export async function getAnswers( date_string, number_to_get ) {
    
    let date;
    if ( date_string === null ) {
        date = getCurrentDayInTimezone(Config.tz);
    } else {
        date = getSpecificDay(date_string);
    }
    
    const published = date.toString();
    const scheduled = convertDateForSQL( date, Config.schedule.h, Config.schedule.m );
    const diff = date.since(Config.date).days;
    const puzzleNumber = Config.number + diff;
    
    let answers = [];
    
    for( let i = 0; i < number_to_get; i++ ) {
        
        let answer = await getAnswer( date.add({days: i}) );
        answers.push( answer );
    }
    
    return {
        'type': 'Jumble',
        'publishedDate': published,
        'scheduledDate': scheduled,
        'startingNumber': puzzleNumber,
        'answers': answers
    };
    
}