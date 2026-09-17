# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # node src/index.js
npm run dev        # NODE_ENV=development + node --watch
npm run deploy     # Cloud Build image -> Cloud Run (us-west1, project tryhard-word-games)
npm run deploy2    # Cloud Run deploy --source . (no separate build step)
npm run logs       # tail Cloud Run logs
```

There is no test suite, linter, or build step. Verify a scraper by running the server and hitting it:

```bash
npm run dev
curl 'http://localhost:8081/post_answers?type=wordle&amount=8'
```

In non-production the `/post_answers` route also accepts GET (see the dev-only forwarder in `src/index.js`), which makes browser testing easy. Be aware the handler **posts to the live WordPress endpoint** — to only exercise scraping, import `process_answers` from `src/index.js` and call it directly, or run the module's `getAnswers()` in a scratch script.

## Architecture

An Express server that scrapes/derives upcoming answers for ~25 daily word games and POSTs them to a WordPress REST endpoint (`tryhardguides/v1/add_answers`). It is invoked by Google Cloud Scheduler; in production the handler rejects requests whose User-Agent isn't `Google-Cloud-Scheduler`.

Request flow:

```
POST /post_answers?type=<puzzle>&amount=<n>   (src/index.js)
  -> process_answers()   switch on puzzle type
  -> get_answers()       (src/get-answers.mjs) switch again, dispatch to the module
  -> <puzzle>.mjs        getAnswers(date_string, number_to_get)
  -> post_data()         WPAPI POST; Discord webhook alert on short/empty results
```

The two switch statements are redundant but both must be updated to add a puzzle. `get-answers.mjs` is also where a single type fans out to multiple result keys (e.g. `nerdle` produces `nerdle`, `nerdle-mini`, `nerdle-micro`, `nerdle-maxi`) or where the key is renamed.

### Response status and retries

Sources are sometimes not live yet at the scheduled minute (parseword is the usual one), so the
route's status code is a retry signal:

- **503** — the run collected nothing, so nothing was posted. `post_data()` is skipped entirely.
  Safe to re-run, because WordPress never saw this batch.
- **200** — everything else, including a disabled puzzle, a short or partly blank result, and a
  WordPress rejection after a real post. Re-posting a batch WordPress has already seen is not
  safely idempotent, so these must not be retried.

Retries themselves are Cloud Scheduler's job, configured per job rather than in code: the
`Parseword` job runs `--max-retry-attempts=3 --min-backoff=20m --max-backoff=20m` (see
`npm run scheduler:parseword-retries`), giving attempts at roughly +0, +20, +40 and +60 minutes.
Every other job still has `retryCount: 0`, so a 503 there is just a failed execution in the
scheduler's logs. Each failed attempt also sends its own Discord alert.

### Puzzle module contract

Every `src/<puzzle>.mjs` exports `getAnswers(date_string, number_to_get)` (a couple export `getAnswer` instead — `marveldle`, `poeltl`; `get-answers.mjs` aliases them on import) and returns:

```js
{
  type: 'Wordle',                  // display name posted to WordPress
  publishedDate: '2026-09-08',     // ISO date of the first answer
  scheduledDate: '2026-09-07 18:00:00',  // when WP should publish; day before, at Config.schedule
  startingNumber: 1234,            // puzzle number of the first answer
  answers: [ ... ]                 // number_to_get entries, in date order
}
```

Each module opens with a `Config` object anchoring the puzzle's numbering and timezone:

```js
const Config = {
    number: 710,                        // puzzle number on Config.date
    date: getSpecificDay('2023-05-30'), // known anchor date
    schedule: { h: 18, m: 0 },          // publish time on the previous day
    tz: 'Etc/UTC'                       // timezone that decides "today" for this game
}
```

`startingNumber` is normally derived as `Config.number + date.since(Config.date).days`. When a game's numbering drifts, fix the anchor, not the arithmetic.

The envelope describes the batch with a *single* date and number, which implies the WordPress side
extrapolates +1 day / +1 number per answer. That is wrong for any game whose answers aren't
consecutive daily integers, so such modules also return:

```js
clamped: true,          // optional: length is capped upstream; suppresses the short-result alert
answerSchedule: [       // parallel to answers[]; each entry's real date and number
    { publishedDate: '2026-09-02', scheduledDate: '2026-09-01 18:00:00', number: 1089 },
    ...
]
```

Only `src/nyt-bonus.mjs` uses this, because its drops are a week apart. The WP endpoint prefers
`answerSchedule[i]` when present and falls back to extrapolation, so daily games are unaffected.

**A puzzle's `id` in an API payload is not its puzzle number.** NYT Strands is the trap: the
payload for 2026-09-13 carries `id: 1110`, but the site displays **#924**. The ids are internal
and non-monotonic (1109, 1111, 1110); the displayed number is just days since launch. Nothing in
the payload hints at this, so always confirm a number against what the site renders before
anchoring a `Config`. `src/strands.mjs` anchors at the 2024-03-04 launch as `number: 1` to make
the relationship obvious. NYT bonus puzzles display no number at all, so `src/nyt-bonus.mjs`
numbers them by weekly drop from the first drop on 2026-08-26. `date_string === null` means "today in `Config.tz`"; otherwise it's an explicit ISO date used for backfills.

Dates use the Temporal polyfill via `src/helpers.mjs` (`getCurrentDayInTimezone`, `getSpecificDay`, `convertDateForSQL`) — not `Date`. `moment` is still a dependency but only appears in a comment.

### Answer-string delimiters

Multi-part answers are packed into single strings with sentinels the WordPress side splits on:

- `' |~~| '` separates items within a group (e.g. Connections category titles, Shuffalo words).
- `' |~~~~| '` separates the answer from extra/hint data (e.g. `answer |~~~~| hints`).

Preserve the exact spacing.

### How modules get their data (five strategies)

1. **Public JSON API** — most common (`wordle`, `connections`, `nerdle`, `contexto`, `jumble`, …) via `node-fetch`.
2. **Headless browser** — `letroso`, `searchle` use `launchBrowser()` from `src/browser.mjs`. These typically load the site, find the hashed `main.<hash>.js` bundle, and regex the answer array out of it; some `eval`/`Function` the matched literal.
3. **Bright Data proxy** — `parseword`, `revealed` call `proxyWebsite(url)` from `helpers.mjs` **only when `NODE_ENV === 'production'`**, and fetch directly in development. Note `proxyWebsite` returns raw text and no status code, so a proxied module has to parse (and validate) the body itself — `parseword` does this in `getAnswerJson`, which returns parsed JSON or `null` in both environments; a day that isn't published yet answers 403 with the body `Forbidden`.
4. **Weekly index discovery** — `nyt-bonus` only. See below.
5. **Bundled static data** — files prefixed `_` are data or vendored site logic, not scrapers: `_phrazle-answers.mjs`, `_quordle-answers.mjs`, `_semantle-child-words.mjs`, `_colordle-functions.js`. Phrazle/Quordle index into these lists by day offset (Phrazle wraps around the list when it runs off the end).

### NYT bonus puzzles (`src/nyt-bonus.mjs`)

NYT bonus puzzles (Wordle in 1, Connections 3x3, Colorful Strands) break the daily model twice
over, so they do **not** follow the `Config.number + daysDiff` pattern:

- They drop **weekly, on Wednesdays**.
- Their slugs are `YYYY-MM-DD-<id>` pairs validated exactly by the detail endpoint (a wrong id
  404s), and the ids are **not sequential** — Colorful Strands has run 1089, 1086, 1088, 1085, 1114.
  The slug therefore cannot be computed and must be discovered.

Discovery is `https://www.nytimes.com/svc/games/bonus/week/v1/{YYYY-MM-DD}.json`, which resolves any
date to its containing drop and returns `bonus_puzzles_week = { drop_date, prev_drop, next_drop,
puzzles[] }`. Walk `next_drop` forward; a week with `puzzles: []` is the published horizon (about
5 drops out), not an error — that is what `clamped: true` exists for.

