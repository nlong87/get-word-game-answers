import { appendFileSync, chmodSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/*
The native messaging host for extension/letroso, its installer, and a manual fallback.

Letroso's puzzle sits behind Firebase App Check, which only a real browser session passes, so the
extension captures answers in your own Chrome and this posts them with the same envelope
(buildEnvelope in letroso.mjs) and post_data() as everything else.

WordPress isn't idempotent, so each day sent is recorded in a ledger kept per REST_ENDPOINT host and
is never sent to that host twice. Keying by host also means a local test can't block a production post.

    npm run letroso:install-host                                      register this host with Chrome
    node src/letroso-host.mjs --date 2026-10-10 --answer WORD         print the envelope (dry run)
    node src/letroso-host.mjs --date 2026-10-10 --answer WORD --post  post it (--force to resend)

Chrome starts it with the extension's origin as the only argument, sends one message and expects one
reply. The install bakes in the absolute path of the current node, so re-run it after a Node upgrade.
*/

const HOST_NAME = 'com.tryhardguides.letroso';
const HOSTS_DIR = path.join( homedir(), 'Library/Application Support/Google/Chrome/NativeMessagingHosts' );
const LOG_FILE = path.join( homedir(), 'Library/Logs/tryhard-letroso.log' );
const LEDGER = path.join( homedir(), 'Library/Application Support/tryhard-letroso/ledger.json' );
const LEDGER_DAYS = 90;
const MANIFEST = fileURLToPath( new URL( '../extension/letroso/manifest.json', import.meta.url ) );
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const args = process.argv.slice( 2 );

if ( args[0]?.startsWith( 'chrome-extension://' ) ) {
    await serveChrome();
} else if ( args.includes( '--install' ) ) {
    install();
} else {
    await manual();
}

async function serveChrome() {
    
    // stdout is the channel back to Chrome, and anything else written to it - post_data() logs
    // WordPress's response with console.log - would corrupt it, so both streams go to the log.
    const reply = process.stdout.write.bind( process.stdout );
    const toLog = ( chunk, encoding, callback ) => {
        try {
            appendFileSync( LOG_FILE, chunk );
        } catch {}
        ( typeof encoding === 'function' ? encoding : callback )?.();
        return true;
    };
    process.stdout.write = toLog;
    process.stderr.write = toLog;
    
    let message;
    let response;
    
    try {
        message = await readMessage();
        response = await handle( message );
    } catch ( error ) {
        console.error( error );
        response = { ok: false, error: error?.message ?? String( error ) };
    }
    
    // The hourly sweep usually finds nothing to do, which isn't worth a log entry.
    if ( !( message?.action === 'missing' && response.ok && !response.missing.length ) ) {
        console.log( `\n[${new Date().toISOString()}] ${JSON.stringify( message )}\n  -> ${JSON.stringify( response )}` );
    }
    
    const body = Buffer.from( JSON.stringify( response ) );
    const header = Buffer.alloc( 4 );
    header.writeUInt32LE( body.length );
    
    reply( Buffer.concat( [header, body] ), () => process.exit( 0 ) );
}

// One message: its length as 32 bits in native byte order (little-endian on every Mac), then the JSON.
function readMessage() {
    return new Promise( ( resolve, reject ) => {
        
        let buffer = Buffer.alloc( 0 );
        
        process.stdin.on( 'data', ( chunk ) => {
            buffer = Buffer.concat( [buffer, chunk] );
            
            if ( buffer.length < 4 || buffer.length < 4 + buffer.readUInt32LE( 0 ) ) {
                return;
            }
            
            process.stdin.pause();
            
            try {
                resolve( JSON.parse( buffer.subarray( 4, 4 + buffer.readUInt32LE( 0 ) ).toString() ) );
            } catch ( error ) {
                reject( error );
            }
        } );
        
        process.stdin.on( 'end', () => reject( new Error( 'Chrome closed the pipe before a whole message arrived' ) ) );
        process.stdin.on( 'error', reject );
    } );
}

async function handle( message ) {
    
    // Imported only now, behind the redirect, since index.js and post_data() log to stdout.
    await import( './env.mjs' );
    
    switch ( message?.action ) {
        case 'missing':
            return missing( message.dates );
        case 'post':
            return await post( message );
        case 'alert': {
            const { send_discord_message } = await import( './index.js' );
            await send_discord_message( message.message );
            return { ok: true };
        }
        default:
            throw new Error( `Unknown action: ${message?.action}` );
    }
}

// Which of these days this REST_ENDPOINT hasn't been sent yet.
function missing( dates ) {
    
    if ( !Array.isArray( dates ) || !dates.every( ( date ) => DATE.test( date ) ) ) {
        throw new Error( `Malformed dates: ${JSON.stringify( dates )}` );
    }
    
    const host = endpointHost();
    const sent = readLedger()[host] ?? {};
    
    return { ok: true, endpoint: host, missing: dates.filter( ( date ) => !sent[date] ) };
}

/*
`sent` in a failed reply says whether WordPress may have the post. When it's false, nothing left this
machine and the extension can try again; when true, the ledger has it and it won't be sent again.
*/
async function post( { date, answer, docId } ) {
    
    if ( !DATE.test( date ?? '' ) || typeof answer !== 'string' || !answer.trim() ) {
        throw new Error( `Malformed capture: ${JSON.stringify( { date, answer } )}` );
    }
    
    const { buildEnvelope } = await import( './letroso.mjs' );
    const envelope = buildEnvelope( date, [answer] );
    
    // The doc id is the puzzle number, so a mismatch means the page served some other day.
    if ( docId !== envelope.startingNumber ) {
        return { ok: false, sent: false, error: `captured puzzle #${docId}, expected #${envelope.startingNumber}` };
    }
    
    const host = endpointHost();
    
    if ( readLedger()[host]?.[date] ) {
        return { ok: true, already: true, number: envelope.startingNumber };
    }
    
    return await send( host, date, envelope );
}

async function send( host, date, envelope ) {
    
    const { post_data } = await import( './index.js' );
    
    // Recorded first: if this dies mid-post, WordPress may have it, so it mustn't go again.
    record( host, date, 'sending' );
    
    try {
        await post_data( { letroso: envelope } );
    } catch ( error ) {
        // post_data() has already alerted Discord.
        record( host, date, 'rejected' );
        return { ok: false, sent: true, error: `WordPress rejected the post: ${error?.message ?? error}` };
    }
    
    record( host, date, 'posted' );
    
    return { ok: true, number: envelope.startingNumber };
}

function endpointHost() {
    
    const endpoint = process.env.REST_ENDPOINT;
    
    if ( !endpoint ) {
        throw new Error( 'REST_ENDPOINT is not set - nothing to post to' );
    }
    
    return new URL( endpoint ).host;
}

// { "<REST_ENDPOINT host>": { "YYYY-MM-DD": "sending" | "posted" | "rejected" } }
function readLedger() {
    try {
        return JSON.parse( readFileSync( LEDGER, 'utf8' ) );
    } catch ( error ) {
        // A missing ledger is a fresh start; an unreadable one must not be mistaken for an empty one.
        if ( error.code === 'ENOENT' ) {
            return {};
        }
        throw error;
    }
}

function record( host, date, status ) {
    
    const ledger = readLedger();
    const cutoff = new Date( Date.now() - LEDGER_DAYS * 86400000 ).toISOString().slice( 0, 10 );
    
    ledger[host] = Object.fromEntries(
        Object.entries( { ...ledger[host], [date]: status } )
            .filter( ( [day] ) => day >= cutoff )
            .sort( ( a, b ) => a[0].localeCompare( b[0] ) )
    );
    
    mkdirSync( path.dirname( LEDGER ), { recursive: true } );
    writeFileSync( LEDGER, JSON.stringify( ledger, null, 4 ) + '\n' );
}

function install() {
    
    // Chrome derives an extension's id from its key: the first 32 hex digits of the key's sha256,
    // spelled with a-p instead of 0-f.
    const { key } = JSON.parse( readFileSync( MANIFEST, 'utf8' ) );
    const id = createHash( 'sha256' ).update( Buffer.from( key, 'base64' ) ).digest( 'hex' ).slice( 0, 32 )
        .replace( /./g, ( digit ) => String.fromCharCode( 97 + parseInt( digit, 16 ) ) );
    
    const wrapper = path.join( HOSTS_DIR, `${HOST_NAME}.sh` );
    const manifest = path.join( HOSTS_DIR, `${HOST_NAME}.json` );
    
    // Chrome starts hosts with a bare PATH, and the node on this shell's PATH is an fnm multishell
    // link that goes away with the shell, so the wrapper pins the real binary.
    mkdirSync( HOSTS_DIR, { recursive: true } );
    writeFileSync( wrapper, `#!/bin/sh\nexec "${realpathSync( process.execPath )}" "${fileURLToPath( import.meta.url )}" "$@"\n` );
    chmodSync( wrapper, 0o755 );
    writeFileSync( manifest, JSON.stringify( {
        name: HOST_NAME,
        description: 'Posts the Letroso answers extension/letroso captures',
        path: wrapper,
        type: 'stdio',
        allowed_origins: [ `chrome-extension://${id}/` ]
    }, null, 4 ) + '\n' );
    
    console.log( `
  Registered ${HOST_NAME} for extension ${id}
    ${manifest}
    ${wrapper}

  Next: chrome://extensions -> Developer mode -> Load unpacked -> ${path.dirname( MANIFEST )}
  Its ID there should read ${id}. Host log: ${LOG_FILE}
` );
}

async function manual() {
    
    const value = ( flag ) => {
        const i = args.indexOf( flag );
        return i === -1 ? null : args[i + 1];
    };
    
    const date = value( '--date' );
    const answer = value( '--answer' );
    
    if ( !DATE.test( date ?? '' ) || !answer ) {
        console.error( `
  Usage: node src/letroso-host.mjs --install
         node src/letroso-host.mjs --date YYYY-MM-DD --answer WORD [--post [--force]]
` );
        process.exit( 1 );
    }
    
    const { buildEnvelope } = await import( './letroso.mjs' );
    const envelope = buildEnvelope( date, [answer] );
    
    console.log( JSON.stringify( envelope, null, 2 ) );
    
    if ( !args.includes( '--post' ) ) {
        console.log( '\n  Dry run - add --post to send it.\n' );
        return;
    }
    
    let host;
    
    try {
        host = endpointHost();
    } catch ( error ) {
        console.error( `\n  ${error.message}\n` );
        process.exit( 1 );
    }
    
    const previous = readLedger()[host]?.[date];
    
    if ( previous && !args.includes( '--force' ) ) {
        console.error( `\n  ${date} is already recorded as ${previous} for ${host} - add --force to send it again.\n` );
        process.exit( 1 );
    }
    
    console.log( `\n  Posting letroso ${date} -> ${host}` );
    
    const result = await send( host, date, envelope );
    
    if ( !result.ok ) {
        console.error( `\n  ${result.error}\n` );
        process.exit( 1 );
    }
}
