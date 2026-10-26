import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Temporal } from '@js-temporal/polyfill';

/*
Which attempt of a Cloud Scheduler execution this request is.

Nothing in the request says. Cloud Run keeps no state between attempts that land 20 minutes apart,
and X-CloudScheduler-ScheduleTime is no help: the scheduler stamps each retry with a fresh schedule
time (Gamedle-Cover on 2026-10-25 logged 03:01:04 for the 503 and 03:21:11 for its retry). So ask
the scheduler itself - jobs.get for the retry policy, and the job's own AttemptFinished log entries
for how many attempts in a row have just failed. The current attempt hasn't finished, so it isn't
among them. An attempt killed by the Cloud Run timeout still logs a 504 there, which a state file
written by this process never would.

The runtime service account has roles/editor, which covers both reads. Locally the token comes from
gcloud instead, so the lookup can be exercised with a hand-set X-CloudScheduler-JobName header.

get_attempt() never throws: an alert that can't say which attempt it is still has to go out.
*/

const DEFAULT_PROJECT = 'tryhard-word-games';
const DEFAULT_LOCATION = 'us-west1';

// Extra lookback beyond the retry ladder itself, for log latency and slow attempts.
const SLACK_S = 15 * 60;
const JOB_CACHE_MS = 10 * 60 * 1000;

const isProd = process.env.NODE_ENV === 'production';
const job_cache = new Map();
let token_cache = null;

/*
{ job: null }                                                  - not a scheduler request
{ job, unknown: reason }                                       - the lookup failed
{ job, time_zone, attempt, total, first_at, next_at }          - total is 1 + retryCount; next_at is
                                                                 null on the last attempt
*/
export async function get_attempt(job_header, now = Temporal.Now.instant()) {

    const job = parse_job(job_header);

    if (!job) {
        return { job: null };
    }

    try {
        const config = await get_job(job);
        const retries = Number(config.retryConfig?.retryCount ?? 0);
        const time_zone = config.timeZone || 'Etc/UTC';

        if (retries === 0) {
            return { job: job.id, time_zone, attempt: 1, total: 1, first_at: null, next_at: null };
        }

        const policy = retry_policy(config);
        const failures = await recent_failures(job, policy, retries, now);

        // More failures in a row than the ladder allows means that chain already gave up, and
        // this is a new execution (a forced run, say) starting over.
        const failed = failures.length > retries ? 0 : failures.length;
        const attempt = failed + 1;

        return {
            job: job.id,
            time_zone,
            attempt,
            total: retries + 1,
            first_at: failed ? failures[failed - 1] : null,
            next_at: attempt <= retries ? now.add({ seconds: backoff(policy, attempt) }) : null
        };
    } catch (error) {
        console.error(`  scheduler attempt lookup failed for ${job.id}:`, error?.message ?? error);
        return { job: job.id, unknown: error?.message ?? String(error) };
    }
}

// Accepts the full resource name or a bare job id, since the header's form isn't documented.
export function parse_job(header) {

    const value = String(header ?? '').trim();

    if (!value) {
        return null;
    }

    const full = value.match(/^projects\/([^/]+)\/locations\/([^/]+)\/jobs\/([^/]+)$/);

    return full
        ? { project: full[1], location: full[2], id: full[3] }
        : { project: DEFAULT_PROJECT, location: DEFAULT_LOCATION, id: value.split('/').pop() };
}

// A timestamp as a wall clock in the job's own timezone, e.g. "10/26/26 3:21am CDT".
export function alert_time(instant, time_zone = 'Etc/UTC') {

    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', {
            timeZone: time_zone,
            year: '2-digit', month: 'numeric', day: 'numeric',
            hour: 'numeric', minute: '2-digit', hour12: true,
            timeZoneName: 'short'
        }).formatToParts(new Date(instant.epochMilliseconds)).map(part => [part.type, part.value])
    );

    return `${parts.month}/${parts.day}/${parts.year} ${parts.hour}:${parts.minute}${parts.dayPeriod.toLowerCase()} ${parts.timeZoneName}`;
}

// Today's date in the job's timezone, for an alert that has no puzzle date to show.
export function local_date(instant, time_zone = 'Etc/UTC') {
    return instant.toZonedDateTimeISO(time_zone).toPlainDate().toString();
}

