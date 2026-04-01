// https://syllacrostic.com/api/puzzles/daily-puzzle-number/889

import fetch from "node-fetch";
import {addDays, getDateDisplay, getDayDifference, subDays} from "./helpers.mjs";

const script_url = "https://syllacrostic.com/api/puzzles/daily-puzzle-number/";
const start_puzzle_date = "March 29 2023";
const start_puzzle_number = 1;
const scheduled_time = {
    'hours': 20,
    'minutes': 0
};

async function getPuzzleJson(puzzle_number) {
    return await fetch(script_url + puzzle_number)
        .then((response) => response.json());
}

async function getAnswer( puzzle_number ) {
    
    let answer = await getPuzzleJson( puzzle_number );
    
    if ( answer ) {
        let thing = answer;
    }
    
    let answers;
    
    answer['clues'].forEach( clue => {
        answers.push( clue['syllables'] );
    });
    
    
    return answer;
}

function getPuzzleNumberFromDate( date ) {



}


function getFormattedDate( date ) {
    let year = date.getFullYear();
    
    let month = (1 + date.getMonth()).toString();
    month = month.length > 1 ? month : '0' + month;
    
    let day = date.getDate().toString();
    day = day.length > 1 ? day : '0' + day;
    
    return month + '/' + day + '/' + year;
}


export async function getAnswers( date_string, number_to_get ) {
    
    if ( date_string === null ) {
        date_string = new Date().toLocaleString("en-US", {timeZoneName: 'short', timeZone: "America/Los_Angeles"});
    }
    
    const published = new Date( date_string );
    const scheduled = subDays( published, 1 );
    scheduled.setHours( scheduled_time.hours );
    scheduled.setMinutes( scheduled_time.minutes );1
    
    const diff = getDayDifference( start_puzzle_date, published.toDateString() );
    const start = start_puzzle_number + diff;
    
    let puzzle_number = start;
    
    let a = [];
    let i = 0;
    while( i < number_to_get ) {
        
        let puzzleDate = addDays( date_string, i );
        let puzzle = await getAnswer( puzzle_number );
        
        a.push( puzzle.categories.join(' |~~| ') + ' |~~~~| ' + puzzle.extra.join(' |~~| ' ) );
        puzzle_number++;
        i++;
    }
    
    return {
        'type': 'Syllacrostic',
        'publishedDate': getDateDisplay( published ),
        'scheduledDate': getDateDisplay( scheduled, true ),
        'startingNumber': start,
        'answers': a
    };
    
}
// getAnswers('08/31/2025', 1).then( result => {console.log(result)});