/*
Builds the ```ansi blocks the alert channel is posted as - a port of Discord_Message from the
try-hard-core plugin (classes/helpers/class-discord-message.php), so answer alerts read the same as
the crossword ones.

Discord renders a fenced block tagged `ansi` in monospace and honours a small subset of SGR escapes
inside it, which is the only styling a plain webhook `content` field can carry. That buys two things
a flat string cannot: every alert has the same shape, so the eye finds the source and the attempt
count in the same place every time, and severity reads from colour before a word is parsed.

The subset really is small - foreground 30-37, background 40-47, plus 0/1/4 for
normal/bold/underline. Anything outside it makes Discord give up and render the whole block
uncoloured rather than erroring, so there is nothing to catch: check a new code by eye.
*/

const ESC = '\x1b[';
const RESET = '\x1b[0m';

/*
Discord's ansi palette.

'gray' is a trap: 30 is ANSI black, and Discord's dark theme barely lifts it off the code block's
own background. It reads as unstyled-but-dimmer on light theme and as almost invisible on dark.
Leave a line unpainted rather than reaching for it.
*/
export const COLORS = {
    gray: 30,
    red: 31,
    green: 32,
    yellow: 33,
    blue: 34,
    pink: 35,
    cyan: 36,
    white: 37
};

// Title colour per severity.
export const TONES = {
    error: 'red',
    success: 'green',
    warn: 'yellow',
    info: 'cyan'
};

// Discord rejects a message over 2000 characters outright; leave room for the fence.
const MAX_BLOCK = 1800;

// One failure string can be a 3 KB URL. Truncate the line, not the whole block.
const MAX_LINE = 400;

/*
Wrap text in an SGR pair. Always closes with a reset: an unterminated span bleeds into every
following line, which turns one mis-coloured detail into an unreadable block.
*/
export function paint(text, color, bold = false) {

    if (text === '') {
        return '';
    }

    if (!color || !COLORS[color]) {
        return bold ? `${ESC}1m${text}${RESET}` : text;
    }

    return `${ESC}${bold ? '1;' : '0;'}${COLORS[color]}m${text}${RESET}`;
}

/*
Strip what would break out of the fence. Body lines are free text - exception messages, WordPress
error strings, URLs. A backtick run in one of those closes the block early and the rest of the alert
renders as prose; an escape byte already in the text fights the colours set here. Neither is worth
preserving, so both are removed rather than escaped.
*/
export function sanitize(text) {

    return String(text)
        .replace(/[\x1b\r]/g, '')
        .replace(/`/g, "'")
        .replace(/[ \t]*\n[ \t]*/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

/*
Assemble a complete alert.

title  - first line, painted bold in the tone's colour.
tone   - key of TONES.
body   - one [text, colour] pair per line; entries with empty text are dropped, so callers can build
         the list with inline conditionals.
footer - last line, unpainted - the route or job key, so the channel stays greppable.
*/
export function build(title, tone, body = [], footer = '') {

    const lines = [paint(line(title), TONES[tone] ?? 'white', true)];

    for (const [text = '', color = null] of body) {
        const cleaned = line(text ?? '');

        if (cleaned !== '') {
            lines.push(paint(cleaned, color));
        }
    }

    if (footer !== '') {
        lines.push(line(footer));
    }

    let block = lines.join('\n');

    // Escapes are invisible but still count against the limit, so measure the assembled block.
    if (block.length > MAX_BLOCK) {
        block = block.slice(0, MAX_BLOCK) + RESET + '\n…';
    }

    return '```ansi\n' + block + '\n```';
}

// One sanitized, length-capped line.
function line(text) {

    const cleaned = sanitize(text);

    return cleaned.length > MAX_LINE ? cleaned.slice(0, MAX_LINE - 1) + '…' : cleaned;
}

export async function send_discord_message(message) {

    const discord_url = process.env.DISCORD_WEBHOOK;

    if (!discord_url) {
        // Surfaced in Cloud Logging so a missing webhook does not look like "no failures".
        console.error(`  DISCORD_WEBHOOK not set - alert dropped: ${message}`);
        return false;
    }

    return await fetch(discord_url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            content: message
        })
    }).then(function (response) {
        return response;
    }).catch(function (error) {
        console.error('  failed to deliver Discord alert:', error?.message ?? error);
        return false;
    });
}
