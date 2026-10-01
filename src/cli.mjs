import './env.mjs';
import process_answers, { PUZZLE_TYPES } from './process.mjs';

/*
Local operator front door for the two entry points that otherwise need a hand-edited scratch file:
process_answers (scrape only) and manual_post_answers (scrape, then POST to REST_ENDPOINT).

Production is unaffected - Cloud Run runs src/index.js and Cloud Scheduler drives /post_answers.
*/

function usage( message ) {
    if ( message ) {
        console.error( `\n  ${message}` );
    }
    console.error( `
  Usage: node src/cli.mjs <type> [options]

    --amount N          how many to fetch (default 8)
    --date YYYY-MM-DD   start date (default: today, in each puzzle's own timezone)
    --post              POST the result to REST_ENDPOINT instead of just printing it
    --json              print the raw result object instead of a summary
    --only KEY[,KEY]    keep only these result keys (e.g. gamedle-event) - for re-posting one
                        mode of a fan-out type without duplicating the others

  Types:
${PUZZLE_TYPES.map( t => `    ${t}` ).join('\n')}
` );
}

function parseArgs( argv ) {
    const flags = { amount: 8, date: null, post: false, json: false, only: null };
    let type = null;
    
    for ( let i = 0; i < argv.length; i++ ) {
        const arg = argv[i];
        
        switch ( arg ) {
            case '--post': flags.post = true; break;
            // --post no longer needs confirming for a remote host; still accepted so older commands run.
            case '--yes': break;
            case '--json': flags.json = true; break;
            case '--amount': flags.amount = parseInt( argv[++i] ); break;
            case '--date': flags.date = argv[++i]; break;
            case '--only': flags.only = ( argv[++i] ?? '' ).split(',').map( k => k.trim() ).filter( Boolean ); break;
            default:
                if ( arg.startsWith('-') ) {
                    return { error: `Unknown option: ${arg}` };
                }
                if ( type ) {
                    return { error: `Unexpected extra argument: ${arg}` };
                }
                type = arg;
        }
    }
    
    if ( !type ) {
        return { error: 'No puzzle type given.' };
    }
    if ( !PUZZLE_TYPES.includes( type ) ) {
        return { error: `Unknown puzzle type: ${type}` };
    }
    if ( !Number.isInteger( flags.amount ) || flags.amount < 1 ) {
        return { error: '--amount must be a positive integer.' };
    }
    if ( flags.date !== null && !/^\d{4}-\d{2}-\d{2}$/.test( flags.date ) ) {
        return { error: `--date must look like YYYY-MM-DD (got: ${flags.date})` };
    }
    
    if ( flags.only !== null && !flags.only.length ) {
        return { error: '--only needs at least one result key.' };
    }
    
    return { type, flags };
}

/*
Narrows a result to the --only keys. A type such as gamedle or nerdle posts several keys at once,
and WordPress is not idempotent, so re-posting one missed key must not re-send the rest. Errors are
non-enumerable, so they are carried over by hand: dispatch-level ones always, per-key ones only for
the keys that are kept.
*/
function selectKeys( data, only ) {
    
    if ( !only ) {
        return data;
    }
    
    const missing = only.filter( key => !Object.hasOwn( data ?? {}, key ) );
    
    if ( missing.length ) {
        console.error( `\n  --only: no result for ${missing.join(', ')} (got: ${Object.keys( data ?? {} ).join(', ') || 'nothing'})` );
        console.error( `  Nothing was sent.\n` );
        reportErrors( collectErrors( data ) );
        process.exit( 1 );
    }
    
    const selected = Object.fromEntries( only.map( key => [key, data[key]] ) );
    
    if ( data?.errors?.length ) {
        Object.defineProperty( selected, 'errors', { value: data.errors, enumerable: false, configurable: true } );
    }
    
    return selected;
}

// Most modules return delimited strings, but some (Strands) return a structured object.
// Render those compactly so the summary stays one line per answer; --json gives full fidelity.
function renderAnswer( answer ) {
    
    if ( typeof answer === 'string' ) {
        return answer;
    }
    
    const json = JSON.stringify( answer );
    
    return json.length > 160 ? `${json.slice(0, 160)}...  (--json for full)` : json;
}

