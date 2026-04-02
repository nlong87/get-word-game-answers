import {
    getDayDifference,
    getUTCDateDisplay,
    midnightInZone,
    modifyDays, setTimeInZone
} from "./helpers.mjs";
import {launchBrowser} from "./browser.mjs";

const reset_timezone = 'Etc/UTC';
const start_puzzle_date = midnightInZone('2025-07-14', reset_timezone);
const start_puzzle_number = 317;
const scheduled_time = {
    'hours': 18,
    'minutes': 0
};

function getFormattedDate( date ) {
    let year = date.getUTCFullYear();
    
    let month = (1 + date.getUTCMonth()).toString();
    month = month.length > 1 ? month : '0' + month;
    
    let day = date.getUTCDate().toString();
    day = day.length > 1 ? day : '0' + day;
    
    return year + '-' + month + '-' + day;
}

async function getAnswerFromSite(date_string) {
    const browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setCacheEnabled(false);
    
    const client = await page.createCDPSession();
    await client.send("Network.enable");
    
    let resolveAnswer;
    
    const answerPromise = new Promise((resolve, reject) => {
        resolveAnswer = resolve;
        setTimeout(() => reject(new Error("Timeout waiting for Firestore answer")), 20000);
    });
    
    await client.send("Fetch.enable", {
        patterns: [
            {
                urlPattern: "*google.firestore.v1.Firestore/Listen*AID=0*TYPE=xmlhttp*",
                requestStage: "Response"
            }
        ]
    });
    
    client.on("Fetch.requestPaused", async (event) => {
        const { requestId, request } = event;
        
        const isTarget =
            request.url.includes("google.firestore.v1.Firestore/Listen") &&
            request.url.includes("AID=0&") &&
            request.url.includes("TYPE=xmlhttp");
        
        if (!isTarget) {
            try {
                await client.send("Fetch.continueResponse", { requestId });
            } catch (e) {
                // Browser already closed, ignore
            }
            return;
        }
        
        try {
            const { body, base64Encoded } = await client.send("Fetch.getResponseBody", { requestId });
            
            const decoded = base64Encoded
                ? Buffer.from(body, "base64").toString("utf8")
                : body;
            
            const messages = parseBrowserChannel(decoded);
            
            for (const msg of messages) {
                if (msg.documentChange?.document?.fields?.answer?.stringValue) {
                    const answer = msg.documentChange.document.fields.answer.stringValue;
                    resolveAnswer(answer);
                }
            }
        } catch (e) {
            if (!e.message.includes("Target closed") && !e.message.includes("Session closed")) {
                console.warn("getResponseBody failed:", e.message);
            }
        }
        
        // Always try to continue, but don't crash if browser is already closed
        try {
            await client.send("Fetch.continueResponse", { requestId });
        } catch (e) {
            // Browser closed between getResponseBody and continueResponse — expected
        }
    });
    
    await page.goto(
        "https://letroso.com/en/previous/" + date_string,
        { waitUntil: "domcontentloaded" }
    );
    
    try {
        const answer = await answerPromise;
        await browser.close();
        return answer;
    } catch (err) {
        await browser.close();
        throw err;
    }
    
}

function parseBrowserChannel(raw) {
    const results = [];
    let remaining = raw;
    
    while (remaining.length > 0) {
        const newlineIdx = remaining.indexOf("\n");
        if (newlineIdx === -1) break;
        
        const lengthStr = remaining.slice(0, newlineIdx).trim();
        const byteLength = parseInt(lengthStr, 10);
        
        if (isNaN(byteLength)) {
            remaining = remaining.slice(newlineIdx + 1);
            continue;
        }
        
        const payloadStart = newlineIdx + 1;
        const payloadEnd = payloadStart + byteLength;
        if (payloadEnd > remaining.length) break;
        
        const payloadStr = remaining.slice(payloadStart, payloadEnd).trim();
        remaining = remaining.slice(payloadEnd);
        
        try {
            const frames = JSON.parse(payloadStr);
            for (const [seqNum, messages] of frames) {
                for (const msg of messages) {
                    // Skip non-object messages like "noop"
                    if (typeof msg !== "object" || msg === null) continue;
                    results.push({ seq: seqNum, ...msg });
                }
            }
        } catch (e) {
            console.warn("Parse error:", e.message, payloadStr.slice(0, 80));
        }
    }
    
    return results;
}

export async function getAnswers( date_string, number_to_get ) {
    
    const published = midnightInZone(date_string, reset_timezone);
    const scheduled = setTimeInZone( modifyDays( published, 1, false), scheduled_time.hours, scheduled_time.minutes, reset_timezone );
    
    const diff = getDayDifference( start_puzzle_date, published.toDateString() );
    const start = start_puzzle_number + diff;
    
    let answers = [];
    let i = 0;
    while( i < number_to_get ) {
        
        let puzzleDate = modifyDays( published, i );
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
        'publishedDate': getUTCDateDisplay( published ),
        'scheduledDate': getUTCDateDisplay( scheduled, true ),
        'startingNumber': start,
        'answers': answers
    };
    
}