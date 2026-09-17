import {get_answers} from "./get-answers.mjs";

// Every type the switch below accepts. Kept here so tooling (src/cli.mjs) can validate input and
// print the list without duplicating it; add new puzzles to both.
export const PUZZLE_TYPES = [
    'colordle',
    'connections',
    'contexto',
    'harmonies',
    'jumble',
    'keyword',
    'letroso',
    'marveldle',
    'nerdle',
    'nyt-bonus',
    'on_the_record',
    'parseword',
    'phrazle',
    'pimantle',
    'poeltl',
    'quordle',
    'revealed',
    'searchle',
    'semantle-junior',
    'shuffalo',
    'squareword',
    'strands',
    'weaver',
    'weaver-x',
    'wordle'
];

/*
Puzzles that are knowingly broken upstream. A disabled type returns immediately and is flagged so
the alert layer stays quiet about it, rather than firing "failed to return any data" on every
scheduled run. Remove the entry to re-enable; nothing else needs changing.
*/
export const DISABLED_PUZZLES = {
    'letroso': 'temporarily disabled'
};

export default async function process_answers(type, amount_to_return, start_date = null) {
    
    let data = [];
    
    if (Object.hasOwn(DISABLED_PUZZLES, type)) {
        console.log(`  ${type} is disabled: ${DISABLED_PUZZLES[type]}`);
        Object.defineProperty(data, 'disabled', { value: true, enumerable: false, configurable: true });
        return data;
    }
    
    switch (type) {
        
        case 'colordle':
            data = await get_answers('colordle', start_date, amount_to_return);
            break;
        case 'connections':
            data = await get_answers('connections', start_date, amount_to_return);
            break;
        case 'contexto':
            data = await get_answers('contexto', start_date, amount_to_return);
            break;
        case 'harmonies':
            data = await get_answers('harmonies', start_date, amount_to_return);
            break;
        case 'jumble':
            data = await get_answers('jumble', start_date, amount_to_return);
            break;
        case 'keyword':
            data = await get_answers('keyword', start_date, amount_to_return);
            break;
        case 'letroso':
            data = await get_answers('letroso', start_date, amount_to_return);
            break;
        case 'marveldle':
            data = await get_answers('marveldle', start_date, amount_to_return);
            break;
        case 'nerdle':
            data = await get_answers('nerdle', start_date, amount_to_return);
            break;
        case 'nyt-bonus':
            data = await get_answers('nyt-bonus', start_date, amount_to_return);
            break;
        case 'on_the_record':
            data = await get_answers('on_the_record', start_date, amount_to_return);
            break;
        case 'parseword':
            data = await get_answers('parseword', start_date, amount_to_return);
            break;
        case 'phrazle':
            data = await get_answers('phrazle', start_date, amount_to_return);
            break;
        case 'pimantle':
            data = await get_answers('pimantle', start_date, amount_to_return);
            break;
        case 'poeltl':
            data = await get_answers('poeltl', start_date, amount_to_return);
            break;
        case 'quordle':
            data = await get_answers('quordle', start_date, amount_to_return);
            break;
        case 'revealed':
            data = await get_answers('revealed', start_date, amount_to_return);
            break;
        case 'searchle':
            data = await get_answers('searchle', start_date, amount_to_return);
            break;
        case 'semantle-junior':
            data = await get_answers('semantle-junior', start_date, amount_to_return);
            break;
        case 'shuffalo':
            data = await get_answers('shuffalo', start_date, amount_to_return);
            break;
        case 'squareword':
            data = await get_answers('squareword', start_date, amount_to_return);
            break;
        case 'strands':
            data = await get_answers('strands', start_date, amount_to_return);
            break;
        case 'weaver':
            data = await get_answers('weaver', start_date, 8);
            break;
        case 'weaver-x':
            data = await get_answers('weaver-x', start_date, 8);
            break;
        case 'wordle':
            data = await get_answers('wordle', start_date, amount_to_return);
            break;
        
    }
    
    return data;
}
