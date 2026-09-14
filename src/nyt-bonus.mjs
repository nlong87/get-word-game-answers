import fetch from "node-fetch";
import {
    convertDateForSQL,
    getCurrentDayInTimezone,
    getSpecificDay
} from "./helpers.mjs";
import { formatStrandsAnswer } from "./strands.mjs";

/*
NYT bonus puzzles drop weekly on Wednesdays rather than daily, and their slugs are
`YYYY-MM-DD-<id>` pairs that the detail endpoints validate exactly. The ids are not
sequential (Colorful Strands has run 1089, 1086, 1088, 1085, 1114), so unlike every other
puzzle here the slug cannot be derived from a Config anchor - it has to be discovered from
the weekly index below.
*/

const Config = {
    schedule: {
        h: 18,
        m: 0
    },
    tz: 'Etc/UTC'
}
const week_url = 'https://www.nytimes.com/svc/games/bonus/week/v1/';

/*
NYT displays no number for bonus puzzles - the page is titled just "Colorful Strands - Bonus
Puzzles" - and the `id` in the payload is an internal identifier, not a puzzle number. It is also
inconsistent between variants: Wordle in 1 runs 2, 3, 4 while Colorful Strands runs 907, 1089,
1086, because those are drawn from the daily Strands pool. Number by weekly drop instead, which is
uniform across all three and monotonic.
*/
const BONUS_EPOCH = getSpecificDay('2026-08-26'); // the first bonus drop is #1

function getDropNumber( drop_date ) {
    // Rounded rather than truncated so a shifted drop day cannot silently floor to the wrong week.
    return Math.round( drop_date.since( BONUS_EPOCH ).days / 7 ) + 1;
}

function formatWordleInOne( puzzle ) {
    
    const solutions = puzzle.rounds.map( round => round.solution.toUpperCase() );
    const starts = puzzle.rounds.map( round => round.start );
    
    return solutions.join(' |~~| ') + ' |~~~~| ' + starts.join(' |~~| ');
}

function formatConnections3x3( puzzle ) {
    
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
    
    return answer.join(' |~~| ') + ' |~~~~| ' + extra.join(' |~~| ');
}

// Keyed by the name each puzzle is posted under; one weekly index walk feeds all of them.
const Puzzles = {
    'nyt-bonus-wordle-in-one': {
        game: 'wordle-in-one',
        variant: 'standard',
        type: 'Wordle in 1',
        url: 'https://www.nytimes.com/svc/wordle-in-one/v1/bonus/',
        format: formatWordleInOne
    },
    'nyt-bonus-connections-3x3': {
        game: 'connections',
        variant: '3x3',
        type: 'NYT Connections 3x3',
        url: 'https://www.nytimes.com/svc/connections/v2/bonus/',
        format: formatConnections3x3
    },
    'nyt-bonus-strands-colorful': {
        game: 'strands',
        variant: 'colorful',
        type: 'NYT Colorful Strands',
        url: 'https://www.nytimes.com/svc/strands/v2/bonus/',
        format: formatStrandsAnswer
    }
}

async function getJson( url ) {
    
    const response = await fetch( url, {
        method: 'GET',
        headers: {
            'Accept': 'application/json, text/javascript, */*'
        },
    });
    
    if ( !response.ok ) {
        return false;
    }
    
    return await response.json();
}

/**
 * Resolves a date to its containing weekly drop, then follows next_drop forward.
 *
 * @param {Object} date - Temporal.PlainDate to start from.
 * @param {number} number_to_get - Maximum number of drops to collect.
 * @returns {Promise<Array>} The bonus_puzzles_week objects, oldest first.
 */
async function getDrops( date, number_to_get ) {
    
    let drops = [];
    let next = date.toString();
    
    while ( drops.length < number_to_get && next ) {
        
        const data = await getJson( week_url + next + '.json' );
        const week = data ? data.bonus_puzzles_week : false;
        
        // An empty puzzle list is how NYT marks a week it hasn't filled in yet, so this is
        // the published horizon rather than an error. Roughly 5 drops are available.
        if ( !week || !week.puzzles || week.puzzles.length === 0 ) {
            break;
        }
        
        drops.push( week );
        
        next = ( week.next_drop && week.next_drop !== week.drop_date ) ? week.next_drop : null;
    }
    
    return drops;
}

export async function getAnswers( date_string, number_to_get ) {
    
    let date;
    if ( date_string === null ) {
        date = getCurrentDayInTimezone(Config.tz);
    } else {
        date = getSpecificDay(date_string);
    }
    
    const drops = await getDrops( date, number_to_get );
    
    let results = {};
    
    for ( const [key, puzzle_config] of Object.entries(Puzzles) ) {
        
        let answers = [];
        let answerSchedule = [];
        
        for ( const drop of drops ) {
            
            const entry = drop.puzzles.find( p =>
                p.game === puzzle_config.game && p.variant === puzzle_config.variant );
            
            if ( !entry ) {
                continue;
            }
            
            const puzzle = await getJson( puzzle_config.url + entry.slug + '.json' );
            
            if ( !puzzle || puzzle.status !== 'OK' ) {
                continue;
            }
            
            const drop_date = getSpecificDay( drop.drop_date );
            
            answers.push( puzzle_config.format( puzzle ) );
            
            // Drops are a week apart, so the dates cannot be extrapolated from the first answer
            // even though the drop numbers themselves are sequential.
            answerSchedule.push({
                'publishedDate': drop.drop_date,
                'scheduledDate': convertDateForSQL( drop_date.subtract({days: 1}), Config.schedule.h, Config.schedule.m ),
                'number': getDropNumber( drop_date )
            });
        }
        
        const first = answerSchedule[0];
        
        results[key] = {
            'type': puzzle_config.type,
            'publishedDate': first ? first.publishedDate : date.toString(),
            'scheduledDate': first ? first.scheduledDate : convertDateForSQL( date.subtract({days: 1}), Config.schedule.h, Config.schedule.m ),
            'startingNumber': first ? first.number : 0,
            'answers': answers,
            'clamped': true, // length is capped by how far ahead NYT has published
            'answerSchedule': answerSchedule
        };
    }
    
    return results;
}
