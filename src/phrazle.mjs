import {_phrazleAnswers} from './_phrazle-answers.mjs';
import {getDateDisplay, getDayDifference, subDays} from "./helpers.mjs";

const start_date = 'August 31 2022';
const start_index = 135.5;
const starting_puzzle_number = 1;
const scheduled_time = {
    'hours': 7,
    'minutes': 0
};

export function getAnswers( date_string, number_to_get ) {
    
    let day_diff = getDayDifference( start_date, date_string );
    let start = starting_puzzle_number + day_diff;
    let index = start_index + day_diff;
    let answers = [];
    let pair = [];
    
    let published = new Date(date_string);
    let scheduled = subDays( published, 1 )
        scheduled.setHours( scheduled_time.hours );
        scheduled.setMinutes( scheduled_time.minutes );
    
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
        'publishedDate': getDateDisplay( published ),
        'scheduledDate': getDateDisplay( scheduled, true ),
        'startingNumber': start,
        'answers': answers
    };
}

// console.log( getAnswers( 'November 24 2023', 10) );
// console.log( getAnswers( 'January 30 2024', 10) );