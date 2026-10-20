// tap.js runs in the page's world, which has no chrome.* APIs, so it posts what it finds to the
// window and this (the extension's isolated world on the same page) forwards it to background.js.
window.addEventListener( 'message', ( event ) => {
    
    if ( event.source !== window || event.data?.source !== 'tryhard-letroso' ) {
        return;
    }
    
    chrome.runtime.sendMessage( event.data ).catch( () => {} );
} );