function printSummary( data ) {
    
    const keys = Object.keys( data ?? {} );
    
    if ( !keys.length ) {
        console.log( '\n  No data returned.\n' );
        return;
    }
    
    for ( const key of keys ) {
        const obj = data[key];
        
        if ( !obj || !Array.isArray( obj.answers ) ) {
            console.log( `\n  ${key}: no answers in result` );
            continue;
        }
        
        const clamped = obj.clamped ? '  [clamped]' : '';
        console.log( `\n  ${key}  (${obj.type})${clamped}` );
        console.log( `    published ${obj.publishedDate}   scheduled ${obj.scheduledDate}   #${obj.startingNumber}   ${obj.answers.length} answer(s)` );
        
        obj.answers.forEach( ( answer, i ) => {
            // answerSchedule carries the real date/number for puzzles that aren't a consecutive
            // daily run; fall back to a bare index when a module doesn't provide it.
            const meta = obj.answerSchedule?.[i];
            const prefix = meta ? `${meta.publishedDate}  #${meta.number}` : `${String(i + 1).padStart(2)}.`;
            console.log( `    ${prefix}  ${renderAnswer( answer )}` );
        } );
    }
    
    console.log('');
}

// Failures surface in two places: get-answers attaches a non-enumerable `errors` to the result
// object, and an individual module (letroso) may attach `errors` to its own envelope.
function collectErrors( data ) {
    
    const errors = [ ...( data?.errors ?? [] ) ];
    
    for ( const obj of Object.values( data ?? {} ) ) {
        if ( obj?.errors?.length ) {
            errors.push( ...obj.errors );
        }
    }
    
    return errors;
}

function reportErrors( errors ) {
    
    if ( !errors.length ) {
        return false;
    }
    
    console.error( `  Completed with ${errors.length} failure(s):` );
    errors.forEach( e => console.error( `    - ${e}` ) );
    console.error( `  Data collected before the failure is above and was kept.\n` );
    
    return true;
}

const parsed = parseArgs( process.argv.slice(2) );

if ( parsed.error ) {
    usage( parsed.error );
    process.exit( 1 );
}

const { type, flags } = parsed;

if ( flags.post ) {
    
    const endpoint = process.env.REST_ENDPOINT;
    
    if ( !endpoint ) {
        console.error( '\n  REST_ENDPOINT is not set - nothing to post to.\n' );
        process.exit( 1 );
    }
    
    let host;
    try {
        host = new URL( endpoint ).hostname;
    } catch {
        console.error( `\n  REST_ENDPOINT is not a valid URL: ${endpoint}\n` );
        process.exit( 1 );
    }
    
    
    console.log( `\n  Posting ${type}${flags.only ? ` [only ${flags.only.join(', ')}]` : ''} (amount ${flags.amount}${flags.date ? `, from ${flags.date}` : ''}) -> ${host}` );
    
    // Imported here rather than at the top so a dry run never pulls in express, WPAPI or puppeteer.
    const { post_data } = await import( './index.js' );
    
    const data = selectKeys( await process_answers( type, flags.amount, flags.date ), flags.only );
    const errors = collectErrors( data );
    
    printSummary( data );
    
    try {
        const response = await post_data( data );
        console.log( '  Response:', JSON.stringify( response ), '\n' );
    } catch ( error ) {
        // post_data throws when WordPress rejects the payload.
        console.error( `\n  WordPress rejected the post: ${error?.message ?? error}\n` );
        reportErrors( errors );
        process.exit( 1 );
    }
    
    if ( reportErrors( errors ) ) {
        process.exit( 1 );
    }
    
} else {
    
    const data = selectKeys( await process_answers( type, flags.amount, flags.date ), flags.only );
    
    if ( flags.json ) {
        console.log( JSON.stringify( data, null, 2 ) );
    } else {
        printSummary( data );
    }
    
    if ( reportErrors( collectErrors( data ) ) ) {
        process.exit( 1 );
    }
}
