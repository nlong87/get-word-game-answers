import fetch from "node-fetch";
import {
    convertDateForSQL,
    getCurrentDayInTimezone,
    getSpecificDay
} from "./helpers.mjs";

/*
Scrandle displays no puzzle number (its share text is just the date), so Config.number is our own
count of days since 2025-04-01, the earliest day /history serves. The day resets at midnight UK
time, and /history answers 400 for any day after today, so only one answer is ever available.
*/
const Config = {
    number: 1,
    date: getSpecificDay('2025-04-01'),
    schedule: {
        h: 0,
        m: 5
    },
    tz: 'Europe/London'
}
const api_url = 'https://scrandle.com/history/';

/**
 * Normalizes one round (a pair of scrans) down to the fields we post.
 *
 * The higher rating wins; on a tie the game accepts either pick, so both are flagged correct.
 *
 * @param {Object[]} pair - The two scran objects for a round.
 * @returns {Object[]} `{ title, club, country, rating, correct }` for each scran.
 */
function formatRound( pair ) {

    const best = Math.max( ...pair.map( scran => scran.rating ) );

    return pair.map( scran => ({
        "title": scran.title,
        "club": scran.club,
        "country": scran.country,
        "rating": scran.rating,
        "correct": scran.rating === best
    }) );
}

async function getAnswer( date ) {

    const response = await fetch( api_url + date.toString(), {
        method: 'GET',
        headers: {
            'Accept': 'application/json, text/javascript, */*'
        },
    });

    // A future day answers 400 ("The future is a foreign land").
    if ( !response.ok ) {
        return false;
    }

    const puzzle = await response.json();

    return Array.isArray( puzzle?.data ) ? puzzle : false;
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

    let answers = [];

    for ( let i = 0; i < number_to_get; i++ ) {

        const puzzle = await getAnswer( date.add({days: i}) );

        // Every later day is unpublished too, so stop rather than leaving a hole.
        if ( !puzzle ) {
            break;
        }

        answers.push({
            "rounds": puzzle.data.map( formatRound )
        });
    }

    return {
        'type': 'Scrandle',
        'publishedDate': published,
        'scheduledDate': scheduled,
        'startingNumber': puzzleNumber,
        // Only today is ever published, so a short result is expected rather than a failure.
        'clamped': true,
        'answers': answers
    };

}
