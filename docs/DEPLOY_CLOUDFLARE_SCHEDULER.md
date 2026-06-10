# Cloudflare Worker Scheduler

This project uses a standalone Cloudflare Worker to trigger the existing application cron endpoints.

## Location

- Worker config: `cloudflare/scheduler/wrangler.toml`
- Worker code: `cloudflare/scheduler/src/index.ts`

## What it calls

The Worker sends authenticated `POST` requests to:

- `/api/cron/fetch-feeds`
- `/api/cron/fetch-user-sources`
- `/api/cron/cleanup-articles`

Authentication uses:

```http
Authorization: Bearer <CRON_API_KEY>
```

The app already accepts `CRON_API_KEY` for these routes.

## Configurable values

Edit `cloudflare/scheduler/wrangler.toml`:

- `APP_BASE_URL` — defaults to `https://kidd.cc.cd`
- `FETCH_FEEDS_PATH`
- `FETCH_USER_SOURCES_PATH`
- `CLEANUP_ARTICLES_PATH`
- `FETCH_FEEDS_QUERY`
- `FETCH_USER_SOURCES_QUERY`
- `CLEANUP_ARTICLES_QUERY`

## Cron schedule

Cloudflare cron expressions are configured in UTC.

Current schedules:

- `0 0-10 * * *`
  - Beijing time: hourly from 08:00 to 18:00
  - Calls `/api/cron/fetch-feeds`
- `7 0-10 * * *`
  - Beijing time: hourly from 08:07 to 18:07
  - Calls `/api/cron/fetch-user-sources`
- `55 15 * * 1`
  - Beijing time: 23:55 every Monday
  - Calls `/api/cron/cleanup-articles`

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

When prompted, paste the same `CRON_API_KEY` value used by the app.

## Local testing

Start local scheduled-test mode:

```bash
npx wrangler dev --test-scheduled
```

Health check:

```bash
curl http://127.0.0.1:8787/health
```

You can manually trigger scheduled events from Wrangler's scheduled-test mode UI or local endpoint.

## Deploy

```bash
cd cloudflare/scheduler
npm run deploy
```

## Verification

1. Open Worker logs in Cloudflare and confirm scheduled runs are happening.
2. Check the app logs for:
   - `[CRON] Starting RSS feed fetch...`
   - `[USER CRON] Starting user sources fetch...`
   - `[CLEANUP] Starting article cleanup...`
3. Verify new content appears after the fetch windows.
4. Verify old article cleanup still runs daily.

## Notes

- The app's `vercel.json` no longer contains cron triggers.
- This avoids Vercel Hobby cron deployment limits.
- If you change the site domain later, update `APP_BASE_URL` and redeploy the Worker.
