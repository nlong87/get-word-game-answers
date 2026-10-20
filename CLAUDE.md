# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # node src/index.js
npm run dev        # NODE_ENV=development + node --watch
npm run deploy     # Cloud Build image -> Cloud Run (us-west1, project tryhard-word-games)
npm run deploy2    # Cloud Run deploy --source . (no separate build step)
npm run logs       # tail Cloud Run logs
npm run letroso:install-host  # register the Letroso extension's native host with Chrome (see Letroso)
```

There is no test suite, linter, or build step. Verify a scraper by running the server and hitting it:

```bash
npm run dev
curl 'http://localhost:8081/post_answers?type=wordle&amount=8'
```

In non-production the `/post_answers` route also accepts GET (see the dev-only forwarder in `src/index.js`), which makes browser testing easy. Be aware the handler **posts to the live WordPress endpoint** — to only exercise scraping, import `process_answers` from `src/process.mjs` and call it directly, or run the module's `getAnswers()` in a scratch script.

## Architecture

An Express server that scrapes/derives upcoming answers for ~25 daily word games and POSTs them to a WordPress REST endpoint (`tryhardguides/v1/add_answers`). It is invoked by Google Cloud Scheduler; in production the handler rejects requests whose User-Agent isn't `Google-Cloud-Scheduler`.

Request flow:

```
POST /post_answers?type=<puzzle>&amount=<n>[&only=<key>,...]   (src/index.js)
  -> process_answers()   (src/process.mjs) switch on puzzle type
  -> get_answers()       (src/get-answers.mjs) switch again, dispatch to the module
  -> <puzzle>.mjs        getAnswers(date_string, number_to_get)
  -> post_data()         WPAPI POST; Discord webhook alert on short/empty results
```

The two switch statements are redundant but both must be updated to add a puzzle. `get-answers.mjs` is also where a single type fans out to multiple result keys (e.g. `nerdle` produces `nerdle`, `nerdle-mini`, `nerdle-micro`, `nerdle-maxi`, and `quordle` produces `quordle`, `quordle-chill`, `quordle-extreme`) or where the key is renamed.

`only` (the route's `?only=`, the CLI's `--only`) narrows a fan-out type to the listed keys.
`gamedle` and `linkedin` take it as a third `getAnswers` argument and fetch only those keys, throwing
on an unknown one. For every other type, `process_answers` trims the result afterwards. A narrowed
route call that comes back with none of its keys and no error (the Gamedle event outside its window)
answers `200 {skipped}` rather than 503.

### Response status and retries

Sources are sometimes not live yet at the scheduled minute (parseword is the usual one), so the
route's status code is a retry signal:

- **503** — the run collected nothing, so nothing was posted. `post_data()` is skipped entirely.
  Safe to re-run, because WordPress never saw this batch.
- **503 `edge_blocked`** — something in front of WordPress refused the post (`isEdgeBlock()` in
  `src/index.js`: a `cf-mitigated` header, or a 403/429 whose body isn't WP's JSON error), so
  WordPress never saw it either. This began on 2026-10-20, when BigScoots' Cloudflare started
  serving its "Security Verification" challenge to every non-browser client. The Discord alert
  says "Cloudflare blocked…" rather than "WordPress rejected…", and the Letroso host leaves the day
  out of its ledger so the next sweep resends it. A 5xx is never treated this way, because the
  origin may already have written the batch.
- **200** — everything else, including a disabled puzzle, a short or partly blank result, and a
  WordPress rejection after a real post. Re-posting a batch WordPress has already seen is not
  safely idempotent, so these must not be retried.

Retries themselves are Cloud Scheduler's job, configured per job rather than in code: the
`Parseword`, `Scrandle`, `Batter-Up`, `LinkedIn` and six `Gamedle-<Mode>` jobs run `--max-retry-attempts=3 --min-backoff=20m
--max-backoff=20m` (Parseword's is in `npm run scheduler:parseword-retries`; the LinkedIn and Gamedle
jobs are created whole by `npm run scheduler:linkedin` and `npm run scheduler:gamedle`), giving attempts at
roughly +0, +20, +40 and +60 minutes.
Every other job still has `retryCount: 0`, so a 503 there is just a failed execution in the
scheduler's logs. Each failed attempt also sends its own Discord alert.

### Timezones and DST

Two clocks are involved, and DST affects each one differently:

- **When a job runs** comes from Cloud Scheduler. A daily job decides "today" with
  `getCurrentDayInTimezone(Config.tz)`, so when a game resets at local midnight in a zone that
  observes DST, the job sets `--time-zone` to that zone and uses a local cron. A UTC cron that lands
  just after midnight in summer lands an hour *before* it in winter, and then reposts the previous
  day. Batter-Up, Scrandle, Keyword, On-The-Record, Revealed, Parseword and LinkedIn do this; the
  timezone changes for all but Batter-Up and LinkedIn are in `npm run scheduler:dst`. Avoid 01:00-03:00 local, which DST
  skips or repeats. Poeltl instead takes "today" from the `day` field of its `/api/sync` response.
- **When a post goes live** is `scheduledDate`, read as wall-clock time in WordPress's zone,
  `America/Phoenix` (`SITE_TZ` in `helpers.mjs`), which has no DST. `convertDateForSQL` writes a fixed
  Phoenix time, which is fine for games on UTC or a fixed offset. A game that goes live at local time
  in a DST zone gives `Config.schedule` a `tz` and uses `scheduleForSite(date, Config.schedule)`,
  which converts per date (jumble, weaver, weaver-x, keyword, on-the-record, batter-up, linkedin). A multi-day
  batch still carries a single `scheduledDate`, so in the week that straddles a change, the later
  answers WordPress extrapolates are off by an hour.

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
numbers them by weekly drop from the first drop on 2026-08-26. Scrandle displays no number either
(its share text is the date), so `src/scrandle.mjs` counts days from 2025-04-01, the earliest day
its `/history` endpoint serves; it only ever publishes today, hence `clamped: true`. Batter Up
shows `#` + `game_number` from its payload (days since 2024-02-18), and `src/batter-up.mjs` posts that
number. The PHP plugin it replaced numbered one higher, so its older WordPress posts run +1 from the
site. `date_string === null` means "today in `Config.tz`"; otherwise it's an explicit ISO date used for backfills.

