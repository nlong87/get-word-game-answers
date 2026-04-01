import fetch from 'node-fetch';
import {addDays, getDateDisplay, getDayDifference, subDays} from "./helpers.mjs";

const starting_date = "May 24 2023";
const starting_puzzle_number = 450;
const scheduled_time = {
    'hours': 0,
    'minutes': 30
};

async function getAnswer( targetDate ) {
    
    let date_string = ('0' + (targetDate.getMonth()+1)).slice(-2) + '/'
    + ('0' + targetDate.getDate()).slice(-2) + '/'
    + targetDate.getFullYear();
    
    let day = targetDate.getDay();
    
    let product_ID = ( day === 0 ) ? 'jumblesun' : 'jumbledaily';
    
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
    
    let answers = [];
    let start_date = new Date( date_string );
    let date = start_date;
    let published = new Date(date_string);
    let scheduled = new Date(date_string);
        scheduled.setHours( scheduled_time.hours );
        scheduled.setMinutes( scheduled_time.minutes );
    
    for( let i = 0; i < number_to_get; i++ ) {
        
        date = addDays( start_date, i );
        
        let answer = await getAnswer( date );
        answers.push( answer );
    }
    
    return {
        'type': 'Jumble',
        'publishedDate': getDateDisplay( published ),
        'scheduledDate': getDateDisplay( scheduled, true ),
        'startingNumber': starting_puzzle_number + getDayDifference( starting_date, date_string ),
        'answers': answers
    };
    
}