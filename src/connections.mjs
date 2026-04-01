import {addDays, getDateDisplay, getDayDifference, subDays} from "./helpers.mjs";
import fetch from "node-fetch";

const start_date = 'June 20 2023';
const start_puzzle_number = 9;
const scheduled_time = {
    'hours': 18,
    'minutes': 15
};
const answer_base_url = 'https://www.nytimes.com/svc/connections/v2/';

export async function getAnswers( date_string, number_to_get ) {
    
    let day_diff = getDayDifference( start_date, date_string );
    let start = start_puzzle_number+day_diff;
    let published = new Date(date_string);
    let scheduled = subDays( published, 1 )
    scheduled.setHours( scheduled_time.hours );
    scheduled.setMinutes( scheduled_time.minutes );
    
    let puzzleDate = new Date(date_string);
    let a = [];
    let i = 0;
    while( i < number_to_get ) {
        
        puzzleDate = addDays( date_string, i );
        let month = ('0' + (puzzleDate.getMonth()+1)).slice(-2);
        let day = ('0' + puzzleDate.getDate()).slice(-2);
        
        let puzzle = await getAnswer( `${puzzleDate.getFullYear()}-${month}-${day}` );
        let answer = [];
        let extra = [];
        
        for ( const property in puzzle.categories ) {
            answer.push( puzzle.categories[property].title );
            extra.push( puzzle.categories[property].cards.map( card => {
                if ( card?.image_alt_text ) { // Check if the card is an image or not
                    return card.image_alt_text;
                } else {
                    return card.content;
                }
            } ).join(', ') );
        }
        
        a.push( answer.join(' |~~| ') + ' |~~~~| ' + extra.join(' |~~| ') );
        i++;
    }
    
    return {
        'type': 'NYT Connections',
        'publishedDate': getDateDisplay( published ),
        'scheduledDate': getDateDisplay( scheduled, true ),
        'startingNumber': start,
        'answers': a
    };
    
}

/**
 * Retrieves the answer based on the provided date string.
 *
 * @param {string} date_string - The date string used to fetch the answer.
 * @returns {Promise} The promise representing the response in JSON format.
 * @throws {Error} if there is an issue with the fetch request or response.
 */
async function getAnswer( date_string ) {
    
    const response = await fetch(answer_base_url + date_string + '.json', {
        method: 'GET',
        headers: {
            'Accept': 'application/json, text/javascript, */*'
        },
    });
    
    return await response.json();
}
//await getAnswers('10/31/2025', 1).then( r => console.log(r));