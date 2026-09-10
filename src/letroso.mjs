import {
    collectAnswers,
    convertDateForSQL,
    getCurrentDayInTimezone,
    getSpecificDay
} from "./helpers.mjs";
import {launchBrowser} from "./browser.mjs";

const Config = {
    number: 316,
    date: getSpecificDay('2025-07-14'),
    schedule: {
        h: 18,
        m: 0
    },
    tz: 'Etc/UTC'
}

const ANSWER_TIMEOUT_MS = 20000;
const POLL_INTERVAL_MS = 500;

/*
The puzzle is delivered over Firestore's Listen channel, which the SDK streams via fetch() +
ReadableStream (it initialises with useFetchStreams). CDP Fetch interception only exposes the
buffered prefix of that long-poll, so the answer was frequently never visible; tapping fetch inside
the page sees the whole stream as it arrives. An XHR tap is kept as a fallback for the SDK's
alternate transport.

Two other things are required for the page to request the puzzle at all:
  - the tutorial modal must be marked as seen, or the game never starts on a fresh profile
  - Firebase App Check (reCAPTCHA Enterprise) must accept the browser, which a locally driven
    Chromium fails - see SCRAPING_BROWSER_URL in browser.mjs
*/
function installFirestoreTap() {
    
    localStorage.setItem( 'letroso-tutorial-done-in', JSON.stringify( ['en', 'es', 'pt'] ) );
    
    window.__letrosoAnswer = null;
    window.__letrosoDenied = false;
    
    const scan = ( text ) => {
        if ( !window.__letrosoAnswer ) {
            const match = text.match( /"answer"\s*:\s*\{\s*"stringValue"\s*:\s*"([^"]+)"/ );
            if ( match ) {
                window.__letrosoAnswer = match[1];
            }
        }
        if ( text.includes( 'insufficient permissions' ) ) {
            window.__letrosoDenied = true;
        }
    };
    
    const originalFetch = window.fetch;
    window.fetch = async function ( ...args ) {
        const response = await originalFetch.apply( this, args );
        try {
            const url = typeof args[0] === 'string' ? args[0] : ( args[0] && args[0].url ) || '';
            if ( url.includes( 'firestore.googleapis.com' ) && response.body ) {
                const clone = response.clone();
                ( async () => {
                    const reader = clone.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = '';
                    for ( ;; ) {
                        const { done, value } = await reader.read();
                        if ( done ) break;
                        buffer += decoder.decode( value, { stream: true } );
                        scan( buffer );
                    }
                } )();
            }
        } catch {}
        return response;
    };
    
    const OriginalXHR = window.XMLHttpRequest;
    window.XMLHttpRequest = function () {
        const xhr = new OriginalXHR();
        const grab = () => {
            try {
                if ( xhr.responseText ) scan( xhr.responseText );
            } catch {}
        };
        xhr.addEventListener( 'progress', grab );
        xhr.addEventListener( 'load', grab );
        return xhr;
    };
    window.XMLHttpRequest.prototype = OriginalXHR.prototype;
}

async function getAnswerFromSite( browser, date_string ) {
    
    const page = await browser.newPage();
    
    try {
        await page.setCacheEnabled( false );
        await page.evaluateOnNewDocument( installFirestoreTap );
        
        await page.goto(
            'https://letroso.com/en/previous/' + date_string,
            { waitUntil: 'domcontentloaded' }
        );
        
        const deadline = Date.now() + ANSWER_TIMEOUT_MS;
        
        while ( Date.now() < deadline ) {
            
            const state = await page.evaluate( () => ( {
                answer: window.__letrosoAnswer,
                denied: window.__letrosoDenied
            } ) );
            
            if ( state.answer ) {
                return state.answer;
            }
            
            // Fail fast and say why, rather than burning the full timeout on a refusal.
            if ( state.denied ) {
                throw new Error( 'Firestore refused the read - Firebase App Check rejected this browser' );
            }
            
            await new Promise( resolve => setTimeout( resolve, POLL_INTERVAL_MS ) );
        }
        
        throw new Error( 'Timeout waiting for Firestore answer' );
        
    } finally {
        await page.close();
    }
}

export async function getAnswers( date_string, number_to_get ) {
    
    let date;
    if ( date_string === null ) {
        date = getCurrentDayInTimezone(Config.tz);
    } else {
        date = getSpecificDay(date_string);
    }
    
    const published = date.toString();
    const scheduled = convertDateForSQL( date.subtract({days: 1}), Config.schedule.h, Config.schedule.m );
    const diff = date.since(Config.date).days;
    const puzzleNumber = Config.number + diff;
    
    // One browser for the whole batch: a remote Scraping Browser session is billed per connection.
    const browser = await launchBrowser( { remote: true } );
    
    let answers = [];
    let errors = [];
    
    try {
        // Keep whatever was collected before a failure rather than losing the whole batch.
        ( { answers, errors } = await collectAnswers( number_to_get,
            ( i ) => getAnswerFromSite( browser, date.add( { days: i } ).toString() ), 'letroso' ) );
    } finally {
        await browser.close();
    }
    
    const result = {
        'type': 'Letroso',
        'publishedDate': published,
        'scheduledDate': scheduled,
        'startingNumber': puzzleNumber,
        'answers': answers
    };
    
    if ( errors.length ) {
        // Non-enumerable so the diagnostic never reaches WordPress, matching how get-answers.mjs
        // records dispatch-level failures. Direct access still works for the CLI and the route.
        Object.defineProperty( result, 'errors', {
            value: errors,
            enumerable: false,
            configurable: true
        } );
    }
    
    return result;
}
