import { Temporal } from '@js-temporal/polyfill';
import axios from "axios";
import {HttpsProxyAgent} from "https-proxy-agent";

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
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    
    const username = process.env.PROXY_USERNAME;
    const password = process.env.PROXY_PASSWORD;
    
    const proxy = `http://${username}:${password}@brd.superproxy.io:33335`;
    try {
        const response = await axios.get(fetch_url, {
            httpsAgent: new HttpsProxyAgent(proxy)
        });
        
        return response.data;
    } catch(error){
        console.error('Error:', error.message);
        return false;
    }
}