import fetch from "node-fetch";
import {
    convertDateForSQL,
    getCurrentDayInTimezone,
    getSpecificDay
} from "./helpers.mjs";

const Config = {
    number: 386,
    date: getSpecificDay('2023-06-12'),
    schedule: {
        h: 14,
        m: 0
    },
    tz: 'Asia/Dubai'
}
const gameStartDays = 19134;

function getPuzzleNumber( day ) {
    return day - gameStartDays;
}

async function getSecretWord(day) {
    
    let puzzleNumber = getPuzzleNumber(day);
    let url = 'https://server.semantle.com/semantle/junior/game/' + puzzleNumber;
    
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Accept': 'application/json, text/javascript, */*'
        }
    })
    
    const json = await response.json();
    return json['secretWord'];
}

export async function getAnswers( date_string, number_to_get) {
    
    let date;
    if (date_string === null) {
        date = getCurrentDayInTimezone(Config.tz);
    } else {
        date = getSpecificDay(date_string);
    }
    
    const published = date.toString();
    const scheduled = convertDateForSQL(date.subtract({days: 1}), Config.schedule.h, Config.schedule.m);
    const diff = date.since(Config.date).days;
    const puzzleNumber = Config.number + diff;
    
    const epochMs = date.toZonedDateTime({ timeZone: "UTC" })
        .toInstant()
        .epochMilliseconds;
    
    // 86400000 = Day in Milliseconds
    const daysSinceEpoch = Math.floor(epochMs / 86400000);
    
    let answers = [];
    let answer;
    
    for( let i = 0; i < number_to_get; i++ ) {
        await getSecretWord( daysSinceEpoch + i ).then(r => answer = r.toUpperCase() );
        answers.push( answer );
    }
    
    return {
        'type': 'Semantle Junior',
        'publishedDate': published,
        'scheduledDate': scheduled,
        'startingNumber': puzzleNumber,
        'answers': answers
    };
}