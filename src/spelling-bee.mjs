import fetch from "node-fetch";
import {
    collectAnswers,
    getCurrentDayInTimezone,
    getSpecificDay,
    scheduleForSite
} from "./helpers.mjs";

/*
NYT Spelling Bee, moved here from the WordPress plugin (class-nyt-spelling-bee.php).

The plugin scraped `window.gameData` out of /puzzles/spelling-bee/<date>, but that page only exists
for the last week and 404s for tomorrow. The game's own JSON API serves every day since launch and
about 12 days ahead, so it is read instead. Past the horizon it 404s, which ends the batch.

Its `answers` leaves the pangrams out, while the page's (and so the plugin's) list starts with them.
Prepending `pangrams` rebuilds the plugin's string exactly: `answers,... |~~~~| pangrams,...`.

The payload's `id` is internal and jumps around (10512, 13867, 20881 on consecutive days), and the site
shows no number. The plugin numbered days from 2023-05-26 as #1; keeping that is what lets these posts
match the existing "NYT Spelling Bee <n>" answer posts by title.
*/
const Config = {
    number: 1,
    date: getSpecificDay('2023-05-26'),
    // WordPress publishes each answer at 00:01 Pacific on the puzzle's own day, not the evening before.
    schedule: {
        h: 0,
        m: 1,
        tz: 'America/Los_Angeles'
    },
    // A new puzzle goes up at 3am Eastern, which is midnight Pacific.
    tz: 'America/Los_Angeles'
}
const api_url = 'https://www.nytimes.com/svc/spelling-bee/v1/';

async function getAnswer( date ) {

    const date_string = date.toString();
    const response = await fetch( api_url + date_string + '.json', {
        headers: {
            'Accept': 'application/json, text/javascript, */*'
        }
    });

    // Not published this far ahead yet.
    if ( !response.ok ) {
        return false;
    }

    const puzzle = await response.json();

    if ( puzzle?.print_date !== date_string ) {
        throw new Error( `asked for ${date_string} but got print_date ${puzzle?.print_date}` );
    }

    if ( !Array.isArray( puzzle.answers ) || !puzzle.answers.length || !Array.isArray( puzzle.pangrams ) ) {
        throw new Error( `${date_string} has no answers` );
    }

    return [ ...puzzle.pangrams, ...puzzle.answers ].join(',') + ' |~~~~| ' + puzzle.pangrams.join(',');
}

export async function getAnswers( date_string, number_to_get ) {

    let date;
    if ( date_string === null ) {
        date = getCurrentDayInTimezone(Config.tz);
    } else {
        date = getSpecificDay(date_string);
    }

    const { answers, errors } = await collectAnswers( number_to_get,
        ( i ) => getAnswer( date.add({ days: i }) ), 'spelling-bee' );

    const result = {
        'type': 'NYT Spelling Bee',
        'publishedDate': date.toString(),
        'scheduledDate': scheduleForSite( date, Config.schedule ),
        'startingNumber': Config.number + date.since( Config.date ).days,
        'answers': answers
    };

    if ( errors.length ) {
        // Non-enumerable so the diagnostic never reaches WordPress (see get-answers.mjs).
        Object.defineProperty( result, 'errors', {
            value: errors,
            enumerable: false,
            configurable: true
        });
    }

    return result;
}
