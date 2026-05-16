import fetch from "node-fetch";
import {
    convertDateForSQL,
    getCurrentDayInTimezone,
    getSpecificDay
} from "./helpers.mjs";

const Config = {
    number: 1,
    date: getSpecificDay('2025-05-19'),
    schedule: {
        h: 17,
        m: 5
    },
    tz: 'Etc/UTC'
}
const initial_guess = 'ironman'; // We use ironman because he exists in both games
const default_headers = {
    "Accept": "*/*",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Accept-Language": "en-US,en;q=0.9",
    "Accepts": "application/json",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Referer": "https://marveldle.com/",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:138.0) Gecko/20100101 Firefox/138.0"
};
let answerOptions = [];
let headers = null;

function resetHeaders() {
    headers = { ...default_headers};
}

function validateGameType( type = '' ) {
    let _type;
    switch( type ) {
        case 'audiovisual':
        case 'visual':
        case 'audio':
            _type = 'audiovisual';
            break;
        default:
            _type = 'comics';
    }
    
    return _type;
}

function getHero( id ) {
    const hero = answerOptions.find(hero => hero.id === id);
    return hero ? hero : null;
}

async function setAnswerOptions( type ) {
    
    const options = await getAnswerOptions( type );
    
    if ( options ) {
        answerOptions = options;
    }
    
}

async function getAnswerOptions( type = 'comics') {
    
    let type_url = validateGameType( type );
    const fetch_url = `https://api.marveldle.com/api/characters/${type_url}`;
    
    const response = await fetch(fetch_url, {
        "headers": headers,
        "body": null,
        "method": "GET"
    });
    
    
    if ( response.status !== 200 ) {
        return false;
    }
    
    return await response.json();
}

async function makeGuess(guess_id, type = 'comics', date_id = '') {
    
    let _type = validateGameType( type );
    const fetch_url = `https://api.marveldle.com/api/characters/${_type}/guess/${guess_id}?dateId=${date_id} 12:00:00 AM`;
    
    const guess = await fetch(fetch_url, {
        "headers": headers,
        "content-type": "application/json",
        "method": "GET"
    });
    
    if ( guess.status !== 200 ) {
        return false;
    }
    
    return await guess.json();
}

