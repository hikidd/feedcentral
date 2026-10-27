# FeedCentral Unified Cron Quick Reference

## Production scheduler

Use the Cloudflare Worker in `cloudflare/scheduler/`. It has one hourly schedule
from 08:00 to 23:00 Beijing time (`0 0-15 * * *` in UTC) and calls the unified
endpoint:

```text
POST https://kidd.one/api/cron/run-all
```

The endpoint fetches both global and user sources and performs weekly cleanup on
the first Monday run of the UTC week.

## Worker deployment

```bash
cd cloudflare/scheduler
npm install
npx wrangler login
npx wrangler secret put CRON_API_KEY
npm run deploy
```

Use the same `CRON_API_KEY` in the application environment and Worker secret.

## Manual run

```bash
curl -X POST https://kidd.one/api/cron/run-all \
  -H "Authorization: Bearer $CRON_API_KEY" \
  -H "Content-Type: application/json" | jq '.'
```

Force the weekly cleanup for verification:

```bash
curl -X POST 'https://kidd.one/api/cron/run-all?forceCleanup=true' \
  -H "Authorization: Bearer $CRON_API_KEY" \
  -H "Content-Type: application/json" | jq '.'
```

## Optional VM fallback

Only use this when the Worker is disabled. Configure one hourly entry in UTC:

```cron
0 * * * * /full/path/to/feedcentral/scripts/cron-runner.sh >> /var/log/feedcentral-cron.log 2>&1
```

Do not configure separate global-feed, user-feed, cleanup, or Vercel Cron jobs.

## Verify scheduling

```bash
crontab -l
```

For the Worker, open `/health` and confirm that exactly one `run-all` job is
reported with `https://kidd.one` as the base URL.
