import fetch from "node-fetch";
import {
    convertDateForSQL,
    getCurrentDayInTimezone,
    getSpecificDay
} from "./helpers.mjs";

const Config = {
    number: 1,
    date: getSpecificDay('2025-05-19'),
    schedule: {
        h: 17,
        m: 5
    },
    tz: 'Etc/UTC'
}
const initial_guess = 'ironman'; // We use ironman because he exists in both games
const default_headers = {
    "Accept": "*/*",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Accept-Language": "en-US,en;q=0.9",
    "Accepts": "application/json",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Referer": "https://marveldle.com/",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:138.0) Gecko/20100101 Firefox/138.0"
};

// The only field the API compares as a range rather than by value.
const ORDINAL_FIELD = 'apparitionYear';

// Worst case measured over every possible answer is 6 (comics) and 8 (audiovisual) - the latter
// because seven audiovisual characters share identical attributes and can only be tried one at a
// time. This is a safety net, not an expected limit.
const MAX_GUESSES = 15;
const MAX_ATTEMPTS = 3;

function validateGameType( type = '' ) {
    let _type;
    switch( type ) {
        case 'audiovisual':
        case 'visual':
        case 'audio':
            _type = 'audiovisual';
            break;
        default:
            _type = 'comics';
    }
    
    return _type;
}

async function getAnswerOptions( type = 'comics', headers ) {
    
    let type_url = validateGameType( type );
    const fetch_url = `https://api.marveldle.com/api/characters/${type_url}`;
    
    const response = await fetch(fetch_url, {
        "headers": headers,
        "body": null,
        "method": "GET"
    });
    
    if ( response.status !== 200 ) {
        return false;
    }
    
    return await response.json();
}

async function makeGuess(guess_id, type = 'comics', date_id = '', headers) {
    
    let _type = validateGameType( type );
    const fetch_url = `https://api.marveldle.com/api/characters/${_type}/guess/${guess_id}?dateId=${date_id} 12:00:00 AM`;
    
    const guess = await fetch(fetch_url, {
        "headers": headers,
        "content-type": "application/json",
        "method": "GET"
    });
    
    if ( guess.status !== 200 ) {
        return false;
    }
    
    return await guess.json();
}

/*
The two games score different fields - comics has apparitionYear and no appearanceTypes or
affiliations, audiovisual is the other way round and has no year at all - so the field list is read
off the response instead of hardcoded. Everything except id and isExact is a scored clue.
*/
function scoredFields( response ) {
    return Object.keys( response ).filter( key => key !== 'id' && key !== 'isExact' );
}

/*
The server's verdict for `guess` if `candidate` were the answer, as a single comparable string.
Verified against the live API on 30 guesses, including characters sharing the answer's exact year,
species and power types: 30/30 agreement.
*/
function scoreGuess( guess, candidate, fields ) {
    
    return fields.map( field => {
        
        if ( field === ORDINAL_FIELD ) {
            if ( candidate[field] === guess[field] ) return 'Exact';
            return candidate[field] > guess[field] ? 'Upper' : 'Lower';
        }
        
        if ( Array.isArray( guess[field] ) ) {
            // Set fields (species, powerTypes, appearanceTypes, affiliations): all the same members
            // is Exact, any member in common is Partial, nothing in common is None.
            const candidate_values = new Set( candidate[field] ?? [] );
            const shared = guess[field].filter( value => candidate_values.has( value ) ).length;
            
            if ( shared === guess[field].length && shared === candidate_values.size ) return 'Exact';
            return shared ? 'Partial' : 'None';
        }
        
        return candidate[field] === guess[field] ? 'Exact' : 'None';
        
    } ).join( '|' );
}

function serverScore( response, fields ) {
    return fields.map( field => response[field] ).join( '|' );
}

