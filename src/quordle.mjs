import {getAnswer} from "./_quordle-answers.mjs";
import {getDateDisplay, getDayDifference, subDays} from "./helpers.mjs";

const start_date = 'May 25 2023';
const start_number = 486;
const scheduled_time = {
    'hours': 7,
    'minutes': 0
};

export function getAnswers( date_string, number_to_get) {
    
    let day_diff = getDayDifference( start_date, date_string );
    let puzzleNumber = start_number + day_diff;
    let answers = [];
    
    let published = new Date(date_string);
    let scheduled = subDays( published, 1 )
        scheduled.setHours( scheduled_time.hours );
        scheduled.setMinutes( scheduled_time.minutes );
    
    for( let i = 0; i < number_to_get; i++ ) {
        let words =  getAnswer( puzzleNumber+i );
        answers.push( words.join(', ') );
    }
    
    return {
        'type': 'Quordle',
        'publishedDate': getDateDisplay( published ),
        'scheduledDate': getDateDisplay( scheduled, true ),
        'startingNumber': start_number + day_diff,
        'answers': answers
    };
}