import fetch from 'node-fetch';
import {
    convertDateForSQL,
    getCurrentDayInTimezone,
    getSpecificDay
} from "./helpers.mjs";

const Config = {
    number: 457,
    date: getSpecificDay('2023-05-25'),
    schedule: {
        h: 11,
        m: 0
    },
    tz: 'Etc/GMT-7'
}
/*
Loaded on first use rather than at import. Every type imports this module through get-answers.mjs,
so a top-level fetch that failed (tryhardguides.com's bot check answers 403 with an HTML page) took
down every puzzle, not just Pimantle.
*/
let wordList;

async function getWordList() {

    if ( !wordList ) {
        const response = await fetch("https://tryhardguides.com/wp-content/plugins/try-hard-core/media/pimantle-word-list.json");
        if ( !response.ok ) {
            throw new Error( `word list: HTTP ${response.status}` );
        }
        wordList = ( await response.json() ).answers;
    }

    return wordList;
}


async function getAnswer( puzzleNumber ) {

    const response = await fetch("https://semantle.pimanrul.es/secret_words/secret_word_" + puzzleNumber + ".bin?2", {
        method: 'GET',
        headers: {
            'Accept': 'application/json, text/javascript, */*'
        },
    });

    const buffer = await response.arrayBuffer();

    let dataView = new DataView(buffer);
    let offset = 4;

    let index = dataView.getUint32(offset, true);

    return ( await getWordList() )[index][0];

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
    
    let answers = [];
    
    for( let i = 0; i < number_to_get; i++ ) {
        let answer = await getAnswer( puzzleNumber+i );
        answers.push( answer );
    }
    
    return {
        'type': 'Pimantle',
        'publishedDate': published,
        'scheduledDate': scheduled,
        'startingNumber': puzzleNumber,
        'answers': answers
    };

}