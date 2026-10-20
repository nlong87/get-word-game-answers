/*
Keeps the next few days of Letroso answers posted from this - your everyday - Chrome, handing each
one to src/letroso-host.mjs over native messaging, which posts it with post_data().

Letroso reads each puzzle from Firestore behind App Check (reCAPTCHA Enterprise). That rejects
automated browsers and the REST API alike, so the read has to happen in a real browser session.
Firestore serves days ahead - only the page refuses them, by the local clock (see tap.js) - so
posting ahead means the Mac only has to be awake with Chrome open at some point in that window, not
at any particular time. Each answer still goes live at its own scheduledDate.

Event-driven on purpose: Chrome stops an MV3 service worker after ~30 s idle, so anything that has
to outlive a wait - the capture in flight, its timeout, the next sweep - is kept in chrome.storage
and chrome.alarms rather than in memory.
*/

const HOST = 'com.tryhardguides.letroso';

// Keep today (in UTC, the zone src/letroso.mjs uses) and this many days after it posted.
const DAYS_AHEAD = 3;

// How often to look for missing days. A sweep that comes due while the Mac sleeps runs when it wakes.
const SWEEP_MINUTES = 60;

const TIMEOUT_MINUTES = 1.5;

// Sweeps in a row that fail on a day due within about a day, before alerting. `let` so the worker's
// console can lower it to test the alert.
let ALERT_AFTER = 3;

// A capture still marked as running after this long has lost its timeout alarm; don't let it block.
const STALE_MS = 10 * 60 * 1000;

const SWEEP = 'letroso-sweep';
const TIMEOUT = 'letroso-timeout';

const todayUTC = () => new Date().toISOString().slice( 0, 10 );
const addDays = ( day, n ) => new Date( Date.parse( `${day}T00:00:00Z` ) + n * 86400000 ).toISOString().slice( 0, 10 );
const windowDates = () => Array.from( { length: DAYS_AHEAD + 1 }, ( _, i ) => addDays( todayUTC(), i ) );

// Events can interleave across awaits (an answer landing as the timeout fires), so take them one at a time.
let queue = Promise.resolve();

function serial( task ) {
    queue = queue.then( task ).catch( ( error ) => console.error( 'Letroso:', error ) );
    return queue;
}

/*
The toolbar button sweeps now. From the worker's console:
    startRun()                         post whatever is missing from today to DAYS_AHEAD
    startRun({ date: '2026-10-08' })   one specific day, e.g. a backfill
*/
function startRun( { date } = {} ) {
    return serial( () => sweep( date ? [ date ] : windowDates() ) );
}

chrome.runtime.onInstalled.addListener( () => serial( async () => {
    // Also drops what an earlier version kept: a daily alarm, its retries, and a local posted list.
    await chrome.alarms.clearAll();
    await chrome.storage.local.remove( 'posted' );
    await chrome.alarms.create( SWEEP, { periodInMinutes: SWEEP_MINUTES } );
    await sweep( windowDates() );
} ) );

chrome.runtime.onStartup.addListener( () => serial( async () => {
    // Alarms usually survive a restart, but aren't guaranteed to.
    if ( !await chrome.alarms.get( SWEEP ) ) {
        await chrome.alarms.create( SWEEP, { periodInMinutes: SWEEP_MINUTES } );
    }
    await sweep( windowDates() );
} ) );

chrome.action.onClicked.addListener( () => startRun() );

chrome.alarms.onAlarm.addListener( ( alarm ) => serial( async () => {
    
    if ( alarm.name === SWEEP ) {
        await sweep( windowDates() );
    
    } else if ( alarm.name === TIMEOUT ) {
        const pending = await takePending();
        if ( pending ) {
            await captureFailed( pending, `no answer within ${TIMEOUT_MINUTES * 60} s` );
        }
    }
} ) );

chrome.runtime.onMessage.addListener( ( message, sender ) => {
    if ( message?.source === 'tryhard-letroso' && sender.tab ) {
        serial( () => captured( message, sender.tab.id ) );
    }
} );

async function sweep( dates ) {
    
    const { pending } = await chrome.storage.session.get( 'pending' );
    
    // A capture in flight works through the rest of its days itself.
    if ( pending && Date.now() - pending.startedAt < STALE_MS ) {
        return;
    }
    
    // The host keeps what has been sent, per WordPress endpoint, so ask it what's left.
    let reply;
    
    try {
        reply = await chrome.runtime.sendNativeMessage( HOST, { action: 'missing', dates } );
    } catch ( error ) {
        reply = { ok: false, error: `native host: ${error.message}` };
    }
    
    if ( !reply?.ok ) {
        await report( `Letroso: couldn't check what's posted - ${reply?.error}`, true );
        return;
    }
    
    if ( !reply.missing.length ) {
        await report( `Letroso: posted through ${dates.at( -1 )} to ${reply.endpoint}`, false );
        return;
    }
    
    await capture( reply.missing );
}

