import fetch from "node-fetch";
import {addDays, getDateDisplay, getDayDifference, subDays} from "./helpers.mjs";
import puppeteer from "puppeteer";

const start_puzzle_date = "July 14 2025";
const start_puzzle_number = 316;
const scheduled_time = {
    'hours': 18,
    'minutes': 0
};

function getFormattedDate( date ) {
    let year = date.getFullYear();
    
    let month = (1 + date.getMonth()).toString();
    month = month.length > 1 ? month : '0' + month;
    
    let day = date.getDate().toString();
    day = day.length > 1 ? day : '0' + day;
    
    return year + '-' + month + '-' + day;
}

async function getAnswerFromSite( date_string ) {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    // (Optional but often helps) reduce “body missing” cases caused by caching
    await page.setCacheEnabled(false);
    
    page.on("response", async (res) => {
        const url = res.url();
        
        if (url.includes("firestore.googleapis.com")) {
            console.log("🔥 Firestore response:", url);
            console.log(res.text());
            try {
                const json = await res.text();
                console.log("📄 Firestore JSON:", json);
            } catch (e) {
                console.log("Non‑JSON response");
            }
        }
    });
    
    
    await page.goto("https://letroso.com/en/previous/" + date_string, {
        waitUntil: "networkidle2",
    });
    
    // Keep the browser open long enough for async Firestore calls
    await new Promise(r => setTimeout(r, 5000));
    
    
    /*

    const match = response_text.match(/"answer":\s*{\s*"stringValue":\s*"(.*?)"/i);
    if (!match) {
        throw new Error("Could not find answer in Firestore response");
    }
    */
    
    
    await browser.close();
    
    
    
    
}

async function runCapture(date_string) {
    const url = "https://letroso.com/en/previous/" + date_string;
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            "--disable-service-worker",
            "--disable-features=InterestCohort"
        ]
    });
    
    const page = await browser.newPage();
    await page.setCacheEnabled(false);
    
    // Node-side: receive decoded Firestore messages from the page
    await page.exposeFunction("captureFirestoreMessage", (payload) => {
        // payload is already JSON-serializable
        console.log("🔥 FIRESTORE MESSAGE:", JSON.stringify(payload, null, 2));
    });
    
    // Optional: page console (filter noise)
    page.on("console", (msg) => {
        const text = msg.text();
        if (text.includes("Audigent") || text.includes("__gpp")) return;
        console.log("PAGE:", text);
    });
    
    // Install BrowserChannel patch on every new document
    await page.evaluateOnNewDocument(function () {
        console.log(">>> NEW DOCUMENT PATCH INSTALLED");
        
        var origOpen = XMLHttpRequest.prototype.open;
        var origSend = XMLHttpRequest.prototype.send;
        
        XMLHttpRequest.prototype.open = function (method, url) {
            // Detect the Firestore GET channel
            this.__isFirestoreListen =
                typeof url === "string" &&
                url.indexOf("google.firestore.v1.Firestore/Listen") !== -1 &&
                method === "GET";
            
            return origOpen.apply(this, arguments);
        };
        
        XMLHttpRequest.prototype.send = function (body) {
            if (this.__isFirestoreListen) {
                var xhr = this;
                
                var origOnReadyStateChange = xhr.onreadystatechange;
                xhr.onreadystatechange = function () {
                    try {
                        // readyState 3 = LOADING (incremental data available)
                        if (xhr.readyState === 3) {
                            var text = xhr.responseText;
                            if (text && text.trim()) {
                                // Send raw chunk to Node
                                if (window.captureFirestoreChunk) {
                                    window.captureFirestoreChunk(text);
                                }
                            }
                        }
                    } catch (e) {
                        // swallow errors
                    }
                    
                    if (origOnReadyStateChange) {
                        return origOnReadyStateChange.apply(this, arguments);
                    }
                };
            }
            
            return origSend.apply(this, arguments);
        };
    });
    
    
    // Navigate
    await page.goto(url, { waitUntil: "domcontentloaded" });
    
    console.log("Waiting for Firestore BrowserChannel messages…");
    
    // Keep process alive to receive messages
    await new Promise((resolve) => setTimeout(resolve, 600000));
    
    await browser.close();
    
    
}

async function run(date_string) {
    const TARGET = "firestore.googleapis.com"; // the XHR you want
    
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    await page.exposeFunction("captureSnapshot", data => {
        console.log("Snapshot:", data);
    });
    
    await page.evaluateOnNewDocument(() => {
        // This runs before any page JS executes
        window.__patchFirestore = () => {
            const orig = firebase.firestore().DocumentReference.prototype.onSnapshot;
            
            firebase.firestore().DocumentReference.prototype.onSnapshot = function (cb) {
                return orig.call(this, (snap) => {
                    try {
                        window.captureSnapshot(snap.data());
                    } catch (e) {
                        console.warn("captureSnapshot failed:", e);
                    }
                    cb(snap);
                });
            };
        };
    });
    
    
    // Capture the request
    page.on("request", async (req) => {
        if (req.url().includes(TARGET) && req.url().includes('AID=0')) {
            console.log("🔥 XHR Request URL:", req.url());
            console.log("Method:", req.method());
            console.log("Request Headers:", req.headers());
            
            if (req.postData()) {
                console.log("POST Body:", req.postData());
            }
            
            const method = req.method();
            const postData = req.postData();
            const headers = req.headers();
            
            
            const replay = await fetch(req.url(), {
                method,
                headers,
                body: postData
            });
            
            const text = await replay.text();
            console.log("Replayed response:", text);
            
        }
    });
    
    // Capture the response
    page.on("response", async (res) => {
        if (res.url().includes(TARGET) && res.url().includes('AID=0')) {
            console.log("🔥 XHR Response URL:", res.url());
            console.log("Status:", res.status());
            
            
        }
    });
    
    await page.goto("https://letroso.com/en/previous/" + date_string, {
        waitUntil: "networkidle2",
    });
    
    
    await page.evaluate(() => {
        // Wait until firebase is available
        const interval = setInterval(() => {
            if (window.firebase?.firestore) {
                clearInterval(interval);
                window.__patchFirestore();
            }
        }, 50);
    });
    
    
    await page.waitForResponse(res =>
        res.url().includes("firestore.googleapis.com") && res.url().includes("AID=0")
    );
    await browser.close();
}

export async function getAnswers( date_string, number_to_get ) {
    
    const published = new Date( date_string );
    const scheduled = subDays( published, 1 );
    scheduled.setHours( scheduled_time.hours );
    scheduled.setMinutes( scheduled_time.minutes );
    
    const diff = getDayDifference( start_puzzle_date, published.toDateString() );
    const start = start_puzzle_number + diff;
    
    let answers = [];
    let i = 0;
    while( i < number_to_get ) {
        
        let puzzleDate = addDays( date_string, i );
        let _date = getFormattedDate( puzzleDate );
        let answer = await getAnswerFromSite( _date );
        
        answers.push( answer );
        i++;
    }
    
    if ( ! answers ) {
        return false;
    }
    
    return {
        'type': 'Letroso',
        'publishedDate': getDateDisplay( published ),
        'scheduledDate': getDateDisplay( scheduled, true ),
        'startingNumber': start,
        'answers': answers
    };
    
}
// await getAnswers('2026-03-23 02:00:00 GMT-0700', 1).then( result => console.log(result) );
//await runCapture('2026-01-10', 1).then( result => console.log(result) );