import fetch from "node-fetch";
import {
    collectAnswers,
    convertDateForSQL,
    getCurrentDayInTimezone,
    getSpecificDay
} from "./helpers.mjs";

/*
Gamedle runs several daily modes off one site, each with its own day counter. Every mode's
POST /today<Mode>Game takes the client's "board" and returns the day's `original`; posting
{ daynumber } asks for that day instead. A future day comes back with `original: null`.

The number here is the one the site displays (`daynumber`). The event is the Pink Ribbon "Guess the
Breast" month, which counts its own days 1..36 from 2026-09-25 and is skipped outside that window.
*/
const Config = {
    date: getSpecificDay('2026-09-30'),
    schedule: {
        h: 0,
        m: 5
    },
    // The daily reset is midnight UTC-3 (03:00 UTC); Buenos Aires has no DST.
    tz: 'America/Argentina/Buenos_Aires',
    modes: {
        'gamedle-cover':      { endpoint: 'todayGame',           number: 1621, type: 'Gamedle Cover' },
        'gamedle-artwork':    { endpoint: 'todayArtworkGame',    number: 1380, type: 'Gamedle Artwork' },
        'gamedle-characters': { endpoint: 'todayCharactersGame', number: 473,  type: 'Gamedle Characters', character: true },
        'gamedle-keywords':   { endpoint: 'todayKeywordsGame',   number: 1181, type: 'Gamedle Keywords' },
        'gamedle-guess':      { endpoint: 'todayWrittenGame',    number: 1434, type: 'Gamedle Guess' },
        'gamedle-event':      { endpoint: 'todayEventGame',      number: 6,    type: 'Gamedle Guess the Breast', character: true, lastDay: 36 }
    }
}

const base_url = 'https://www.gamedle.wtf/';
const headers = {
    'User-Agent': 'Mozilla/5.0',
    'Accept': 'application/json'
};

/*
The site throttles bursts: after a handful of quick requests it answers 200 with an empty body, or
drops the connection, for a little while. So every call is spaced out, and an empty body or network
error is retried with a growing backoff rather than read as "no answer".
*/
const REQUEST_GAP_MS = 2500;
const RETRY_DELAYS_MS = [5000, 10000, 20000, 30000];
let lastRequestAt = 0;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function request( path, init = {} ) {

    for ( let attempt = 0; ; attempt++ ) {

        const wait = lastRequestAt + REQUEST_GAP_MS - Date.now();
        if ( wait > 0 ) {
            await sleep( wait );
        }
        lastRequestAt = Date.now();

        let text = '';
        try {
            const response = await fetch( base_url + path, { ...init, headers: { ...headers, ...init.headers } } );
            if ( !response.ok ) {
                throw new Error( `HTTP ${response.status}` );
            }
            text = await response.text();
        } catch ( error ) {
            if ( attempt >= RETRY_DELAYS_MS.length ) {
                throw new Error( `${path}: ${error.message}` );
            }
        }

        if ( text.trim() ) {
            return JSON.parse( text );
        }

        if ( attempt >= RETRY_DELAYS_MS.length ) {
            throw new Error( `${path}: empty response (rate limited?)` );
        }

        await sleep( RETRY_DELAYS_MS[attempt] );
    }
}

async function getDay( mode, number ) {

    const data = await request( mode.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daynumber: String(number) })
    });

    return data?.original ?? null;
}

let catalog = null;

async function getCatalog() {
    if ( !catalog ) {
        catalog = await request( 'getCollectionAndFranchises' );
    }
    return catalog;
}

/*
Today's game hides its name (`label: null`) until the day is over, but still carries its id plus
its collection and franchise ids. Name those from the catalog, search the autocomplete for each
name, and take the result whose id matches. Past days carry the label directly.
*/
async function resolveName( original ) {

    if ( original.label ) {
        return original.label;
    }

    const entries = await getCatalog();
    const nameOf = ( type, id ) => entries.find( x => x.type === type && String(x.id) === String(id) )?.name;

    const names = [
        nameOf( 'C', original.collection ),
        ...( original.franchises ?? [] ).map( id => nameOf( 'F', id ) )
    ].filter( Boolean );

    for ( const name of new Set( names ) ) {
        const results = await request( `api/autocomplete?q=${encodeURIComponent(name)}&lang=en` );
        const match = Array.isArray( results ) ? results.find( x => x.value === original.value ) : null;
        if ( match?.label ) {
            return match.label;
        }
    }

    throw new Error( `unresolved game id ${original.value} (searched: ${names.join(', ') || 'nothing'})` );
}

async function formatAnswer( mode, original ) {

    if ( mode.character ) {
        return ( original.colfranStrings ?? [] ).join(', ') + ' |~~~~| ' + original.label;
    }

    return await resolveName( original );
}

export async function getAnswers( date_string, number_to_get ) {

    let date;
    if ( date_string === null ) {
        date = getCurrentDayInTimezone(Config.tz);
    } else {
        date = getSpecificDay(date_string);
    }

    const diff = date.since(Config.date).days;

    let results = {};

    for ( const [key, mode] of Object.entries( Config.modes ) ) {

        // A backfill that starts before the event's day 1 still overlaps it, so start the event's
        // batch at day 1 (with its own dates) rather than skipping it.
        const offset = mode.lastDay ? Math.max( 0, 1 - ( mode.number + diff ) ) : 0;
        const startDate = date.add({days: offset});
        const puzzleNumber = mode.number + diff + offset;

        // Outside the event window there is no puzzle to report, and no failure either.
        if ( offset >= number_to_get || ( mode.lastDay && puzzleNumber > mode.lastDay ) ) {
            continue;
        }

        const published = startDate.toString();
        const scheduled = convertDateForSQL( startDate.subtract({days: 1}), Config.schedule.h, Config.schedule.m );

        const { answers, errors } = await collectAnswers( number_to_get - offset, async ( i ) => {
            const number = puzzleNumber + i;
            if ( mode.lastDay && number > mode.lastDay ) {
                return null;
            }
            const original = await getDay( mode, number );
            return original ? await formatAnswer( mode, original ) : null;
        }, key );

        const result = {
            'type': mode.type,
            'publishedDate': published,
            'scheduledDate': scheduled,
            'startingNumber': puzzleNumber,
            // Only today (and earlier) is served, so a short batch is expected.
            'clamped': true,
            'answers': answers
        };

        if ( errors.length ) {
            Object.defineProperty( result, 'errors', {
                value: errors,
                enumerable: false,
                configurable: true
            });
        }

        results[key] = result;
    }

    return results;
}
