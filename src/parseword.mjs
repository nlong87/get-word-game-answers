import './env.mjs';
import {
    collectAnswers,
    convertDateForSQL,
    getCurrentDayInTimezone,
    getSpecificDay,
    proxyWebsite
} from "./helpers.mjs";

const Config = {
    number: 1,
    date: getSpecificDay('2026-01-29'),
    schedule: {
        h: 2,
        m: 10
    },
    tz: 'America/Chicago'
}

/*
A day that is not published yet answers 403 with the plain-text body "Forbidden", not JSON. Both
paths therefore return parsed JSON or null - previously dev threw a SyntaxError out of
response.json() and production handed the raw proxy text straight to the parser, where
json_data['mutations'] was undefined and the loop below threw a TypeError.
*/
async function getAnswerJson( date_string ) {

    const fetch_url = `https://www.parseword.com/puzzles/${date_string}.json`;
    let body;

    if (process.env.NODE_ENV === 'production') {
        // proxyWebsite returns raw text and no status, so the body is the only thing to go on.
        body = await proxyWebsite( fetch_url );
    } else {
        const response = await fetch(fetch_url);

        if (!response.ok) {
            return null;
        }

        body = await response.text();
    }

    try {
        return JSON.parse( body );
    } catch {
        return null;
    }
}

async function getAnswer(date_string) {

    const json_data = await getAnswerJson(date_string);

    // Not published yet. Returning null here ends collection without recording a failure.
    if (!json_data || !json_data['solution']) {
        return null;
    }

    const mutations = Array.isArray( json_data['mutations'] ) ? json_data['mutations'] : [];

    return {
        'answer': json_data['solution'],
        'extra': mutations.map( mutation => ({
            'before': mutation['before'] ?? null,
            'after': mutation['after'] ?? null,
            'type': mutation['type'] ?? null,
            'indicator': mutation['indicator'] ?? null,
        }) ),
    }
}

export async function getAnswers( date_string, number_to_get) {
    
    let date;
    if ( date_string === null ) {
        date = getCurrentDayInTimezone(Config.tz);
    } else {
        date = getSpecificDay(date_string);
    }
    
    const published = date.toString();
    const scheduled = convertDateForSQL(date, Config.schedule.h, Config.schedule.m);
    
    let puzzleNumber = Config.number + date.since(Config.date).days;
    
    // Parseword only publishes the current day, so running off the end is the normal case, not a
    // failure: getAnswer returns null and collectAnswers stops. A network or proxy error does get
    // recorded, which is what tells the route the run is worth retrying.
    const { answers, errors } = await collectAnswers( number_to_get,
        ( i ) => getAnswer( date.add( { days: i } ).toString() ), 'parseword' );
    
    const result = {
        'type': 'Parseword',
        'publishedDate': published,
        'scheduledDate': scheduled,
        'startingNumber': puzzleNumber,
        'answers': answers.map( a => a.answer + ' |~~~~| ' + JSON.stringify( a.extra ) )
    };
    
    if ( errors.length ) {
        // Non-enumerable so the diagnostic never reaches WordPress, matching letroso.mjs and the
        // dispatch-level errors in get-answers.mjs.
        Object.defineProperty( result, 'errors', {
            value: errors,
            enumerable: false,
            configurable: true
        } );
    }
    
    return result;
    
}