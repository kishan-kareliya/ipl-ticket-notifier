const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const keywords = [
    'book', 'buy', 'reserve', 'get', 'grab', 'ticket', 'pass', 'entry', 'admit'
];

const URL = process.env.SITE_URL;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

let wasPreviouslyAvailable = false;
let availableNotificationCount = 0;
const maxNotifications = 3;

let errorNotificationCount = 0;
const maxErrorNotifications = 2;
let wasLastCheckError = false;


function textIncludesKeyword(text) {
    const normalized = text.toLowerCase();
    return keywords.some(word => normalized.includes(word));
}

async function sendTelegramMessage(message) {
    const chatIds = [process.env.CHAT_ID, process.env.CHAT_ID_2];

    for (const chatId of chatIds) {
        try {
            const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
            await axios.post(url, {
                chat_id: chatId,
                text: message,
                parse_mode: 'Markdown'
            });
            console.log(`[SUCCESS] Telegram message sent to ${chatId}.`);
        } catch (err) {
            console.error(`[ERROR] Telegram error for ${chatId}:`, err.message);
        }
    }
}

async function scrapeAndDetectAvailability(retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const { data: html } = await axios.get(URL, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115.0.0.0 Safari/537.36',
                    "Accept-Language": "en-US,en;q=0.9",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                    "Accept-Encoding": "gzip, deflate, br",
                    "Referer": "https://www.google.com/",
                }
            });

            const $ = cheerio.load(html);
            let found = false;

            $('div[role="region"]').each((_, div) => {
                const divText = $(div).text().trim().toLowerCase();
                if (
                    textIncludesKeyword(divText) ||
                    $(div).find('p').toArray().some(p => textIncludesKeyword($(p).text()))
                ) {
                    found = true;
                    return false;
                }
            });

            wasLastCheckError = false;
            errorNotificationCount = 0;
            return found;
        } catch (err) {
            console.error(`[ERROR] Attempt ${attempt} failed:`, err.message);

            if (attempt === retries) {
                if (!wasLastCheckError || errorNotificationCount < maxErrorNotifications) {
                    await sendTelegramMessage(`[ERROR] Ticket check failed after ${retries} attempts.\n🕒 ${new Date().toLocaleString()}\nError: ${err.message}`);
                    errorNotificationCount++;
                } else {
                    console.log("[INFO] Max error notifications reached.");
                }

                wasLastCheckError = true;
                return false;
            }

            await new Promise(res => setTimeout(res, 2000));
        }
    }
}


async function checkTickets() {
    const isAvailable = await scrapeAndDetectAvailability();

    if (isAvailable) {
        if (!wasPreviouslyAvailable) {
            availableNotificationCount = 0;
            wasPreviouslyAvailable = true;
            console.log("[INFO] Tickets became available!");
        }

        if (availableNotificationCount < maxNotifications) {
            console.log("[INFO] Tickets available");
            await sendTelegramMessage(`🎟️ *Tickets might be available now!*\nCheck here: ${URL}\n🕒 ${new Date().toLocaleString()}`);
            availableNotificationCount++;
        } else {
            console.log("[INFO] Max notifications sent for current availability window.");
        }
    } else {
        if (wasPreviouslyAvailable) {
            console.log("[INFO] Tickets are no longer available. Resetting state.");
        }
        console.log("[INFO] Tickets not available");
        wasPreviouslyAvailable = false;
        availableNotificationCount = 0;
    }

    const delay = Math.floor(Math.random() * 30 + 30) * 1000;
    setTimeout(checkTickets, delay);
}

checkTickets();
