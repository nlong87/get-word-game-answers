import fetch from "node-fetch";
import {getAnswer} from "./_quordle-answers.mjs";
import {
    convertDateForSQL,
    getCurrentDayInTimezone,
    getSpecificDay
} from "./helpers.mjs";

/*
Quordle has no answer API: the site picks each day's words in the browser, seeding a Mersenne
Twister with a day count and drawing from a word bank, skipping blacklisted words. That pick is
vendored in _quordle-answers.mjs, but the word banks and blacklist are read from the site's hashed
index bundle on every run, because Merriam-Webster edits them (adding MASSE to the
blacklist in 2026-10 changed all four of #1719's words).

Classic, Chill and Extreme share the pick and the blacklist but each has its own word bank. Chill
and Extreme both count days since 2024-07-29 and display that count as their number
("Daily Chill 802"), so on any day they share a number but not their words.
*/
const Config = {
    schedule: {
        h: 7,
        m: 0
    },
    tz: 'Indian/Maldives'
}
const Modes = {
    default: {
        name: 'Quordle',
        number: 486,
        date: getSpecificDay('2023-05-25'),
        bank: 'wordBank'
    },
    chill: {
        name: 'Quordle Chill',
        number: 0,
        date: getSpecificDay('2024-07-29'),
        bank: 'wordBankChill'
    },
    extreme: {
        name: 'Quordle Extreme',
        number: 0,
        date: getSpecificDay('2024-07-29'),
        bank: 'wordBankExtreme'
    }
}
const site_url = 'https://www.merriam-webster.com/games/quordle/';

// The bundle's filename is a content hash, so lists parsed from it stay valid until it changes.
let cached = { script: null, lists: null };

/**
 * Reads a word list the bundle declares as an array, e.g. wordBankChill:wd ... const wd=["ABOUT",...].
 *
 * @param {string} bundle - The index bundle's source.
 * @param {string} key - The property the game state stores the list under.
 * @returns {string[]|null} The words, or null when the list can't be found.
 */
function getArrayList( bundle, key ) {

    const name = bundle.match( new RegExp( `[,{]${key}:([\\w$]+)` ) );

    if ( !name ) {
        return null;
    }

    const escaped = name[1].replace( /\$/g, '\\$' );
    const list = bundle.match( new RegExp( `(?:^|[^\\w$])${escaped}=(\\["[A-Z]{5}"(?:,"[A-Z]{5}")*\\])` ) );

    return list ? JSON.parse( list[1] ) : null;
}

/**
 * Reads the word banks and blacklist from the site's index bundle.
 *
 * @returns {Promise<{wordBank: string[], wordBankChill: string[], wordBankExtreme: string[], blacklist: string[]}>}
 * @throws {Error} When the bundle or any list can't be found, rather than guess at answers.
 */
async function getWordLists() {

    const html = await fetch( site_url, {
        headers: {
            'User-Agent': 'Mozilla/5.0'
        }
    }).then( r => r.text() );
    const script = html.match( /\/games\/quordle\/assets\/index-[\w-]+\.js/ );

    if ( !script ) {
        throw new Error( 'Quordle index bundle not found on ' + site_url );
    }

    if ( cached.script === script[0] ) {
        return cached.lists;
    }

    const bundle = await fetch( new URL( script[0], site_url ) ).then( r => r.text() );
    const wordBank = bundle.match( /[,{]wordBank:"([A-Z ]+)"/ );
    const blacklist = bundle.match( /[,{]blacklist:"([A-Z ]+)"/ );
    const lists = {
        wordBank: wordBank ? wordBank[1].split( ' ' ) : null,
        wordBankChill: getArrayList( bundle, 'wordBankChill' ),
        wordBankExtreme: getArrayList( bundle, 'wordBankExtreme' ),
        blacklist: blacklist ? blacklist[1].split( ' ' ) : null
    };
    const missing = Object.keys( lists ).filter( key => !lists[key] );

    if ( missing.length ) {
        throw new Error( `Quordle ${missing.join(', ')} not found in ${script[0]}` );
    }

    cached = { script: script[0], lists };

    return lists;
}

export async function getAnswers( date_string, number_to_get, type = 'default' ) {

    const mode = Modes[type];

    let date;
    if ( date_string === null ) {
        date = getCurrentDayInTimezone(Config.tz);
    } else {
        date = getSpecificDay(date_string);
    }

    const published = date.toString();
    const scheduled = convertDateForSQL( date.subtract({days: 1}), Config.schedule.h, Config.schedule.m );
    const diff = date.since(mode.date).days;
    const puzzleNumber = mode.number + diff;
    const lists = await getWordLists();

    let answers = [];

    for( let i = 0; i < number_to_get; i++ ) {
        let words =  getAnswer( puzzleNumber+i, lists[mode.bank], lists.blacklist );
        answers.push( words.join(', ') );
    }

    return {
        'type': mode.name,
        'publishedDate': published,
        'scheduledDate': scheduled,
        'startingNumber': puzzleNumber,
        'answers': answers
    };
}