async function deduceAnswer( date, type = 'comics' ) {
    
    resetHeaders();
    await setAnswerOptions( type );
    
    // We use ironman because the id is the same for both types
    let currentGuess = getHero( initial_guess );
    if ( !currentGuess ) return false;
    
    let filteredOptions = answerOptions;
    let exactMatch = false;
    let response;
    
    const arrayFields = ['appearanceTypes','affiliations','powerTypes','species'];
    
    let exactInfo = {};
    let incorrectInfo = {};
    let partialInfo = {};
    let yearInfo = {
        'lessThan': 0,
        'greaterThan': 0
    };
    
    let attempts = 1;
    let guesses = 0;
    const max_attempts = 3;
    const max_guesses = 15;
    
    while ( !exactMatch ) {
        
        response = await makeGuess(currentGuess.id, type, date);
        
        // Check if response failed, if the response failed up the attempts and try again, or end after
        if ( !response ) {
            if ( attempts === max_attempts ) {
                return false;
            }
            attempts += 1;
            continue;
        } else {
            // Reset the attempts if response was successful
            attempts = 1;
        }
        
        if (response.isExact) {
            // Guess was correct break the loop to return the answer
            exactMatch = true;
            break;
            
        } else {
            
            for (const [key, value] of Object.entries(response)) {
                
                if (key === 'apparitionYear') {
                    
                    // Need to handle 'Upper' and 'Lower' responses and check for exact
                    // Upper means year is greater than current year
                    if ( value === 'Exact') {
                        exactInfo[key] = currentGuess[key];
                    } else {
                        if ( value === 'Upper' ) {
                            if ( !yearInfo['greaterThan'] || yearInfo['greaterThan'] > currentGuess[key] ) {
                                yearInfo['greaterThan'] = currentGuess[key]
                            }
                        } else if ( value === 'Lower' ) {
                            if ( !yearInfo['lessThan'] || yearInfo['lessThan'] > currentGuess[key] ) {
                                yearInfo['lessThan'] = currentGuess[key]
                            }
                        }
                    }
                } else {
                    
                    if (value === 'Exact') {
                        exactInfo[key] = currentGuess[key];
                    } else if (value === 'None') {
                        if ( !incorrectInfo.hasOwnProperty(key) ) {
                            incorrectInfo[key] = [];
                        }
                        incorrectInfo[key].push(currentGuess[key]);
                    } else if ( value === 'Partial' ) {
                        
                        if ( !partialInfo.hasOwnProperty(key) ) {
                            partialInfo[key] = [];
                        }
                        
                        if ( !incorrectInfo.hasOwnProperty(key) ) {
                            incorrectInfo[key] = [];
                        }
                        
                        partialInfo[key] = [...new Set([...partialInfo[key],...currentGuess[key]])];
                    }
                }
            }
        }
        
        // Filter options based on correct information
        for (const [key, value] of Object.entries(exactInfo)) {
            filteredOptions = filteredOptions.filter((obj) => {
                if ( Array.isArray(obj[key]) ) {
                    return (obj[key].length === value.length) && obj[key].every(function(element, index) {
                        return element === value[index];
                    });
                } else {
                    return obj[key] === value;
                }
            });
        }
        
        // Filter options based on incorrect information
        for (const [key, value] of Object.entries(incorrectInfo)) {
            
            // Check if this is a field that contains multiple values
            if ( arrayFields.includes(key)) {
                value.forEach( item => {
                    filteredOptions = filteredOptions.filter((obj) => {
                        return !obj[key].some( r => item.includes(r) );
                    })
                });
            } else {
                filteredOptions = filteredOptions.filter((obj) => !value.includes(obj[key]) );
            }
        }
        
        
        for (const [key, value] of Object.entries(partialInfo)) {
            if ( !exactInfo.hasOwnProperty(key) ) {
                filteredOptions = filteredOptions.filter((obj) => {
                    return value.some( r => obj[key].includes(r) );
                });
            }
        }
        
        if ( yearInfo['greaterThan'] ) {
            filteredOptions = filteredOptions.filter((obj) =>  obj.apparitionYear > yearInfo['greaterThan']);
        }
        
        if ( yearInfo['lessThan'] ) {
            filteredOptions = filteredOptions.filter((obj) =>  obj.apparitionYear < yearInfo['lessThan']);
        }
        
        // Cap the total amount of guesses we can make and if we've filtered out all possible results
        // something went wrong, so we want to break the loop in those cases
        if ( guesses > max_guesses || filteredOptions.length === 0 ) {
            break;
        }
        
        // Select a random option from the filtered list to make as our next guess
        currentGuess = filteredOptions[Math.floor(Math.random()*filteredOptions.length)];
        
        // Add another guess to the running count
        guesses += 1;
        
    }
    
    // If exactMatch was set to true, we got the correct answer
    return ( exactMatch ) ? currentGuess : false;
    
}

export async function getAnswer() {
    
    const date = getCurrentDayInTimezone(Config.tz);
    const published = date.toString();
    const scheduled = convertDateForSQL(date.subtract({ days: 1 }), Config.schedule.h, Config.schedule.m);
    const diff = date.since(Config.date).days;
    const currentPuzzleNumber = Config.number + diff;
    
    const comics_answer = await deduceAnswer( published, 'comics');
    const audiovisual_answer = await deduceAnswer( published, 'audiovisual' );
    
    if ( !comics_answer && !audiovisual_answer )
        return false;
    
    let answers = [];
    answers.push( comics_answer.name + ' |~~~~| ' + audiovisual_answer.name );
    
    return {
        'type': 'Marveldle',
        'publishedDate': published,
        'scheduledDate': scheduled,
        'startingNumber': currentPuzzleNumber,
        'answers': answers
    };
    
}
// await getAnswer().then(r => console.log(r));