import fetch from "node-fetch";
import {
    getCurrentDayInTimezone,
    getSpecificDay,
    scheduleForSite
} from "./helpers.mjs";

/*
Batter Up serves its games as a static JSON file per day on CloudFront: games_batterup{YYYY-MM-DD}.json
holds every game up to and including that date, with the answer in player_name. The file for a day is
uploaded the evening before, and until then it answers 403 AccessDenied, so at most one day ahead is
ever available. The day resets at midnight Eastern, the same date the site's bundle uses.

The site displays "#" + game_number, which counts days since 2024-02-18 (2024-02-19 is #1). The old
PHP plugin numbered one higher (days + 1), so its "Batter Up 927" is the site's #926.
*/
const Config = {
    number: 1,
    date: getSpecificDay('2024-02-19'),
    // Wall-clock time in tz on the puzzle's own date; see scheduleForSite().
    schedule: {
        h: 0,
        m: 5,
        tz: 'America/New_York'
    },
    tz: 'America/New_York'
}
const site_url = 'https://www.batter-up.app/';
const fallback_host = 'https://d2p6wz32uy8hq3.cloudfront.net';

/**
 * Finds the CloudFront host the site loads its data from.
 *
 * The host is only referenced in the site's hashed index bundle. If it can't be read, the
 * last known host is used instead.
 *
 * @returns {Promise<string>} The host, with no trailing slash.
 */
async function getDataHost() {

    try {
        const html = await fetch( site_url ).then( r => r.text() );
        const script = html.match( /assets\/index-[\w-]+\.js/ );

        if ( script ) {
            const bundle = await fetch( site_url + script[0] ).then( r => r.text() );
            const host = bundle.match( /https:\/\/[a-z0-9]+\.cloudfront\.net/ );

            if ( host ) {
                return host[0];
            }
        }
    } catch ( e ) {
        console.warn( `  Batter Up host discovery failed, using ${fallback_host}: ${e.message}` );
    }

    return fallback_host;
}

/**
 * Fetches the game list as of a date.
 *
 * @param {string} host - CloudFront host from getDataHost().
 * @param {Temporal.PlainDate} date - The file's date.
 * @returns {Promise<Object[]|null>} The games, or null when that day's file isn't published (403).
 */
async function getGames( host, date ) {

    const response = await fetch( `${host}/games_batterup${date.toString()}.json`, {
        headers: {
            'Accept': 'application/json'
        }
    });

    if ( !response.ok ) {
        return null;
    }

    try {
        const json = await response.json();
        return Array.isArray( json?.games ) ? json.games : null;
    } catch ( e ) {
        return null;
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
    const scheduled = scheduleForSite( date, Config.schedule );
    const diff = date.since(Config.date).days;
    let puzzleNumber = Config.number + diff;

    const host = await getDataHost();

    // Each file holds every game up to its date, so one file covers the whole range. Use the newest
    // one that is published. Older files expire after a few weeks, so a backfill falls back to
    // today's, which still lists every past game.
    let games = null;
    for ( let i = number_to_get - 1; i >= 0 && !games; i-- ) {
        games = await getGames( host, date.add({days: i}) );
    }
    if ( !games ) {
        games = await getGames( host, getCurrentDayInTimezone(Config.tz) );
    }

    const byDate = new Map( ( games ?? [] ).map( game => [ game.game_date, game ] ) );

    let answers = [];

    for ( let i = 0; i < number_to_get; i++ ) {

        const game = byDate.get( date.add({days: i}).toString() );

        // Every later day is unpublished too, so stop rather than leaving a hole.
        if ( !game?.player_name ) {
            break;
        }

        if ( i === 0 && Number.isInteger( game.game_number ) && game.game_number !== puzzleNumber ) {
            console.warn( `  Batter Up #${game.game_number} on ${published} doesn't match Config (#${puzzleNumber}); using the site's number.` );
            puzzleNumber = game.game_number;
        }

        answers.push( game.player_name );
    }

    return {
        'type': 'Batter Up',
        'publishedDate': published,
        'scheduledDate': scheduled,
        'startingNumber': puzzleNumber,
        // Files go up at most a day ahead, so a short result is expected rather than a failure.
        'clamped': true,
        'answers': answers
    };

}
