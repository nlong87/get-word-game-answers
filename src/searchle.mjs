import fetch from "node-fetch";
import {
    convertDateForSQL,
    getCurrentDayInTimezone,
    getSpecificDay
} from "./helpers.mjs";
import {launchBrowser} from "./browser.mjs";

const Config = {
    number: 1,
    date: getSpecificDay('2023-06-22'),
    schedule: {
        h: 18,
        m: 0
    },
    tz: 'Etc/UTC'
}

async function getAllAnswers() {
    
    const str = await getScriptContents();
    
    const regex = /\[[^\]]*text:"should i explore a city by"[^\]]*\]/g;
    
    const matches = str.match(regex);
    
    if (matches) {
        return Function("return " + matches[0])();
    }
    
    return false;
}

async function getScriptUrl() {
    const base_url = 'https://searchle.net/';
    
    const browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setCacheEnabled(false);
    
    const client = await page.createCDPSession();
    await client.send("Network.enable");
    
    await page.goto(
        base_url,
        { waitUntil: "domcontentloaded" }
    );
    
    const scriptSources = await page.$$eval('script', scripts =>
        scripts.map(s => s.src).filter(Boolean)
    );
    
    return scriptSources.find( src => /\/static\/js\/main\.[a-z0-9-_]+\.js$/.test(src) );
}


async function getScriptContents() {
    const js_file = await getScriptUrl();
    
    if ( js_file ) {
        const response = await fetch(js_file);
        return await response.text();
    } else {
        return '';
    }
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
    
    const all_answers = await getAllAnswers();
    let answers = false;
    
    if ( all_answers ) {
        answers = all_answers.slice(diff, diff + number_to_get );
    }
    
    if (!answers) {
        return false;
    }
   
    answers = answers.map(a => a.answer +  ' |~~~~| ' + a.text);
    
    return {
        'type': 'Searchle',
        'publishedDate': published,
        'scheduledDate': scheduled,
        'startingNumber': puzzleNumber,
        'answers': answers
    };
    
}