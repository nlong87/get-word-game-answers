import {
    convertDateForSQL,
    getCurrentDayInTimezone,
    getSpecificDay, proxyWebsite
} from "./helpers.mjs";

const Config = {
    number: 310,
    date: getSpecificDay('2026-02-22'),
    schedule: {
        h: 21,
        m: 0
    },
    tz: 'America/Chicago'
}

const revealed_url = "https://www.britannica.com/games/revealed";
let cachedGameData = [];

/*
The page is an Astro site. The puzzles ride in the `props` attribute of the RevealedIsland
<astro-island>: HTML-escaped JSON in Astro's serialization, where every value is a [type, value]
pair (0 = plain value or object, 1 = array). `puzzles` holds the last few weeks plus the next day;
`puzzle` is today's alone. (Until 2026-09 this was a Next.js page with a `gameData` RSC payload.)
*/
function decodeHtmlAttribute(value) {
    return value
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

function reviveAstroProp([type, value]) {
    if (type === 1) {
        return value.map(reviveAstroProp);
    }
    if (type === 0 && value && typeof value === 'object' && !Array.isArray(value)) {
        return Object.fromEntries(
            Object.entries(value).map(([key, prop]) => [key, reviveAstroProp(prop)])
        );
    }
    return value;
}

function extractGameData(html) {
    
    const islandRegex = /<astro-island\b[^>]*component-url="[^"]*RevealedIsland[^"]*"[^>]*props="([^"]*)"/;
    const match = html?.match(islandRegex);
    
    if (!match) {
        console.error("Revealed: RevealedIsland props not found in page");
        return null;
    }
    
    let props;
    try {
        props = reviveAstroProp([0, JSON.parse(decodeHtmlAttribute(match[1]))]);
    } catch (e) {
        console.error("Failed to parse RevealedIsland props:", e.message);
        return null;
    }
    
    const puzzles = Array.isArray(props.puzzles) ? [...props.puzzles] : [];
    
    if (props.puzzle && !puzzles.some(x => x.published_date === props.puzzle.published_date)) {
        puzzles.push(props.puzzle);
    }
    
    return puzzles.length ? puzzles : null;
}

async function getResponseText() {
    return await proxyWebsite( revealed_url );
}

async function getGameData() {
    
    if (Array.isArray(cachedGameData) && cachedGameData.length === 0) {
        
        const html = await getResponseText();
        cachedGameData = extractGameData(html);
    }
    
    return cachedGameData;
}

async function getPuzzle( targetDate ) {
    
    let date_string = targetDate.toString();
    let gameData = await getGameData();
    
    return (gameData) ? gameData.find( x => x['published_date'] === date_string) : null;
}

export async function getAnswers(date_string, number_to_get) {
    
    let date;
    if (date_string === null) {
        date = getCurrentDayInTimezone(Config.tz);
    } else {
        date = getSpecificDay(date_string);
    }
    
    const published = date.toString();
    const scheduled = convertDateForSQL(date.subtract({days: 1}), Config.schedule.h, Config.schedule.m);
    const diff = date.since(Config.date).days;
    const puzzleNumber = Config.number + diff;
    
    let answers = [];
    
    let i = 0;
    while (i < number_to_get) {
        
        let puzzle = await getPuzzle(date.add({days: i}));
        
        if (puzzle) {
            answers.push(puzzle.title);
        }
        
        i++;
    }
    
    return {
        'type': 'Revealed',
        'publishedDate': published,
        'scheduledDate': scheduled,
        'startingNumber': puzzleNumber,
        'answers': answers
    };
    
}