import {
    convertDateForSQL,
    getCurrentDayInTimezone,
    getSpecificDay
} from "./helpers.mjs";
import {launchBrowser} from "./browser.mjs";

const Config = {
    number: 316,
    date: getSpecificDay('2025-07-14'),
    schedule: {
        h: 18,
        m: 0
    },
    tz: 'Etc/UTC'
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
    
    let date;
    if ( date_string === null ) {
        date = getCurrentDayInTimezone(Config.tz);
    } else {
        date = getSpecificDay(date_string);
    }
    
    const published = date.toString();
    const scheduled = convertDateForSQL( date.subtract({days: 1}), Config.schedule.h, Config.schedule.m );
    const diff = date.since(Config.date).days;
    const puzzleNumber = Config.number + diff;
    
    let answers = [];
    let i = 0;
    while( i < number_to_get ) {
        
        let answer = await getAnswerFromSite( date.add( { days: i }).toString() );
        answers.push( answer );
        i++;
    }
    
    if ( ! answers ) {
        return false;
    }
    
    return {
        'type': 'Letroso',
        'publishedDate': published,
        'scheduledDate': scheduled,
        'startingNumber': puzzleNumber,
        'answers': answers
    };
    
}