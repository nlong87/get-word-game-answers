import './env.mjs';
import { Temporal } from '@js-temporal/polyfill';
import 'puppeteer-extra'

export function getCurrentDayInTimezone(timeZone = "America/Los_Angeles") {
    return Temporal.Now.zonedDateTimeISO(timeZone).toPlainDate();
}

export function getSpecificDay(date) {
    return Temporal.PlainDate.from(date);
}

export function convertDateForSQL( date, hours, minutes ) {
    const date_string = date.toString();
    let h = String(hours).padStart(2, "0");
    let i = String(minutes).padStart(2, "0");
    
    return `${date_string} ${h}:${i}:00`;
}

export async function proxyWebsite( fetch_url ) {
    
    const api_key = process.env.PROXY_API_KEY;
    
    const response = await fetch("https://api.brightdata.com/request", {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + api_key,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            zone: "web_unlocker1",
            url: fetch_url,
            format: "raw",
        }),
    });
    
    const data = await response.text();
    return data;
}
/**
 * Runs fetchOne(i) up to number_to_get times, keeping whatever it collects.
 *
 * A source that fails or runs out part-way should not discard the answers already gathered, so
 * this stops at the first error (later days are almost always unavailable too, and retrying them
 * is slow) and hands back both the partial list and the reason it stopped.
 *
 * @param {number} number_to_get - How many answers to attempt.
 * @param {Function} fetchOne - async (index) => answer. Return false/null to signal "not published
 *                              yet", which ends collection without recording an error.
 * @param {string} label - Puzzle name, used in the recorded error message.
 * @returns {Promise<{answers: Array, errors: Array}>}
 */
export async function collectAnswers( number_to_get, fetchOne, label = 'answers' ) {
    
    const answers = [];
    const errors = [];
    
    for ( let i = 0; i < number_to_get; i++ ) {
        
        try {
            const answer = await fetchOne( i );
            
            // Not published this far ahead - an expected stop, not a failure.
            if ( answer === false || answer === null || answer === undefined ) {
                break;
            }
            
            answers.push( answer );
            
        } catch ( error ) {
            const message = `${label} failed after ${answers.length} of ${number_to_get}: ${error.message}`;
            console.error( `  ${message}` );
            errors.push( message );
            break;
        }
    }
    
    return { answers, errors };
}