Dates use the Temporal polyfill via `src/helpers.mjs` (`getCurrentDayInTimezone`, `getSpecificDay`, `convertDateForSQL`, `scheduleForSite`) — not `Date`. `moment` is still a dependency but only appears in a comment.

### Answer-string delimiters

Multi-part answers are packed into single strings with sentinels the WordPress side splits on:

- `' |~~| '` separates items within a group (e.g. Connections category titles, Shuffalo words).
- `' |~~~~| '` separates the answer from extra/hint data (e.g. `answer |~~~~| hints`).

Preserve the exact spacing.

### How modules get their data (six strategies)

1. **Public JSON API** — most common (`wordle`, `connections`, `nerdle`, `contexto`, `jumble`, …) via `node-fetch`.
   `batter-up` is a variant: its CloudFront host is regexed out of the site's `assets/index-<hash>.js`
   (falling back to the known host), then `games_batterup{date}.json` lists every game through that
   date. A file that isn't up yet (it lands the evening before) or has expired returns 403, so backfills
   fall back to today's file.
   `linkedin` is another: an anonymous guest session against two undocumented LinkedIn endpoints.
   See below.
2. **Headless browser** — `searchle` uses `launchBrowser()` from `src/browser.mjs`. These typically load the site, find the hashed `main.<hash>.js` bundle, and regex the answer array out of it; some `eval`/`Function` the matched literal. `letroso.mjs` keeps a dormant one behind `DISABLED_PUZZLES`.
3. **Bright Data proxy** — `parseword`, `revealed` call `proxyWebsite(url)` from `helpers.mjs` **only when `NODE_ENV === 'production'`**, and fetch directly in development. Note `proxyWebsite` returns raw text and no status code, so a proxied module has to parse (and validate) the body itself — `parseword` does this in `getAnswerJson`, which returns parsed JSON or `null` in both environments; a day that isn't published yet answers 403 with the body `Forbidden`.
4. **Weekly index discovery** — `nyt-bonus` only. See below.
5. **Bundled static data** — files prefixed `_` are data or vendored site logic, not scrapers: `_phrazle-answers.mjs`, `_quordle-answers.mjs`, `_semantle-child-words.mjs`, `_colordle-functions.js`. Phrazle indexes into its list by day offset (wrapping around when it runs off the end).
   `_quordle-answers.mjs` holds only the site's seeded pick; `quordle.mjs` reads the word banks
   (Classic, Chill, Extreme) and the shared blacklist from the live `assets/index-<hash>.js` bundle
   each run, since Merriam-Webster edits them (a 2026-10 blacklist change altered #1719), and throws
   if it can't, rather than guess. Chill and Extreme number by days since 2024-07-29, so they share a
   number each day but not words.
6. **Your own Chrome** — `letroso` only. An extension in an everyday Chrome captures it and a native
   messaging host here posts it. See below.

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

### Gamedle (`src/gamedle.mjs`)

One `gamedle` type produces six keys (cover, artwork, characters, keywords, guess, and the Pink
Ribbon "Guess the Breast" event), merged like `nyt-bonus`. Each mode is `POST /today<Mode>Game` with
`{ daynumber }`; `daynumber` is the displayed number and a future day returns `original: null`.

- **Today's game name is hidden** (`label: null`) until the day ends; past days include it. Today's is
  resolved in order: (1) read-only catalog lookup - collection/franchise ids → names via
  `/getCollectionAndFranchises`, then `/api/autocomplete?q=<name>` and match on `value`; (2) IGDB,
  since Gamedle's game ids and image ids are IGDB's (needs `IGDB_CLIENT_ID`/`IGDB_CLIENT_SECRET`);
  (3) as a last resort, skipping all six attempts via `/giveItATry<Mode>` so the server reveals the
  name on LOSE. That records a lost game in the site's public stats, so it only runs when 1 and 2
  fail, and only for cover/artwork/keywords - Guess has no skip. Games with `collection: 0` and no
  franchises are common and always fall through to IGDB.
- **It rate limits bursts** with empty 200 bodies or dropped connections, so requests are spaced
  2.5 s apart and retried with backoff. A daily run takes ~30 s.
- The event counts days 1..36 from 2026-09-25 and its key is omitted outside that window.
- The day resets at midnight UTC-3.
- **One scheduler job per mode** (`Gamedle-Cover` ... `Gamedle-Event`, 03:01-03:11 UTC, two minutes
  apart for the burst limit), each posting `type=gamedle&only=gamedle-<mode>`. A single job can't
  retry safely: when one mode failed, the other five had already posted, so it answered 200. A
  narrowed job's 503 means its one mode collected nothing, and the scheduler retries just that.
  `npm run scheduler:gamedle` creates them and pauses the old all-modes `Gamedle` job. Delete
  `Gamedle-Event` once the event is over (after 2026-10-30); until then it answers `200 {skipped}`.
  To re-post one mode by hand: `node src/cli.mjs gamedle --amount 1 --post --only gamedle-event`.

### LinkedIn (`src/linkedin.mjs`)

One `linkedin` type produces eight keys (`linkedin-pinpoint`, `-crossclimb`, `-queens`, `-tango`,
`-zip`, `-mini-sudoku`, `-patches`, `-wend`), merged like `nyt-bonus`. Each answer is a structured
object, not a delimited string. The WordPress side has no renderer for them yet.

- **Logged-out guests get the full solution, but only for today.** Neither endpoint takes a puzzle
  id or date, so there is no backfill (any other date returns empty answers) and every key is
  `clamped`. The day resets at midnight Pacific, so the job runs at 00:10 `America/Los_Angeles`.
- **Session**: a plain `GET /games/queens/` sets `JSESSIONID` and friends. Every request sends the
  cookies back with `JSESSIONID` (unquoted) as `csrf-token`. No member account is involved; keep it
  that way, since playing on an account records the game.
- **Six games** come from the old voyager app: `GET /voyager/api/graphql?variables=(gameTypeId:N)
  &queryId=voyagerIdentityDashGames.<hash>`, reading the `.Game` entity in `included[]`. gameTypeIds:
  1 Pinpoint, 2 Crossclimb, 3 Queens, 5 Tango, 6 Zip, 7 Mini Sudoku.
- **Wend (4) and Patches (8)** are newer than that schema, so their puzzle union comes back empty
  there. They're read from the new app's router instead: `POST
  /flagship-web/games/<slug>/?skipStartScreen=true` with a `NavigateToScreen` body. That returns an
  RSC stream, and the puzzle JSON is cut out of it by brace-matching. The server answers an empty 200
  without the `x-li-anchor-page-key` and `x-li-initial-url` headers.
- The payload's `puzzleId` is the displayed "No." (checked for all eight on 2026-10-15). A served
  number that isn't today's expected one is refused, so a run before the reset never posts
  yesterday's puzzle.
- Tango's ZERO is the sun and ONE the moon. Pinpoint's `solutions[0]` is the category; the rest of
  that list is accepted variants and typos.
- The queryId hash, the RSC request shape and the app version (read from the page's `data-track`)
  were all lifted from the live site and are undocumented. Breakage surfaces as per-key alerts.

`weaver.mjs` and `weaver-x.mjs` are near-duplicates differing only in anchor date, URL suffix, regex match index, and seed pairs — change them together.

### Letroso (`extension/letroso`, `src/letroso-host.mjs`)

Letroso reads each puzzle from Firestore (`letroso-daily-en`, doc id = puzzle number = days since
2024-09-01) behind App Check, which rejects the REST API and automated browsers alike. So it isn't
scraped here: `letroso` stays in `DISABLED_PUZZLES`, and its Cloud Scheduler job is paused. Instead,
an unpacked extension in an everyday Chrome keeps today and the next `DAYS_AHEAD` (3) days posted:

- Every hour, and on install, Chrome launch, a toolbar click, or wake from sleep (an overdue alarm
  fires then), it asks the host which days in that window this `REST_ENDPOINT` hasn't been sent. It
  captures each one in a background tab at `/en/previous/<date>#tryhard-capture=<date>`, where
  `tap.js` taps the Firestore Listen stream (the AID=0 response) for the doc id and `answer`.
- The page decides "today" from the *local* clock and refuses later dates ("still to come"), but
  Firestore serves days ahead (confirmed 2026-10). So `tap.js` moves only that tab's `Date` forward to
  the target's local midnight. Posting ahead is what makes a sleeping Mac a non-issue: it only has to
  be awake with Chrome open at some point in the window. Each answer still goes live at its own
  `scheduledDate`. If Firestore ever starts refusing future days, the near days fail and it alerts.
- Each answer goes over native messaging to `src/letroso-host.mjs`, which checks the doc id against
  `buildEnvelope()`'s number and calls `post_data()`. The host's stdout is the channel back to Chrome,
  so it logs to `~/Library/Logs/tryhard-letroso.log` instead.
- WordPress isn't idempotent, so the host keeps a ledger,
  `~/Library/Application Support/tryhard-letroso/ledger.json`, keyed by `REST_ENDPOINT` host. A day is
  recorded as `sending` before it's posted, then as `posted` or `rejected`, and is never sent to that
  host again. Keying by host means a local test doesn't stop the production post.
- A failed capture is retried by the next sweep. A day further out than tomorrow failing is taken to
  be the end of what's published, and is quiet. Failing on today or tomorrow for 3 sweeps in a row
  alerts Discord through the host. The toolbar icon's tooltip and badge show the last outcome.
- To backfill a day outside the window, run `startRun({ date })` in the extension's service-worker
  console, or `node src/letroso-host.mjs --date <d> --answer <word> --post` (which checks the same
  ledger; `--force` resends).

Setup: run `npm run letroso:install-host`, then load `extension/letroso` unpacked in
chrome://extensions. The manifest's `key` pins the extension id that the host allows. The install
writes the absolute path of the current node into the host's wrapper, so re-run it after a Node
upgrade.

### Browser / Xvfb in production

Puppeteer runs **headful** in both environments. In production it needs a virtual display: `startXvfb()` is called once at server start (`src/index.js`, prod only) and `launchBrowser()` awaits the stored `xvfbStartPromise` before launching, throwing if Xvfb was never started. Production launch uses `--single-process --no-sandbox` with the system Chromium at `PUPPETEER_EXECUTABLE_PATH` (`/usr/bin/chromium` in the Dockerfile). This is why Cloud Run is deployed with `--concurrency 1`.

## Environment variables

Read from a gitignored `src/.env` via `dotenv/config`:

- `REST_ENDPOINT`, `REST_USERNAME`, `REST_PASSWORD` — WordPress REST target for `post_data()`.
- `PROXY_API_KEY` — Bright Data web_unlocker1 token used by `proxyWebsite()`.
- `DISCORD_WEBHOOK` — optional; failure/short-result alerts. Silently skipped if unset.
- `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET` — Twitch app credentials for IGDB, used by `gamedle` to
  name games its own catalog can't. Without them Gamedle falls back to losing the game.
- `NODE_ENV` — gates Xvfb, the proxy path, the GET forwarder, and the Cloud Scheduler UA check.
- `PORT` — defaults to 8080; `npm run dev` sets 8081 locally because the `tryhard-phpmyadmin`
  container occupies 8080.

## Adding a new puzzle

1. Create `src/<puzzle>.mjs` following the `Config` + `getAnswers()` contract above.
2. Add a `case` in `src/get-answers.mjs` and a matching `case` (and a `PUZZLE_TYPES` entry) in `src/process.mjs`.
3. Check the puzzle number against what the site *displays*, not an `id` field in the payload.
4. If the puzzle isn't a consecutive daily integer sequence, populate `answerSchedule` (and
   `clamped` when the source caps how far ahead it publishes) — see the module contract above.
5. If the game resets in a zone with DST, give its Cloud Scheduler job that `--time-zone` and use
   `scheduleForSite` for its `scheduledDate` — see "Timezones and DST".
6. Confirm the returned `type` string matches what the WordPress side expects — it is the display name, and casing has been a source of bugs (see git history for `weaver-x`).