/*
Pick the guess that leaves the fewest candidates standing in the worst case.

Every candidate is scored against every other, which partitions the list by the verdict that guess
would draw; the answer can only ever be in one partition, so the guess whose largest partition is
smallest is the one that cannot go badly. Ties break on the sum of squared partition sizes, i.e.
the smaller expected remainder. Guessing only from the surviving candidates means every guess can
also be the answer, which measures as good as scoring the full character list and is far cheaper -
all 458 comics puzzles solve in 0.4s.
*/
function chooseGuess( candidates, fields ) {
    
    let best = candidates[0];
    let best_largest = Infinity;
    let best_spread = Infinity;
    
    for ( const guess of candidates ) {
        
        const partitions = new Map();
        
        for ( const candidate of candidates ) {
            const score = scoreGuess( guess, candidate, fields );
            partitions.set( score, ( partitions.get( score ) ?? 0 ) + 1 );
        }
        
        const sizes = [ ...partitions.values() ];
        const largest = Math.max( ...sizes );
        const spread = sizes.reduce( ( total, size ) => total + size * size, 0 );
        
        if ( largest < best_largest || ( largest === best_largest && spread < best_spread ) ) {
            best = guess;
            best_largest = largest;
            best_spread = spread;
        }
    }
    
    return best;
}

/*
Play the game: guess, keep only the characters that would have drawn the same verdict, guess again.
Returns { answer } on success or { error } describing why it stopped - never a bare false, so the
caller can say which half of the puzzle went wrong.
*/
async function deduceAnswer( date, type = 'comics' ) {
    
    const headers = { ...default_headers };
    const options = await getAnswerOptions( type, headers );
    
    if ( !options || !options.length ) {
        return { error: `${type}: could not load the character list` };
    }
    
    let candidates = options;
    let guess = candidates.find( character => character.id === initial_guess );
    
    if ( !guess ) {
        return { error: `${type}: the opening guess "${initial_guess}" is not in the character list` };
    }
    
    let fields = null;
    let attempts = 1;
    let guesses = 0;
    const trail = [];
    
    while ( guesses < MAX_GUESSES ) {
        
        const response = await makeGuess( guess.id, type, date, headers );
        
        // Retry a failed request a few times before giving up; it does not count as a guess.
        if ( !response ) {
            if ( attempts === MAX_ATTEMPTS ) {
                return { error: `${type}: the guess endpoint failed ${MAX_ATTEMPTS} times in a row` };
            }
            attempts += 1;
            continue;
        }
        
        attempts = 1;
        guesses += 1;
        trail.push( guess.name );
        
        if ( response.isExact ) {
            console.log( `  marveldle ${type}: ${guess.name} in ${guesses} guess(es) - ${trail.join(' > ')}` );
            return { answer: guess };
        }
        
        fields ??= scoredFields( response );
        
        // Everything that would have drawn a different verdict is out, including the guess itself.
        const verdict = serverScore( response, fields );
        candidates = candidates.filter( candidate =>
            candidate.id !== guess.id && scoreGuess( guess, candidate, fields ) === verdict
        );
        
        if ( !candidates.length ) {
            // Every character has been ruled out, so the clues cannot be read the way this module
            // reads them - the API's scoring or its data has changed.
            return { error: `${type}: no character matches the clues after ${guesses} guess(es) (${trail.join(' > ')})` };
        }
        
        guess = candidates.length === 1 ? candidates[0] : chooseGuess( candidates, fields );
    }
    
    return { error: `${type}: unsolved after ${MAX_GUESSES} guesses (${trail.join(' > ')})` };
}

export async function getAnswer() {
    
    const date = getCurrentDayInTimezone(Config.tz);
    const published = date.toString();
    const scheduled = convertDateForSQL(date.subtract({ days: 1 }), Config.schedule.h, Config.schedule.m);
    const diff = date.since(Config.date).days;
    const currentPuzzleNumber = Config.number + diff;
    
    const comics = await deduceAnswer( published, 'comics');
    const audiovisual = await deduceAnswer( published, 'audiovisual' );
    
    const result = {
        'type': 'Marveldle',
        'publishedDate': published,
        'scheduledDate': scheduled,
        'startingNumber': currentPuzzleNumber,
        'answers': []
    };
    
    // Both halves share one delimited string, so half an answer would post the literal "undefined".
    // Post nothing instead and let the route alert and answer 503.
    const errors = [ comics.error, audiovisual.error ].filter( Boolean );
    
    if ( errors.length ) {
        errors.forEach( error => console.error( `  marveldle failed: ${error}` ) );
        
        // Non-enumerable so the diagnostic never reaches WordPress, matching letroso.mjs and
        // parseword.mjs. The route and the CLI both read it.
        Object.defineProperty( result, 'errors', {
            value: errors.map( error => `marveldle failed: ${error}` ),
            enumerable: false,
            configurable: true
        } );
        
        return result;
    }
    
    result.answers.push( comics.answer.name + ' |~~~~| ' + audiovisual.answer.name );
    
    return result;
    
}
