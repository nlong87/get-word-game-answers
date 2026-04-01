import {manual_post_answers, process_answers} from "./index.js";

const s_date = "2026-03-30";

// manual_post_answers( 'pimantle', 5, s_date).then(r => console.log(r));
// manual_post_answers( 'letroso', 7, s_date).then(r => console.log(r));
// manual_post_answers( 'connections', 1, s_date).then(r => console.log(r));
// manual_post_answers( 'harmonies', 1, s_date);
// manual_post_answers( 'poeltl', 1, s_date);
// manual_post_answers( 'keyword', 2, s_date);
// manual_post_answers( 'marveldle', 1);
// manual_post_answers( 'revealed', 2, s_date);
// manual_post_answers( 'parseword', 1, s_date);
// manual_post_answers( 'on_the_record', 2, s_date);
// manual_post_answers( 'searchle', 10, s_date).then(r => console.log(r));
// manual_post_answers( 'shuffalo', 1, s_date).then(r => console.log(r));
// manual_post_answers( 'squareword', 4, s_date).then(r => console.log(r));
// manual_post_answers( 'weaver', 8, s_date).then(r => console.log(r));
// manual_post_answers( 'weaver-x', 7, s_date).then(r => console.log(r));
// manual_post_answers( 'colordle', 10, s_date).then(r => console.log(r));

// process_answers( 'letroso', 1, s_date).then(r => console.log(r));
// process_answers( 'connections', 5, s_date).then(r => console.log(r));
// process_answers( 'wordle', 8, s_date).then(r => console.log(r));
// process_answers( 'revealed', 3, s_date).then(r => console.log(r));
// process_answers( 'keyword', 8, s_date).then(r => console.log(r));
// process_answers( 'marveldle', 1, s_date).then(r => console.log(r));
// process_answers( 'poeltl', 1, s_date).then(r => console.log(r));
// process_answers( 'jumble', 5, s_date).then(r => console.log(r));
// process_answers( 'shuffalo', 3, s_date).then(r => console.log(r));
// process_answers( 'pimantle', 10, s_date).then(r => console.log(r));
// process_answers( 'harmonies', 1, s_date).then(r => console.log(r));
// process_answers( 'pimantle', 2, null).then(r => console.log(r));
// process_answers( 'squareword', 7, s_date).then(r => console.log(r));
// process_answers( 'revealed', 5).then(r => console.log(r));
// process_answers( 'parseword', 1).then(r => console.log(r));
// process_answers( 'quordle', 5).then(r => console.log(r));


// Process multiple Poeltl
/*
let start_date = new Date("2025-06-02 12:00:00");
let date = start_date;
let date_string = '';
let i = 0;
let total = 5;
while( i < total ) {
    
    date = new Date( start_date.toDateString() );
    date.setDate(date.getDate() + i );
    
    date_string = date.getFullYear() + '-' + ('0' + (date.getMonth()+1)).slice(-2) + '-' +
        ('0' + date.getDate()).slice(-2);
    
    
    await manual_post_answers( 'poeltl', 1, date_string).then();
    
    i++;
}
*/