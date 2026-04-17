import {
    convertDateForSQL,
    getCurrentDayInTimezone,
    getSpecificDay
} from "./helpers.mjs";
import fetch from "node-fetch";

const Config = {
    number: 9,
    date: getSpecificDay('2023-06-20'),
    schedule: {
        h: 18,
        m: 15
    },
    tz: 'Etc/GMT-7'
}
const answer_base_url = 'https://www.nytimes.com/svc/connections/v2/';

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

export async function getAnswers( date_string, number_to_get ) {
    
    let date;
    if ( date_string === null ) {
        date = getCurrentDayInTimezone(Config.tz);
    } else {
        date = getSpecificDay(date_string);
    }
    
    const diff = date.since( Config.date ).days;
    const puzzleNumber = Config.number+diff;
    const published = date.toString();
    const scheduled = convertDateForSQL(date.subtract({ days: 1 }), Config.schedule.h, Config.schedule.m);
    
    let a = [];
    let i = 0;
    while( i < number_to_get ) {
        
        let puzzle = await getAnswer( date.add({days: i}).toString() );
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
        'publishedDate': published,
        'scheduledDate': scheduled,
        'startingNumber': puzzleNumber,
        'answers': a
    };
    
}