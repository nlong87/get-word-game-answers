import { Temporal } from '@js-temporal/polyfill';

const msPerMinute = 1000 * 60;
const msPerHour = msPerMinute * 60;
const msPerDay = msPerHour * 24;

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

export function addDays(date, days) {
    
    var result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
    
}

export function subDays(date, days) {
    
    var result = new Date(date);
    result.setDate(result.getDate() - days);
    return result;
    
}

export function modifyDays( date, days, add = true ) {
    const modifier = add ? 1 : -1;
    const time = days * msPerDay * modifier;
    
    return new Date(date.getTime() + time);
}

function getOffsetMinutes(date, timeZone) {
    const dtf = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
    
    const parts = dtf.formatToParts(date);
    
    const y = Number(parts.find(p => p.type === "year").value);
    const m = Number(parts.find(p => p.type === "month").value);
    const d = Number(parts.find(p => p.type === "day").value);
    const h = Number(parts.find(p => p.type === "hour").value);
    const min = Number(parts.find(p => p.type === "minute").value);
    const s = Number(parts.find(p => p.type === "second").value);
    
    // Local time in target zone
    const asUTC = Date.UTC(y, m - 1, d, h, min, s);
    
    // Offset = localTime - actualUTC
    return (asUTC - date.getTime()) / 60000;
}

export function midnightInZone(dateString = null, timeZone = "America/Los_Angeles") {
    let y, m, d;
    
    if (typeof dateString === 'string' && dateString.trim().length > 0) {
        [y, m, d] = dateString.split("-").map(Number);
    } else {
        const now = new Date();
        const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }).formatToParts(now);
        
        y = Number(parts.find(p => p.type === "year").value);
        m = Number(parts.find(p => p.type === "month").value);
        d = Number(parts.find(p => p.type === "day").value);
    }
    
    const utcMidnight = new Date(Date.UTC(y, m - 1, d));
    const offsetMinutes = getOffsetMinutes(utcMidnight, timeZone);
    
    return new Date(utcMidnight.getTime() - offsetMinutes * 60000);
}

export function setTimeInZone(midnightDate, hours, minutes, timeZone = "America/Los_Angeles") {
    // Step 1: Extract the calendar date in the target zone
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(midnightDate);
    
    const y = Number(parts.find(p => p.type === "year").value);
    const m = Number(parts.find(p => p.type === "month").value);
    const d = Number(parts.find(p => p.type === "day").value);
    
    // Step 2: Create a UTC "guess" for that date/time
    const utcGuess = new Date(Date.UTC(y, m - 1, d, hours, minutes));
    
    // Step 3: Determine the zone's UTC offset on that date/time
    const tzName = new Intl.DateTimeFormat("en-US", {
        timeZone,
        timeZoneName: "short"
    })
        .formatToParts(utcGuess)
        .find(p => p.type === "timeZoneName").value;
    
    const offsetMatch = tzName.match(/GMT([+-]\d+)/);
    const offsetHours = offsetMatch ? Number(offsetMatch[1]) : 0;
    const offsetMinutes = offsetHours * 60;
    
    // Step 4: Convert local time → UTC
    return new Date(
        Date.UTC(y, m - 1, d, hours, minutes) - offsetMinutes * 60 * 1000
    );
}

export function isDST(d) {
    let jan = new Date(d.getFullYear(), 0, 1).getTimezoneOffset();
    let jul = new Date(d.getFullYear(), 6, 1).getTimezoneOffset();
    return Math.max(jan, jul) !== d.getTimezoneOffset();
}

function add_leading_zero( num ) {
    return ("0" + num).slice(-2);
}

export function getDateDisplay( date, time = false ) {
    
    let output = date.getMonth()+1 + "/" + date.getDate() + "/" + date.getFullYear();
    
    if ( time ) {
        output += " " + add_leading_zero(date.getHours()) + ":" + add_leading_zero(date.getMinutes()) + ":" + add_leading_zero(date.getSeconds());
    }
    
    return output
}

export function getUTCDateDisplay(date, time = false) {
    
    let output = date.getUTCMonth() + 1 + "/" + date.getUTCDate() + "/" + date.getUTCFullYear();
    
    if (time) {
        output += " " + add_leading_zero(date.getUTCHours()) + ":" + add_leading_zero(date.getUTCMinutes()) + ":" + add_leading_zero(date.getUTCSeconds());
    }
    
    return output
}

export function dayDiff( a, b ) {
    return Math.round((a - b) / msPerDay);
}

export function utcYMD(date) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

export function getDayDifference( start_date_string, target_date_string ) {
    
    const startDate = new Date(start_date_string);
    const targetDate = new Date(target_date_string);
    
    // To calculate the time difference of two dates
    let time_diff = targetDate.getTime() - startDate.getTime();
    
    return Math.floor(time_diff / (1000 * 3600 * 24) );
    
}