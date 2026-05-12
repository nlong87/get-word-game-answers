import fetch from "node-fetch";
import {
    convertDateForSQL,
    getCurrentDayInTimezone,
    getSpecificDay
} from "./helpers.mjs";

const Config = {
    number: 1,
    date: getSpecificDay('2025-06-30'),
    schedule: {
        h: 0,
        m: 0
    },
    tz: 'America/Los_Angeles'
}
const base_script = "https://wordwormdormdork.com";

async function getScriptUrl() {
    
    return fetch(base_script + '/weaver-x/')
        .then((response) => response.text())
        .then(text => {
                
                const matches = text.match(/\/static\/js\/main\.\w+\.js/);
                
                return (matches) ? base_script + matches[0] : false;
                
            }
        );
    
}

async function getAnswersFromSite() {
    
    let script_url = '';
    await getScriptUrl().then(r => script_url = r);
    
    return fetch(script_url)
        .then((response) => response.text())
        .then(text => {
                
                const matches = [...text.matchAll(/var \w=\w\(\d+\);const \w=(\[.*?]).map/g)];
                const array = eval(matches[1][1]);
                
                return (Array.isArray(array)) ? array : false;
                
            }
        );
    
}

function trimData( answers ) {
    
    // The date that the search sequence starts at
    let start_date = "2025-10-20";
    
    // The puzzle sequence to look for, this one starts on Valentines Day and gets the 3 following days
    // It should be unlikely that this sequence occurs any other time
    let search_answers = [
        [ 'cut', 'paste' ],
        [ 'blood', 'moon' ],
        [ 'side', 'track' ],
        [ 'peace', 'mind' ]
    ];
    
    // Return the index that the sequence starts in
    let sequenceIndex = findSequenceInArray( answers, search_answers );
    
    if ( sequenceIndex ) {
        
        // Slice the data that the sequence begins, that way if they ever remove old pairs, our code will still function.
        return {
            'start_date': start_date,
            'answers': answers.slice( sequenceIndex )
        };
    } else {
        return false;
    }
    
}

function findSequenceInArray(array, sequence) {
    for(let index = 0; index < array.length; index++) {
        if(sequence.every((sequenceValue, sequenceIndex) => sequenceValue[0] === array[index + sequenceIndex][0] && sequenceValue[1] === array[index + sequenceIndex][1])) {
            return index;
        }
    }
    
    return -1; // return -1 if the sequence was not found
}

export async function getAnswers( date_string, number_to_get ) {
    
    let date;
    if (date_string === null) {
        date = getCurrentDayInTimezone(Config.tz);
    } else {
        date = getSpecificDay(date_string);
    }
    
    const published = date.toString();
    const scheduled = convertDateForSQL(date, Config.schedule.h, Config.schedule.m);
    const diff = date.since(Config.date).days;
    const puzzleNumber = Config.number + diff;
    
    let answers = [];
    const all_answers = await getAnswersFromSite();
    
    if ( ! all_answers ) {
        return false;
    }
    
    // Trim the array of answers to a set date so it's more predictable
    const data = trimData( all_answers );
    
    if ( !data ) {
        return false;
    }
    
    // Get the difference from the start sequence and the target date
    const sliceIndex = date.since(getSpecificDay(data.start_date)).days;
    
    // Slice the answers based on that difference and map the answer array into a comma separated string
    answers = data.answers.slice( sliceIndex, sliceIndex+number_to_get ).map( x => x[3].join(', ') );
    
    return {
        'type': 'weaver-x',
        'publishedDate': published,
        'scheduledDate': scheduled,
        'startingNumber': puzzleNumber,
        'answers': answers
    };
    
}