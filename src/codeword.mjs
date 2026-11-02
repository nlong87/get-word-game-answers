import fetch from "node-fetch";
import * as cheerio from "cheerio";
import {
    convertDateForSQL,
    getCurrentDayInTimezone,
    getSpecificDay,
} from "./helpers.mjs";

/*
USA Today's Codeword (games.usatoday.com/games/codeword) is Arkadium's Codeword in an iframe, and it
reads the game's default feed: one Crossword Compiler XML file per day, named by YYMMDD. Checked on
2026-11-02 by matching the grid on the site against that day's file. The files were all generated in
Dec 2022 and run from 2020-01-01 to at least 2031-01-01 (2035 404s), so there's no publishing
horizon to worry about.

The site shows a date, never a number, so the number is an internal count from 2026-01-01 (#1).
The game rolls over at the player's local midnight; the US audience decides `tz`.

Each answer is a structured object, not a delimited string:
    { title, givens: { number: letter }, key: { number: letter }, words: [ ... ] }
`givens` are the letters the puzzle starts with filled in; `key` is the full solution.
*/

const Config = {
    number: 1,
    date: getSpecificDay('2026-01-01'),
    schedule: {
        h: 18,
        m: 0
    },
    tz: 'America/New_York'
}
const FEED = 'https://ams.cdn.arkadiumhosted.com/assets/gamesfeed/codeword/daily-codeword-';

function feedUrl( date ) {
    const yy = String(date.year % 100).padStart(2, '0');
    const mm = String(date.month).padStart(2, '0');
    const dd = String(date.day).padStart(2, '0');
    return `${FEED}${yy}${mm}${dd}.xml`;
}

// "1-6" -> [1..6], "2" -> [2]
function expandRange( value ) {
    const [ from, to = from ] = String(value).split('-').map(n => parseInt(n, 10));
    if ( !Number.isInteger(from) || !Number.isInteger(to) || to < from ) {
        throw new Error(`bad word range "${value}"`);
    }
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

// Numbers are object keys, so sort them numerically rather than relying on insertion order.
function sortedByNumber( map ) {
    return Object.fromEntries(Object.entries(map).sort(([a], [b]) => a - b));
}

export function parseCodeword( xml ) {

    const $ = cheerio.load(xml, { xmlMode: true });

    const cells = new Map();
    const key = {};
    const givens = {};

    $('grid > cell').each((_, el) => {
        const cell = $(el);
        if ( cell.attr('type') === 'block' ) return;

        const letter = (cell.attr('solution') || '').toUpperCase();
        const number = parseInt(cell.attr('number'), 10);
        if ( !/^[A-Z]$/.test(letter) || !Number.isInteger(number) ) {
            throw new Error(`bad cell at ${cell.attr('x')},${cell.attr('y')}`);
        }
        if ( key[number] && key[number] !== letter ) {
            throw new Error(`code ${number} maps to both ${key[number]} and ${letter}`);
        }

        key[number] = letter;
        if ( cell.attr('hint') === 'true' ) givens[number] = letter;
        cells.set(`${cell.attr('x')},${cell.attr('y')}`, letter);
    });

    const words = [];
    $('word').each((_, el) => {
        const word = $(el);
        let text = '';
        for ( const y of expandRange(word.attr('y')) ) {
            for ( const x of expandRange(word.attr('x')) ) {
                const letter = cells.get(`${x},${y}`);
                if ( !letter ) throw new Error(`word ${word.attr('id')} crosses an empty cell at ${x},${y}`);
                text += letter;
            }
        }
        words.push(text);
    });

    if ( !Object.keys(key).length || !words.length ) {
        throw new Error('no grid or words in the file');
    }

    return {
        title: $('metadata > title').first().text().trim(),
        givens: sortedByNumber(givens),
        key: sortedByNumber(key),
        words
    };
}

async function getAnswer( date ) {

    const url = feedUrl(date);
    const response = await fetch(url);
    if ( !response.ok ) {
        throw new Error(`Codeword ${date}: HTTP ${response.status} from ${url}`);
    }

    try {
        return parseCodeword(await response.text());
    } catch ( error ) {
        throw new Error(`Codeword ${date}: ${error.message}`);
    }
}

export async function getAnswers( date_string, number_to_get ) {

    let date;
    if (date_string === null) {
        date = getCurrentDayInTimezone(Config.tz);
    } else {
        date = getSpecificDay(date_string);
    }

    const published = date.toString();
    const scheduled = convertDateForSQL(date.subtract({days: 1}), Config.schedule.h, Config.schedule.m);
    const puzzleNumber = Config.number + date.since(Config.date).days;

    let answers = [];

    for ( let i = 0; i < number_to_get; i++ ) {
        answers.push( await getAnswer( date.add( { days: i } ) ) );
    }

    return {
        'type': 'Codeword',
        'publishedDate': published,
        'scheduledDate': scheduled,
        'startingNumber': puzzleNumber,
        'answers': answers
    };
}
