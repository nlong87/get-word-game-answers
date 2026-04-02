import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
puppeteer.use(StealthPlugin());
import Xvfb from "xvfb";

let xvfbInstance = null;
let xvfbStartPromise = null;

export function startXvfb() {
    // Store the promise so launchBrowser can await it
    xvfbStartPromise = new Promise((resolve, reject) => {
        xvfbInstance = new Xvfb({
            silent: true,
            displayNum: 99,
            xvfb_args: ["-screen", "0", "1280x720x24"]
        });
        
        xvfbInstance.start((err) => {
            if (err) {
                console.error("Xvfb failed to start:", err);
                reject(err);
                return;
            }
            console.log("Xvfb ready on display :99");
            resolve();
        });
    });
    
    return xvfbStartPromise;
}

export function stopXvfb() {
    return new Promise((resolve) => {
        if (xvfbInstance) {
            xvfbInstance.stop(resolve);
        } else {
            resolve();
        }
    });
}

export function isXvfbReady() {
    return xvfbReady;
}

export async function launchBrowser() {
    let browser;
    
    if ( process.env.NODE_ENV === 'production' ) {
        if (!xvfbStartPromise) {
            throw new Error("Xvfb not ready — cannot launch browser");
        }
        
        await xvfbStartPromise;
        
        browser = await puppeteer.launch({
            headless: false,
            env: {
                ...process.env,
                DISPLAY: ":99",
                // Force Chromium to use Google's public DNS
                HOSTALIASES: "/etc/hosts"
            },
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--no-zygote",
                "--single-process",
                "--disable-service-worker",
                "--disable-features=InterestCohort",
            ],
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
        });
        
    } else {
        browser = await puppeteer.launch({
            headless: false,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ],
        });
    }
    
    return browser;
}