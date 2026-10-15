import fetch from "node-fetch";
import {
    getCurrentDayInTimezone,
    getSpecificDay,
    scheduleForSite
} from "./helpers.mjs";

/*
LinkedIn's daily games are served to logged-out guests with the full solution attached, but only
for today: neither endpoint below honours a puzzle id or date, so there is no backfill and nothing
ahead. Every game resets at midnight Pacific.

Two apps serve them. The older voyager app answers a GraphQL query per gameTypeId with clean JSON,
but its schema predates Wend and Patches (their puzzle union comes back empty). Those two are read
from the newer "flagship-web" app instead, whose router answers a POST with a React Server
Components stream that has the puzzle embedded as JSON.

Both need a guest session: a plain GET of any games page sets JSESSIONID (plus bcookie, lidc, ...),
and JSESSIONID doubles as the csrf-token header. No member account is involved.

Every number below is the one the site displays ("No. 897"), which is also the puzzleId in the
payload. The queryId hash and the RSC request shape were lifted from the live site and are
undocumented; expect them to change eventually.
*/
const Config = {
    date: getSpecificDay('2026-10-14'),
    schedule: {
        h: 0,
        m: 0,
        tz: 'America/Los_Angeles'
    },
    tz: 'America/Los_Angeles',
    games: {
        'linkedin-pinpoint':    { type: 'LinkedIn Pinpoint',    number: 897, gameTypeId: 1, union: 'blueprintGamePuzzle' },
        'linkedin-crossclimb':  { type: 'LinkedIn Crossclimb',  number: 897, gameTypeId: 2, union: 'crossClimbGamePuzzle' },
        'linkedin-queens':      { type: 'LinkedIn Queens',      number: 897, gameTypeId: 3, union: 'queensGamePuzzle' },
        'linkedin-tango':       { type: 'LinkedIn Tango',       number: 737, gameTypeId: 5, union: 'lotkaGamePuzzle' },
        'linkedin-zip':         { type: 'LinkedIn Zip',         number: 576, gameTypeId: 6, union: 'trailGamePuzzle' },
        'linkedin-mini-sudoku': { type: 'LinkedIn Mini Sudoku', number: 429, gameTypeId: 7, union: 'miniSudokuGamePuzzle' },
        'linkedin-patches':     { type: 'LinkedIn Patches',     number: 211, slug: 'patches', union: 'patchesGamePuzzle' },
        'linkedin-wend':        { type: 'LinkedIn Wend',        number: 128, slug: 'wend',    union: 'wendGamePuzzle' }
    }
}

const site_url = 'https://www.linkedin.com';
const voyager_query = 'voyagerIdentityDashGames.22685dd4999129d6bed79f33e65dcbc5';
// Used only if the page stops advertising its own version in data-track.
const fallback_app_version = '0.2.7920';

const user_agent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';

const REQUEST_GAP_MS = 1000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Opens a guest session by loading a games page and keeping the cookies it sets.
 *
 * @returns {Promise<{cookie: string, csrf: string, appVersion: string}>}
 */