One `nyt-bonus` type produces three keys off a single walk, merged with `Object.assign` in
`get-answers.mjs`. Detail endpoints: `/svc/wordle-in-one/v1/bonus/{slug}.json`,
`/svc/connections/v2/bonus/{slug}.json`, `/svc/strands/v2/bonus/{slug}.json`. The last shares field
names with daily Strands, so both use `formatStrandsAnswer()` exported from `src/strands.mjs`.

These endpoints were recovered from minified game bundles and are undocumented; they can change
without notice.

`weaver.mjs` and `weaver-x.mjs` are near-duplicates differing only in anchor date, URL suffix, regex match index, and seed pairs — change them together.

### Browser / Xvfb in production

Puppeteer runs **headful** in both environments. In production it needs a virtual display: `startXvfb()` is called once at server start (`src/index.js`, prod only) and `launchBrowser()` awaits the stored `xvfbStartPromise` before launching, throwing if Xvfb was never started. Production launch uses `--single-process --no-sandbox` with the system Chromium at `PUPPETEER_EXECUTABLE_PATH` (`/usr/bin/chromium` in the Dockerfile). This is why Cloud Run is deployed with `--concurrency 1`.

## Environment variables

Read from a gitignored `src/.env` via `dotenv/config`:

- `REST_ENDPOINT`, `REST_USERNAME`, `REST_PASSWORD` — WordPress REST target for `post_data()`.
- `PROXY_API_KEY` — Bright Data web_unlocker1 token used by `proxyWebsite()`.
- `DISCORD_WEBHOOK` — optional; failure/short-result alerts. Silently skipped if unset.
- `NODE_ENV` — gates Xvfb, the proxy path, the GET forwarder, and the Cloud Scheduler UA check.
- `PORT` — defaults to 8080; `npm run dev` sets 8081 locally because the `tryhard-phpmyadmin`
  container occupies 8080.

## Adding a new puzzle

1. Create `src/<puzzle>.mjs` following the `Config` + `getAnswers()` contract above.
2. Add a `case` in `src/get-answers.mjs` and a matching `case` in `process_answers()` in `src/index.js`.
3. Check the puzzle number against what the site *displays*, not an `id` field in the payload.
4. If the puzzle isn't a consecutive daily integer sequence, populate `answerSchedule` (and
   `clamped` when the source caps how far ahead it publishes) — see the module contract above.
5. Confirm the returned `type` string matches what the WordPress side expects — it is the display name, and casing has been a source of bugs (see git history for `weaver-x`).
