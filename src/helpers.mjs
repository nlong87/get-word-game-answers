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

// WordPress's timezone_string. scheduledDate is read as wall-clock time in this zone.
export const SITE_TZ = 'America/Phoenix';

/**
 * scheduledDate for a game that goes live at local time in a zone with DST.
 *
 * convertDateForSQL writes a fixed site-zone time, which only lines up with such a game for half
 * the year. This takes the time in the game's own zone instead and converts it per date.
 *
 * @param {Temporal.PlainDate} date - The puzzle date; the time is on this day in `schedule.tz`.
 * @param {{h: number, m: number, tz: string}} schedule - Wall-clock time and the zone it is in.
 * @returns {string} 'YYYY-MM-DD HH:MM:SS' in SITE_TZ.
 */
export function scheduleForSite( date, schedule ) {
    const site = date
        .toZonedDateTime({ timeZone: schedule.tz, plainTime: { hour: schedule.h, minute: schedule.m } })
        .withTimeZone( SITE_TZ );

    return convertDateForSQL( site.toPlainDate(), site.hour, site.minute );
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
 * Validates an `only` list for a module that fans out to several result keys.
 *
 * A Cloud Scheduler job narrowed to one key would otherwise post nothing, quietly, if its key were
 * misspelled, so an unknown key throws and the route answers 503 with an alert.
 *
 * @param {string[]|null} only - Result keys to keep, or null for all of them.
 * @param {string[]} keys - Every key the module can produce.
 * @param {string} label - Puzzle name, used in the error message.
 * @returns {(key: string) => boolean} Whether a key was asked for.
 */
export function selectedKeys( only, keys, label ) {

    const unknown = ( only ?? [] ).filter( key => !keys.includes( key ) );

    if ( unknown.length ) {
        throw new Error( `unknown ${label} key(s): ${unknown.join(', ')} (expected one of ${keys.join(', ')})` );
    }

    return key => !only || only.includes( key );
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
