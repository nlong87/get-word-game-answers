import fetch from "node-fetch";
import {getAnswer} from "./_quordle-answers.mjs";
import {
    convertDateForSQL,
    getCurrentDayInTimezone,
    getSpecificDay
} from "./helpers.mjs";

/*
Quordle has no answer API: the site picks each day's words in the browser, seeding a Mersenne
Twister with days since 2022-01-24 and drawing from the word bank, skipping blacklisted words.
That pick is vendored in _quordle-answers.mjs, but the word bank and blacklist are read from the
site's hashed index bundle on every run, because Merriam-Webster edits them (adding MASSE to the
blacklist in 2026-10 changed all four of #1719's words).
*/
const Config = {
    number: 486,
    date: getSpecificDay('2023-05-25'),
    schedule: {
        h: 7,
        m: 0
    },
    tz: 'Indian/Maldives'
}
const site_url = 'https://www.merriam-webster.com/games/quordle/';

/**
 * Reads the word bank and blacklist from the site's index bundle.
 *
 * @returns {Promise<{wordBank: string[], blacklist: string[]}>}
 * @throws {Error} When the bundle or either list can't be found, rather than guess at answers.
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

    const bundle = await fetch( new URL( script[0], site_url ) ).then( r => r.text() );
    const wordBank = bundle.match( /[,{]wordBank:"([A-Z ]+)"/ );
    const blacklist = bundle.match( /[,{]blacklist:"([A-Z ]+)"/ );

    if ( !wordBank || !blacklist ) {
        throw new Error( `Quordle word lists not found in ${script[0]}` );
    }

    return {
        wordBank: wordBank[1].split( ' ' ),
        blacklist: blacklist[1].split( ' ' )
    };
}

export async function getAnswers( date_string, number_to_get) {

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
    const { wordBank, blacklist } = await getWordLists();

    let answers = [];

    for( let i = 0; i < number_to_get; i++ ) {
        let words =  getAnswer( puzzleNumber+i, wordBank, blacklist );
        answers.push( words.join(', ') );
    }

    return {
        'type': 'Quordle',
        'publishedDate': published,
        'scheduledDate': scheduled,
        'startingNumber': puzzleNumber,
        'answers': answers
    };
}
