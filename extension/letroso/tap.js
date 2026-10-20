/*
Runs in the page's own world on letroso.com, before any of the site's scripts. It only acts in a tab
background.js opened for a capture (#tryhard-capture=YYYY-MM-DD), so ordinary visits are untouched.

The puzzle arrives over Firestore's Listen channel - the AID=0 response in DevTools - which the SDK
streams via fetch() + ReadableStream, so tapping fetch sees it as it arrives. XHR is tapped too, for
the SDK's long-polling fallback. Ported from installFirestoreTap() in src/letroso.mjs.

Nothing here has chrome.* APIs; results go to relay.js with window.postMessage.
*/
( () => {
    
    const capture = location.hash.match( /^#tryhard-capture=(\d{4}-\d{2}-\d{2})$/ );
    
    if ( !capture ) {
        return;
    }
    
    const target = capture[1];
    let reported = false;
    
    const report = ( result ) => {
        if ( reported ) return;
        reported = true;
        window.postMessage( { source: 'tryhard-letroso', target, ...result }, location.origin );
    };
    
    /*
    The page refuses a date after the end of *local* today ("still to come"), but captures run days
    ahead. Move this tab's clock to just after local midnight of the target so the page asks for it;
    Firestore still decides whether to serve it, and as of 2026-10 it serves days ahead.
    */
    const RealDate = Date;
    const shift = Math.max( 0, new RealDate( `${target}T00:01:00` ).getTime() - RealDate.now() );
    
    if ( shift > 0 ) {
        const now = () => RealDate.now() + shift;
        
        window.Date = new Proxy( RealDate, {
            construct: ( Target, args, newTarget ) => Reflect.construct( Target, args.length ? args : [ now() ], newTarget ),
            apply: () => new RealDate( now() ).toString(),
            get: ( Target, prop, receiver ) => prop === 'now' ? now : Reflect.get( Target, prop, receiver )
        } );
    }
    
    // A profile that has never finished the tutorial never starts the game.
    try {
        localStorage.setItem( 'letroso-tutorial-done-in', JSON.stringify( ['en', 'es', 'pt'] ) );
    } catch {}
    
    const PUZZLE = /letroso-daily-en\\?\/(\d+)"[\s\S]*?"answer"\s*:\s*\{\s*"stringValue"\s*:\s*"([^"]+)"/;
    
    const scan = ( text ) => {
        const found = text.match( PUZZLE );
        
        if ( found ) {
            report( { docId: Number( found[1] ), answer: found[2] } );
        } else if ( text.includes( 'insufficient permissions' ) ) {
            report( { denied: true } );
        }
    };
    
    // The page logs why it gave up (e.g. "<date> is still to come"), which beats waiting out the timeout.
    const originalError = console.error;
    console.error = function ( ...args ) {
        if ( args[0] === 'Loading the game failed:' ) {
            report( { error: `the page gave up: ${args[1]?.message ?? args[1]}` } );
        }
        return originalError.apply( this, args );
    };
    
    const originalFetch = window.fetch;
    window.fetch = async function ( ...args ) {
        const response = await originalFetch.apply( this, args );
        
        try {
            const url = String( args[0] instanceof Request ? args[0].url : args[0] );
            
            if ( url.includes( 'firestore.googleapis.com' ) && response.body ) {
                const reader = response.clone().body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                
                ( async () => {
                    while ( !reported ) {
                        const { done, value } = await reader.read();
                        if ( done ) break;
                        buffer += decoder.decode( value, { stream: true } );
                        scan( buffer );
                    }
                    // Only this copy: the page's own branch of the stream carries on.
                    await reader.cancel();
                } )().catch( () => {} );
            }
        } catch {}
        
        return response;
    };
    
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function ( ...args ) {
        const grab = () => {
            try {
                if ( !reported && this.responseText ) scan( this.responseText );
            } catch {}
        };
        this.addEventListener( 'progress', grab );
        this.addEventListener( 'load', grab );
        return originalSend.apply( this, args );
    };

} )();
