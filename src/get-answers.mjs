import { getAnswers as colordle} from './colordle.mjs';
import { getAnswers as connections} from './connections.mjs';
import { getAnswers as contexto } from './contexto.mjs';
import { getAnswers as harmonies } from './harmonies.mjs';
import { getAnswers as jumble } from './jumble.mjs';
import { getAnswers as keyword } from './keyword.mjs';
import { getAnswers as letroso } from './letroso.mjs';
import { getAnswer as marveldle } from './marveldle.mjs';
import { getAnswers as nerdle } from './nerdle.mjs';
import { getAnswers as on_the_record } from './on-the-record.mjs';
import { getAnswers as parseword } from './parseword.mjs';
import { getAnswers as phrazle } from './phrazle.mjs';
import { getAnswers as pimantle } from './pimantle.mjs';
import { getAnswer as poeltl } from './poeltl.mjs';
import { getAnswers as quordle } from './quordle.mjs';
import { getAnswers as revealed } from './revealed.mjs';
import { getAnswers as searchle } from './searchle.mjs';
import { getAnswers as semantle_junior} from './semantle-junior.mjs';
import { getAnswers as shuffalo } from './shuffalo.mjs';
import { getAnswers as squareword } from './squareword.mjs';
import { getAnswers as weaver} from './weaver.mjs';
import { getAnswers as weaverX} from './weaver-x.mjs';
import { getAnswers as wordle } from './wordle.mjs';

export async function get_answers(puzzle, start_date, amount_to_return) {
    
    let answers = {};
    
    amount_to_return = parseInt(amount_to_return);
    
    switch (puzzle) {
        
        case 'colordle':
            await colordle(start_date, amount_to_return).then(r => answers[puzzle] = r);
            break;
        case 'connections':
            await connections(start_date, amount_to_return).then(r => answers[puzzle] = r);
            break;
        case 'contexto':
            await contexto(start_date, amount_to_return).then(r => answers[puzzle] = r);
            break;
        case 'harmonies':
            await harmonies(start_date, amount_to_return).then(r => answers[puzzle] = r);
            break;
        case 'jumble':
            await jumble(start_date, amount_to_return).then(r => answers[puzzle] = r);
            break;
        case 'keyword':
            await keyword(start_date, amount_to_return).then(r => answers[puzzle] = r);
            break;
        case 'letroso':
            await letroso(start_date, amount_to_return).then(r => answers[puzzle] = r);
            break;
        case 'marveldle':
            await marveldle().then(r => answers[puzzle] = r);
            break;
        case 'nerdle':
            await nerdle(start_date, amount_to_return).then( r => answers['nerdle'] = r );
            await nerdle(start_date, amount_to_return, 'mini').then( r => answers['nerdle-mini'] = r );
            await nerdle(start_date, amount_to_return, 'micro').then( r => answers['nerdle-micro'] = r );
            await nerdle(start_date, amount_to_return, 'maxi').then( r => answers['nerdle-maxi'] = r );
            break;
        case 'on_the_record':
            await on_the_record(start_date, amount_to_return).then(r => answers[puzzle] = r);
            break;
        case 'parseword':
            await parseword( start_date, amount_to_return ).then( r => answers[puzzle] = r );
            break;
        case 'phrazle':
            answers['phrazle'] = phrazle( start_date, amount_to_return);
            break;
        case 'pimantle':
            await pimantle(start_date, amount_to_return).then(r => answers[puzzle] = r);
            break;
        case 'poeltl':
            await poeltl( start_date ).then( r => answers[puzzle] = r );
            break;
        case 'quordle':
            answers['quordle'] = quordle( start_date, amount_to_return);
            break;
        case 'revealed':
            await revealed(start_date, amount_to_return).then(r => answers[puzzle] = r);
            break;
        case 'searchle':
            await searchle(start_date, amount_to_return).then(r => answers[puzzle] = r);
            break;
        case 'semantle-junior':
            await semantle_junior(start_date, amount_to_return).then(r => answers[puzzle] = r);
            break;
        case 'shuffalo':
            await shuffalo( start_date, amount_to_return).then(r => answers[puzzle] = r);
            break;
        case 'squareword':
            await squareword(start_date, amount_to_return).then(r => answers[puzzle] = r);
            break;
        case 'wordle':
            await wordle(start_date, amount_to_return).then(r => answers[puzzle] = r);
            break;
        case 'weaver':
            await weaver( start_date, amount_to_return ).then( r => answers['weaver'] = r );
            break;
        case 'weaver-x':
            await weaverX( start_date, amount_to_return ).then( r => answers['weaver-x'] = r );
            break;
    }
    
    return answers;
}