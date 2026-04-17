import {_phrazleAnswers} from './_phrazle-answers.mjs';
import {
    convertDateForSQL,
    getCurrentDayInTimezone,
    getSpecificDay
} from "./helpers.mjs";

const Config = {
    number: 1,
    date: getSpecificDay('2022-08-31'),
    schedule: {
        h: 11,
        m: 0
    },
    tz: 'Indian/Maldives'
}
const start_index = 135.5;

export function getAnswers( date_string, number_to_get ) {
    
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
    
    let index = start_index + diff;
    let answers = [];
    let pair = [];
    
    let splice_index = index * 2;
    let end_index = (index * 2) + (number_to_get * 2);
    let total_answers = _phrazleAnswers.length;
    if (splice_index > total_answers) {
        // Subtract the start index until it's less than the total answers
        while (splice_index > total_answers) {
            splice_index -= total_answers;
        }
        
        end_index = splice_index + (number_to_get * 2);
    }
    
    let chunk;
    
    if (end_index > total_answers) {
        chunk = _phrazleAnswers.slice(splice_index, total_answers);
        let remainder = end_index % total_answers;
        chunk = chunk.concat(_phrazleAnswers.slice(0, remainder));
        
    } else {
        chunk = _phrazleAnswers.slice(splice_index, end_index);
    }
    
    chunk.every( function(obj, index) {
        pair.push( obj.phrase );
        
        if ( index % 2 === 1 ) {
            answers.push( pair.join(' / ') );
            pair = [];
        }
        
        return true;
    })
    
    return {
        'type': 'Phrazle',
        'publishedDate': published,
        'scheduledDate': scheduled,
        'startingNumber': puzzleNumber,
        'answers': answers
    };
}