// "20 mins", "1 hour" - WordPress's human_time_diff(), which the crossword alerts use.
export function human_time_diff(from, to) {

    const minutes = Math.max(1, Math.round(Math.abs(to.epochMilliseconds - from.epochMilliseconds) / 60000));

    if (minutes < 60) {
        return `${minutes} min${minutes === 1 ? '' : 's'}`;
    }

    const hours = Math.round(minutes / 60);

    return `${hours} hour${hours === 1 ? '' : 's'}`;
}

async function get_job(job) {

    const key = `${job.project}/${job.location}/${job.id}`;
    const cached = job_cache.get(key);

    if (cached && cached.expires > Date.now()) {
        return cached.config;
    }

    const config = await google_api(
        `https://cloudscheduler.googleapis.com/v1/projects/${job.project}/locations/${job.location}/jobs/${encodeURIComponent(job.id)}`
    );

    job_cache.set(key, { config, expires: Date.now() + JOB_CACHE_MS });

    return config;
}

// End times of the failed attempts immediately before this one, newest first.
async function recent_failures(job, policy, retries, now) {

    let window_s = SLACK_S + (retries + 1) * policy.deadline;

    for (let retry = 1; retry <= retries; retry++) {
        window_s += backoff(policy, retry);
    }

    const since = now.subtract({ seconds: Math.ceil(window_s) });

    const { entries = [] } = await google_api('https://logging.googleapis.com/v2/entries:list', {
        resourceNames: [`projects/${job.project}`],
        filter: [
            'resource.type="cloud_scheduler_job"',
            `resource.labels.job_id="${job.id}"`,
            `resource.labels.location="${job.location}"`,
            'jsonPayload."@type"="type.googleapis.com/google.cloud.scheduler.logging.AttemptFinished"',
            `timestamp>="${since.toString()}"`,
            `timestamp<="${now.toString()}"`
        ].join(' AND '),
        orderBy: 'timestamp desc',
        pageSize: retries + 2
    });

    const failures = [];

    for (const entry of entries) {
        const status = Number(entry.httpRequest?.status ?? 0);

        // A deadline exceeded logs a jsonPayload.status and no HTTP status at all.
        if (!entry.jsonPayload?.status && status >= 200 && status < 300) {
            break;
        }

        failures.push(Temporal.Instant.from(entry.timestamp));
    }

    return failures;
}

function retry_policy(config) {

    const seconds = (duration, fallback) => duration ? parseFloat(duration) : fallback;
    const retry = config.retryConfig ?? {};

    return {
        min: seconds(retry.minBackoffDuration, 5),
        max: seconds(retry.maxBackoffDuration, 3600),
        doublings: Number(retry.maxDoublings ?? 5),
        deadline: seconds(config.attemptDeadline, 180)
    };
}

/*
Seconds before retry n (1-based), per Cloud Scheduler's RetryConfig: the interval starts at
minBackoffDuration, doubles maxDoublings times, then grows linearly, never above maxBackoffDuration.
The jobs here all pin min = max = 20m.
*/
function backoff(policy, n) {

    const interval = n - 1 <= policy.doublings
        ? policy.min * 2 ** (n - 1)
        : policy.min * 2 ** policy.doublings * (n - policy.doublings);

    return Math.min(interval, policy.max);
}

async function google_api(url, body = null) {

    const response = await fetch(url, {
        method: body ? 'POST' : 'GET',
        headers: {
            Authorization: `Bearer ${await access_token()}`,
            ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        let detail = text.slice(0, 200);

        try {
            detail = JSON.parse(text).error?.message ?? detail;
        } catch {}

        throw new Error(`${new URL(url).host} answered ${response.status}: ${detail}`);
    }

    return await response.json();
}

async function access_token() {

    if (token_cache && token_cache.expires > Date.now()) {
        return token_cache.token;
    }

    if (isProd) {
        const response = await fetch(
            'http://metadata.google.internal/computeMetadata/v1/instance/service-account/token',
            { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(5000) }
        );

        if (!response.ok) {
            throw new Error(`metadata server answered ${response.status}`);
        }

        const { access_token: token, expires_in } = await response.json();
        token_cache = { token, expires: Date.now() + (expires_in - 60) * 1000 };
    } else {
        const { stdout } = await promisify(execFile)('gcloud', ['auth', 'print-access-token']);
        token_cache = { token: stdout.trim(), expires: Date.now() + 5 * 60 * 1000 };
    }

    return token_cache.token;
}
