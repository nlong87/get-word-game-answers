import fetch from 'node-fetch';
import {getDateDisplay, getDayDifference, subDays} from "./helpers.mjs";

const start_date = 'May 25 2023';
const start_puzzle_number = 457;
const scheduled_time = {
    'hours': 7,
    'minutes': 0
};
let wordList;
await fetch("https://tryhardguides.com/wp-content/plugins/try-hard-core/media/pimantle-word-list.json")
    .then(res => res.text())
    .then(data => wordList = JSON.parse(data).answers);


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

    return wordList[index][0];

}

export async function getAnswers( date_string, number_to_get) {
    
    let day_diff = getDayDifference( start_date, date_string );

    let puzzleNumber = start_puzzle_number + day_diff;
    let answers = [];
    
    let published = new Date(date_string);
    let scheduled = subDays( published, 1 )
        scheduled.setHours( scheduled_time.hours );
        scheduled.setMinutes( scheduled_time.minutes );
    
    for( let i = 0; i < number_to_get; i++ ) {
        let answer = await getAnswer( puzzleNumber+i );
        answers.push( answer );
    }
    
    return {
        'type': 'Pimantle',
        'publishedDate': getDateDisplay( published ),
        'scheduledDate': getDateDisplay( scheduled, true ),
        'startingNumber': start_puzzle_number + day_diff,
        'answers': answers
    };

}