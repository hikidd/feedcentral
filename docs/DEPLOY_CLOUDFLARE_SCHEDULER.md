# Cloudflare Worker Scheduler

This project uses a standalone Cloudflare Worker to trigger one authenticated application cron endpoint.

## Location

- Worker config: `cloudflare/scheduler/wrangler.toml`
- Worker code: `cloudflare/scheduler/src/index.ts`
- Application endpoint: `app/api/cron/run-all/route.ts`

## What it calls

The Worker sends an authenticated `POST` request to:

- `/api/cron/run-all`

The unified endpoint performs these steps sequentially:

1. Fetch active global RSS sources.
2. Fetch all enabled user-provided RSS sources.
3. On the first Monday run of each UTC week, clean up expired public and user articles.

Authentication uses:

```http
Authorization: Bearer <CRON_API_KEY>
```

The app accepts the same `CRON_API_KEY` for the unified endpoint.

## Configurable values

Edit `cloudflare/scheduler/wrangler.toml`:

- `APP_BASE_URL` — production application URL (`https://kidd.one`)
- `RUN_ALL_PATH` — unified cron endpoint path
- `RUN_ALL_QUERY` — optional query string for the endpoint

The `CRON_API_KEY` is stored as a Worker secret and must match the application environment variable.

## Cron schedule

Cloudflare cron expressions are configured in UTC.

Current schedule:

- `0 0-15 * * *`
  - Runs hourly from 00:00 through 15:00 UTC.
  - Beijing time: 08:00 through 23:00.
  - Calls `/api/cron/run-all` once per hour.

The application runs weekly cleanup when the scheduled request arrives on Monday at 00:00 UTC (Monday 08:00 Beijing time). The endpoint also supports `?forceCleanup=true` for an authenticated manual verification.

## Setup

Install dependencies:

```bash
cd cloudflare/scheduler
npm install
```

Login to Cloudflare:

```bash
npx wrangler login
```

Set the cron API key secret:

```bash
npx wrangler secret put CRON_API_KEY
```

When prompted, paste the same `CRON_API_KEY` value used by the application.

## Local testing

Start local scheduled-test mode:

```bash
npx wrangler dev --test-scheduled
```

Health check:

```bash
curl http://127.0.0.1:8787/health
```

You can manually trigger scheduled events from Wrangler's scheduled-test mode UI.

## Deploy

After changing the application URL or Worker configuration, redeploy the Worker:

```bash
cd cloudflare/scheduler
npm run deploy
```

## Verification

1. Open Worker logs in Cloudflare and confirm the single scheduled job is running.
2. Open `/health` and confirm it reports one `run-all` job with `https://kidd.one` as the base URL.
3. Check application logs for:
   - `[CRON] Starting global source fetch...`
   - `[CRON] Starting user source fetch...`
   - `[CRON] Starting weekly article cleanup...` on the weekly window
4. Verify new content appears after a fetch window.
5. Verify old article cleanup runs on Monday morning Beijing time.
6. Make sure any legacy VM `crontab` entry is disabled; only this Worker should trigger automatic jobs.

## Notes

- `vercel.json` does not contain cron triggers.
- The old `/api/cron/cleanup-user-articles` endpoint is retained only for compatibility and is not called by the unified scheduler.
- If the site domain changes later, update `APP_BASE_URL`, update the application public URL environment variable, and redeploy the Worker.