async function capture( [ date, ...rest ] ) {
    
    console.log( `Letroso ${date}: capturing` );
    
    // Record the tab before it loads anything, so its answer can't arrive before we know the tab.
    const tabId = await openBlankTab();
    await chrome.storage.session.set( { pending: { date, rest, tabId, startedAt: Date.now() } } );
    await chrome.alarms.create( TIMEOUT, { delayInMinutes: TIMEOUT_MINUTES } );
    await chrome.tabs.update( tabId, { url: `https://letroso.com/en/previous/${date}#tryhard-capture=${date}` } );
}

async function openBlankTab() {
    try {
        return ( await chrome.tabs.create( { url: 'about:blank', active: false } ) ).id;
    } catch {
        // Chrome on macOS keeps running with every window closed, leaving nowhere to put a tab.
        const win = await chrome.windows.create( { url: 'about:blank', focused: false, state: 'minimized' } );
        return win.tabs[0].id;
    }
}

// Claims the capture in flight - only if it belongs to tabId, when given - and closes its tab.
async function takePending( tabId ) {
    
    const { pending } = await chrome.storage.session.get( 'pending' );
    
    if ( !pending || ( tabId !== undefined && pending.tabId !== tabId ) ) {
        return null;
    }
    
    await chrome.storage.session.remove( 'pending' );
    await chrome.alarms.clear( TIMEOUT );
    await chrome.tabs.remove( pending.tabId ).catch( () => {} );
    
    return pending;
}

async function captured( message, tabId ) {
    
    // Null for a Letroso tab this didn't open, or one whose capture already timed out.
    const pending = await takePending( tabId );
    
    if ( !pending ) {
        return;
    }
    
    if ( !message.answer ) {
        await captureFailed( pending, message.denied ? 'Firestore refused the read (permission denied)' : message.error ?? 'no answer' );
        return;
    }
    
    const { date, rest } = pending;
    const { answer, docId } = message;
    let reply;
    
    try {
        reply = await chrome.runtime.sendNativeMessage( HOST, { action: 'post', date, answer, docId } );
    } catch ( error ) {
        // Safe to try again later: the host records a day before sending it, so a crash can't double-post.
        reply = { ok: false, error: `native host: ${error.message}` };
    }
    
    if ( reply?.ok ) {
        await chrome.storage.local.set( { failStreak: 0 } );
        await report( `Letroso ${date}: posted #${docId} ${answer}`, false );
        
        if ( rest.length ) {
            await capture( rest );
        }
    
    } else if ( reply?.sent ) {
        // WordPress may have it, so the host won't send it again; post_data() has alerted Discord.
        await report( `Letroso ${date} (#${docId} ${answer}) - ${reply.error}`, true );
    
    } else {
        await captureFailed( pending, reply?.error ?? 'no reply from the host' );
    }
}

async function captureFailed( { date }, reason ) {
    
    // Further out, a failure is most likely just the end of what Letroso has published so far. Stop
    // there; the next sweep tries again.
    if ( date > addDays( todayUTC(), 1 ) ) {
        console.log( `Letroso ${date}: not available yet - ${reason}` );
        return;
    }
    
    const { failStreak = 0 } = await chrome.storage.local.get( 'failStreak' );
    const streak = failStreak + 1;
    await chrome.storage.local.set( { failStreak: streak } );
    
    const message = `Letroso ${date}: capture failed in ${streak} sweep(s) in a row - ${reason}`;
    await report( message, streak >= ALERT_AFTER );
    
    if ( streak === ALERT_AFTER ) {
        try {
            await chrome.runtime.sendNativeMessage( HOST, { action: 'alert', message } );
        } catch ( error ) {
            console.error( `Letroso: couldn't send the alert - ${error.message}` );
        }
    }
}

// The toolbar icon carries the last outcome: its tooltip says what happened, and a red ! needs a look.
async function report( summary, failed ) {
    console[ failed ? 'error' : 'log' ]( summary );
    await chrome.action.setTitle( { title: summary } );
    await chrome.action.setBadgeBackgroundColor( { color: '#d93025' } );
    await chrome.action.setBadgeText( { text: failed ? '!' : '' } );
}
