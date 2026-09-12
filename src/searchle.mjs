import fetch from "node-fetch";
import {
    convertDateForSQL,
    getCurrentDayInTimezone,
    getSpecificDay
} from "./helpers.mjs";

const Config = {
    number: 1,
    date: getSpecificDay('2023-06-22'),
    schedule: {
        h: 18,
        m: 0
    },
    tz: 'Etc/UTC'
}

const base_url = 'https://searchle.net/';

/*
The answer list is a literal array inside searchle's JS bundle. Both steps of finding it are
deliberately loose, because the previous version broke on a site rebuild:

  - The bundle used to be located by requiring Create React App's `main.<hash>.js` name. Any
    other build tool (Vite emits /assets/index-<hash>.js) would find nothing, so instead every
    script on the page is tried and the one actually containing the array wins.
  - The array used to be located by the text of one specific puzzle, which is editable content.
    ARRAY_BY_SHAPE keys on the object shape instead - `luckyGuess` appears once per entry, so it
    tracks the schema rather than the content.

No browser is involved: the script tags are in the served HTML. The old version launched one via
launchBrowser() and never closed it, which is what produced "TargetCloseError: Target closed"
once Cloud Run had leaked enough of them.
*/
const ARRAY_BY_SHAPE = /\[\{text:"[^"]*",answer:"[^"]*",luckyGuess:"[^"]*"\}.*?\}\]/s;
const ARRAY_BY_PHRASE = /\[[^\]]*text:"should i explore a city by"[^\]]*\]/;

function extractAnswers( source ) {
    
    for ( const pattern of [ ARRAY_BY_SHAPE, ARRAY_BY_PHRASE ] ) {
        
        const match = source.match( pattern );
        
        if ( match ) {
            try {
                const parsed = Function( 'return ' + match[0] )();
                if ( Array.isArray( parsed ) && parsed.length ) {
                    return parsed;
                }
            } catch {
                // Try the next pattern rather than giving up.
            }
        }
    }
    
    return false;
}

async function getScriptUrls() {
    
    const response = await fetch( base_url );
    
    if ( !response.ok ) {
        return [];
    }
    
    const html = await response.text();
    const sources = [ ...html.matchAll( /<script[^>]+src="([^"]+)"/g ) ].map( m => m[1] );
    
    // Same-origin scripts first: the bundle is one of those, and third-party widgets are only
    // worth fetching if everything else misses.
    const absolute = sources.map( src => new URL( src, base_url ).href );
    
    return [
        ...absolute.filter( url => url.startsWith( base_url ) ),
        ...absolute.filter( url => !url.startsWith( base_url ) )
    ];
}

async function getAllAnswers() {
    
    for ( const url of await getScriptUrls() ) {
        
        const response = await fetch( url );
        
        if ( !response.ok ) {
            continue;
        }
        
        const answers = extractAnswers( await response.text() );
        
        if ( answers ) {
            return answers;
        }
    }
    
    return false;
}

export async function getAnswers(date_string, number_to_get) {
    
    let date;
    if (date_string === null) {
        date = getCurrentDayInTimezone(Config.tz);
    } else {
        date = getSpecificDay(date_string);
    }
    
    const published = date.toString();
    const scheduled = convertDateForSQL(date.subtract({days: 1}), Config.schedule.h, Config.schedule.m);
    const diff = date.since(Config.date).days;
    const puzzleNumber = Config.number + diff;
    
    const all_answers = await getAllAnswers();
    
    if ( !all_answers ) {
        return false;
    }
    
    // The list is shorter than the run of days, and the site itself wraps:
    //   Mt = function(e){ ... return xt[e % xt.length].text }
    // so a plain slice fell off the end and returned nothing.
    let answers = [];
    
    for ( let i = 0; i < number_to_get; i++ ) {
        const entry = all_answers[ ( diff + i ) % all_answers.length ];
        answers.push( entry.answer + ' |~~~~| ' + entry.text );
    }
    
    return {
        'type': 'Searchle',
        'publishedDate': published,
        'scheduledDate': scheduled,
        'startingNumber': puzzleNumber,
        'answers': answers
    };
    
}
