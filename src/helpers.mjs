import 'dotenv/config';
import { Temporal } from '@js-temporal/polyfill';
import 'puppeteer-extra'

export function getCurrentDayInTimezone(timeZone = "America/Los_Angeles") {
    return Temporal.Now.zonedDateTimeISO(timeZone).toPlainDate();
}

export function getSpecificDay(date) {
    return Temporal.PlainDate.from(date);
}

export function convertDateForSQL( date, hours, minutes ) {
    const date_string = date.toString();
    let h = String(hours).padStart(2, "0");
    let i = String(minutes).padStart(2, "0");
    
    return `${date_string} ${h}:${i}:00`;
}

export async function proxyWebsite( fetch_url ) {
    
    const api_key = process.env.PROXY_API_KEY;
    
    const response = await fetch("https://api.brightdata.com/request", {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + api_key,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            zone: "web_unlocker1",
            url: fetch_url,
            format: "raw",
        }),
    });
    
    const data = await response.text();
    return data;
}