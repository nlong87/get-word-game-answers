import fetch from "node-fetch";
import {dayDiff, getUTCDateDisplay, midnightInZone, modifyDays, setTimeInZone} from "./helpers.mjs";

const base_script = "https://harmonies.io/";
const base_script_dir = 'https://harmonies.io/_app/immutable/';
const reset_timezone = 'America/New_York';
const start_puzzle_date = midnightInZone('2024-03-29', reset_timezone);
const start_puzzle_number = 1;
const scheduled_time = {
    'hours': 20,
    'minutes': 0
};
let scripts = [];
let scripts_cache = [];

async function getScriptUrl() {
    
    const script_url = await fetch(base_script)
        .then((response) => response.text())
        .then(text => {
            const matches = text.match(/(_app\/immutable\/entry\/app.(.*)(?=\.js["'])\.js)/);
            return (matches) ? base_script + matches[0] : false;
        });
    
    await fetch(script_url)
        .then((response) => response.text())
        .then(text => {
            
            const arrayMatch = text.match(/m\.f=\[(.*?)\]/s);
            
            if (arrayMatch) {
                const arrayContent = arrayMatch[1];
                
                const paths = [...arrayContent.matchAll(/"\.\.\/((?=chunks)[^"]+)(?<!\.css)"/g)].map(m => m[1]);
                
                if ( paths ) {
                    for (let i = 0; i < paths.length; i++) {
                        scripts.push(base_script_dir + paths[i]);
                    }
                    return true;
                } else {
                    return false;
                }
            }
            
            return false;
        });
    
    for (let i = 0; i < scripts.length; i++) {
        
        await fetch(scripts[i])
            .then((response) => response.text())
            .then(text => { scripts_cache.push(text); });
        
    }
    
}

async function getAnswerFromDate( date ) {
    
    if ( !scripts_cache.length ) {
        await getScriptUrl();
    }
    
    let answer = matchFromAnswer( date );
    let answers = [];
    let extra = [];
    
    answer.categories.forEach(category => {
        answers.push( category.name );
        if ( typeof category.elements[0] === 'object'  ) {
            let alts = category.elements.map(item => item['alt'] );
            extra.push( alts.join(', ') );
        } else {
            extra.push( category.elements.join(', ') );
        }
    });
    
    
    return {
        'categories': answers,
        'extra': extra
    };
    
}

function matchFromAnswer( date_string ) {
    
    const pattern = new RegExp( "\"" + date_string + "\":(\{(?:[^{}]|\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\})*\})")
    let json_text = {};
    let matches = '';
    
    // Search for the pattern in the scripts cache
    for (let i = 0; i < scripts_cache.length; i++) {
        
        matches = scripts_cache[i].match(pattern);
        if ( matches ) {
            json_text = matches[1];
            break;
        }
        
    }
    
    return (json_text) ? convertToValidJSON(json_text) : false;
}

function convertToValidJSON(str) {
    // Step 1: Replace !0 with true and !1 with false
    let cleaned = str.replace(/!0/g, 'true').replace(/!1/g, 'false');
    
    // Step 2: Add quotes around unquoted keys
    cleaned = cleaned.replace(/([{,])\s*([\w-]+)\s*:/g, '$1"$2":');
    
    // Step 3: Replace backtick-quoted values with double-quoted and escape inner quotes
    cleaned = cleaned.replace(/:\s*`([^`]*)`/g, (_, val) => {
        const escaped = val.replace(/"/g, '\\"');
        return `: "${escaped}"`;
    });
    
    // Step 4: Convert single-quoted values to double-quoted values
    cleaned = cleaned.replace(/:\s*'([^']*)'/g, (_, val) => {
        const escaped = val.replace(/"/g, '\\"');
        return `: "${escaped}"`;
    });
    
    // Step 5: Replace backticks used as quotes for array items
    cleaned = cleaned.replace(/`([^`]|``)*`/g, match => {
        // remove the surrounding backticks
        const inner = match.slice(1, -1);
        // wrap in double quotes
        return `"${inner.replace(/"/g, '\\"')}"`;
    });
    
    try {
        return JSON.parse(cleaned);
    } catch (e) {
        console.error("Invalid JSON format after conversion:", e);
        return false;
    }
}

function getFormattedDate( date ) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    return `${m}/${d}/${y}`;
}

export async function getAnswers( date_string, number_to_get ) {
    
    const published = midnightInZone( date_string, reset_timezone );
    const scheduled = setTimeInZone(
        modifyDays( published, 1, false ),
        scheduled_time.hours,
        scheduled_time.minutes,
        reset_timezone
    );
    
    const diff = dayDiff( published, start_puzzle_date );
    const start = start_puzzle_number + diff;
    
    let a = [];
    let i = 0;
    while( i < number_to_get ) {
        
        let puzzleDate = modifyDays( midnightInZone( date_string, reset_timezone ), i );
        let _date = getFormattedDate( puzzleDate );
        let puzzle = await getAnswerFromDate( _date );
        
        a.push( puzzle.categories.join(' |~~| ') + ' |~~~~| ' + puzzle.extra.join(' |~~| ' ) );
        i++;
    }
    
    return {
        'type': 'Harmonies',
        'publishedDate': getUTCDateDisplay( published ),
        'scheduledDate': getUTCDateDisplay( scheduled, true ),
        'startingNumber': start,
        'answers': a
    };
    
}