async function getSession() {

    const response = await fetch( site_url + '/games/queens/', {
        headers: { 'User-Agent': user_agent }
    });

    if ( !response.ok ) {
        throw new Error( `guest session: HTTP ${response.status}` );
    }

    const jar = {};
    for ( const line of response.headers.raw()['set-cookie'] ?? [] ) {
        const [pair] = line.split( ';' );
        const at = pair.indexOf( '=' );
        jar[pair.slice( 0, at ).trim()] = pair.slice( at + 1 ).trim();
    }

    if ( !jar.JSESSIONID ) {
        throw new Error( 'guest session: no JSESSIONID cookie (blocked or sent to the authwall?)' );
    }

    const html = await response.text();
    const version = html.match( /mpVersion&quot;:&quot;([\d.]+)&quot;/ );

    return {
        cookie: Object.entries( jar ).map( ([name, value]) => `${name}=${value}` ).join( '; ' ),
        csrf: jar.JSESSIONID.replace( /"/g, '' ),
        appVersion: version ? version[1] : fallback_app_version
    };
}

/**
 * Today's puzzle for a voyager-served game.
 *
 * @returns {Promise<{number: number, puzzle: Object}>}
 */
async function fetchVoyager( session, game ) {

    const url = `${site_url}/voyager/api/graphql?includeWebMetadata=true`
        + `&variables=(gameTypeId:${game.gameTypeId})&queryId=${voyager_query}`;

    const response = await fetch( url, {
        headers: {
            'User-Agent': user_agent,
            'Cookie': session.cookie,
            'csrf-token': session.csrf,
            'x-restli-protocol-version': '2.0.0',
            'Accept': 'application/vnd.linkedin.normalized+json+2.1'
        }
    });

    if ( !response.ok ) {
        throw new Error( `voyager: HTTP ${response.status}` );
    }

    const body = await response.json();
    const entity = ( body.included ?? [] ).find( item => item.$type?.endsWith( '.Game' ) );
    const puzzle = entity?.gamePuzzle?.[game.union];

    if ( !puzzle ) {
        throw new Error( `voyager: no ${game.union} in the response` );
    }

    return { number: entity.puzzleId, puzzle: puzzle };
}

/**
 * Today's puzzle for a game only the RSC app serves, by asking its router to navigate to the board.
 *
 * @returns {Promise<{number: number, puzzle: Object}>}
 */
async function fetchRsc( session, game ) {

    const path = `/games/${game.slug}/?skipStartScreen=true`;

    const response = await fetch( `${site_url}/flagship-web${path}`, {
        method: 'POST',
        headers: {
            'User-Agent': user_agent,
            'Cookie': session.cookie,
            'csrf-token': session.csrf,
            'Content-Type': 'application/json',
            'x-li-rsc-stream': 'true',
            'x-li-application-version': session.appVersion,
            // Without these two the server answers 200 with an empty body.
            'x-li-anchor-page-key': `d_flagship3_games_${game.slug}_start_screen`,
            'x-li-initial-url': `/games/${game.slug}/`
        },
        body: JSON.stringify({
            '$type': 'proto.sdui.actions.core.NavigateToScreen',
            'screenId': 'com.linkedin.sdui.flagshipnav.games.GamePlayRouterPage',
            'url': path,
            'requestedArguments': {
                'payload': { 'gameType': game.slug, 'skipStartScreen': true },
                'states': [],
                'requestMetadata': { '$type': 'proto.sdui.common.RequestMetadata' },
                'screenId': '',
                'knownTemplateIds': []
            }
        })
    });

    if ( !response.ok ) {
        throw new Error( `rsc: HTTP ${response.status}` );
    }

    const stream = await response.text();
    const puzzle = extractObject( stream, `"${game.union}":` );
    const edition = stream.match( /"todaysGameEditionText":"(\d+)"/ );

    if ( !puzzle || !edition ) {
        throw new Error( `rsc: no ${game.union} in the ${stream.length}-byte response` );
    }

    return { number: parseInt( edition[1] ), puzzle: puzzle };
}

/**
 * Parses the JSON object that follows `marker` in a larger text, by scanning to its matching brace.
 *
 * The RSC stream is not one JSON document, so the object is cut out first. Braces inside strings
 * are skipped so a clue like "{x}" can't end the object early.
 */
function extractObject( text, marker ) {

    const at = text.indexOf( marker );
    const start = at === -1 ? -1 : text.indexOf( '{', at + marker.length );
    if ( start === -1 ) {
        return null;
    }

    let depth = 0;
    let inString = false;

    for ( let i = start; i < text.length; i++ ) {
        const char = text[i];

        if ( inString ) {
            if ( char === '\\' ) {
                i++;
            } else if ( char === '"' ) {
                inString = false;
            }
        } else if ( char === '"' ) {
            inString = true;
        } else if ( char === '{' ) {
            depth++;
        } else if ( char === '}' && --depth === 0 ) {
            return JSON.parse( text.slice( start, i + 1 ) );
        }
    }

    return null;
}

/** Splits a flat, row-major cell list into rows. */
function toRows( cells, width ) {
    const rows = [];
    for ( let i = 0; i < cells.length; i += width ) {
        rows.push( cells.slice( i, i + width ) );
    }
    return rows;
}

/** 'PatchesShapeConstraint_VERTICAL_RECT' or 'VERTICAL_RECT' -> 'vertical_rect'. */
function enumName( value ) {
    return String( value ).replace( /^[A-Z][a-z][A-Za-z]*_/, '' ).toLowerCase();
}

/*
Each formatter turns one game's puzzle into the structured answer posted to WordPress. Cells are
row-major indexes (row * width + col) unless noted.
*/
const formatters = {

    // solutions[0] is the category as displayed; the rest are the variants and typos it accepts.
    // Not keyed "answer": WordPress reads an object with an "answer" key as answer + extra fields
    // and would keep only that string, dropping the clues.
    'linkedin-pinpoint': p => ({
        "category": p.solutions[0],
        "clues": p.clues
    }),

    // The ladder in solved order. The first and last rungs share one clue that joins their two words.
    'linkedin-crossclimb': p => ({
        "ladder": [...p.rungs]
            .sort( (a, b) => a.solutionRungIndex - b.solutionRungIndex )
            .map( rung => ({ "word": rung.word, "clue": rung.clue }) )
    }),

    'linkedin-queens': p => ({
        "size": p.gridSize,
        "regions": p.colorGrid.map( row => row.colors ),
        "queens": p.solution.map( cell => ({ "row": cell.row, "col": cell.col }) )
    }),

    // ZERO is the sun and ONE the moon. Edges are the = / x signs between two cells.
    'linkedin-tango': p => ({
        "size": p.gridSize,
        "solution": toRows( p.solution.map( value => enumName( value ) === 'one' ? 1 : 0 ), p.gridSize ),
        "presets": p.presetCellIdxes,
        "edges": p.edges.map( edge => ({ "from": edge.startIdx, "to": edge.endIdx, "equal": edge.isEqual }) )
    }),

    // path visits every cell in order; numbers are the cells of the numbered dots, 1 first.
    'linkedin-zip': p => ({
        "size": p.gridSize,
        "path": p.solution,
        "numbers": p.orderedSequence,
        "walls": p.walls.map( wall => ({ "cell": wall.cellIdx, "side": enumName( wall.direction ) }) )
    }),

    'linkedin-mini-sudoku': p => ({
        "rows": p.gridRowSize,
        "cols": p.gridColSize,
        "variant": p.name,
        "solution": toRows( p.solution, p.gridColSize ),
        "presets": p.presetCellIdxes,
        "regions": p.regions.map( region => region.cellIdxes )
    }),

    // Each patch holds exactly one clue cell. A shape of "unknown" and a size of 0 are clues that
    // don't constrain that property, so both are posted as null.
    'linkedin-patches': p => ({
        "rows": p.gridRows,
        "cols": p.gridCols,
        "patches": p.solution.map( region => {
            const clue = p.clueCells.find( c => region.cellIdxes.includes( c.cellIdx ) );
            const shape = clue ? enumName( clue.shapeConstraint ) : 'unknown';
            return {
                "cells": region.cellIdxes,
                "clueCell": clue?.cellIdx ?? null,
                "shape": shape === 'unknown' ? null : shape,
                "size": clue?.numberConstraint || null
            };
        })
    }),

    // Each word is spelled by walking its cells through the letter grid; '' marks an empty cell.
    'linkedin-wend': p => ({
        "rows": p.gridRows,
        "cols": p.gridCols,
        "letters": p.puzzleLetters,
        "words": p.solutionWords.map( word => ({
            "word": word.sequencingIndex.map( i => p.puzzleLetters[i] ).join( '' ),
            "path": word.sequencingIndex
        }))
    })
};

export async function getAnswers( date_string, number_to_get ) {

    const today = getCurrentDayInTimezone(Config.tz);
    const date = date_string === null ? today : getSpecificDay(date_string);

    const diff = date.since(Config.date).days;

    // Only today is ever served, so any other date (or a zero-length request) has nothing to fetch.
    // Without a session no game can be fetched, so that failure throws once for the whole run
    // rather than raising eight identical alerts.
    const session = number_to_get > 0 && date.equals( today ) ? await getSession() : null;

    let results = {};

    for ( const [key, game] of Object.entries( Config.games ) ) {

        const puzzleNumber = game.number + diff;
        let answers = [];
        let errors = [];

        if ( session ) {
            try {
                await sleep( REQUEST_GAP_MS );
                const served = game.gameTypeId
                    ? await fetchVoyager( session, game )
                    : await fetchRsc( session, game );

                // Ahead of the reset (or from a stale cache) the server still hands out yesterday's
                // puzzle, which must not be posted as today's.
                if ( served.number !== puzzleNumber ) {
                    throw new Error( `served No. ${served.number}, expected ${puzzleNumber}` );
                }

                answers.push( formatters[key]( served.puzzle ) );
            } catch ( error ) {
                errors.push( `${key}: ${error.message}` );
            }
        }

        const result = {
            'type': game.type,
            'publishedDate': date.toString(),
            'scheduledDate': scheduleForSite( date, Config.schedule ),
            'startingNumber': puzzleNumber,
            // Only today is ever published, so a short result is expected rather than a failure.
            'clamped': true,
            'answers': answers
        };

        if ( errors.length ) {
            console.error( errors.map( e => `  ${e}` ).join( '\n' ) );
            Object.defineProperty( result, 'errors', {
                value: errors,
                enumerable: false,
                configurable: true
            });
        }

        results[key] = result;
    }

    return results;
}
