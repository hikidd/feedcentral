# FeedCentral Unified Cron Setup

FeedCentral uses one authenticated cron endpoint for this personal deployment:

```text
POST https://kidd.one/api/cron/run-all
```

The endpoint runs the following stages sequentially:

1. Fetch active global RSS sources.
2. Fetch all enabled user-provided RSS sources.
3. Run public and user article cleanup on the first Monday invocation of each UTC week.

The endpoint accepts the existing `CRON_API_KEY` bearer token:

```http
Authorization: Bearer YOUR_CRON_API_KEY
```

## Recommended production scheduler: Cloudflare Worker

The Worker configuration is in `cloudflare/scheduler/` and has one schedule:

```text
0 0-15 * * *
```

This runs hourly from 00:00 through 15:00 UTC (08:00 through 23:00 Beijing time).
The application decides when to run the weekly cleanup; no second cleanup timer is
needed.

Deploy it with:

```bash
cd cloudflare/scheduler
npm install
npx wrangler login
npx wrangler secret put CRON_API_KEY
npm run deploy
```

`CRON_API_KEY` must have the same value in the application environment and in the
Worker secret.

## Optional VM fallback

Use this only when the Cloudflare Worker is disabled. Do not run both schedulers.
Configure exactly one hourly entry, with the VM cron timezone set to UTC:

```cron
0 * * * * /full/path/to/feedcentral/scripts/cron-runner.sh >> /var/log/feedcentral-cron.log 2>&1
```

Set the API key in the VM environment:

```bash
export CRON_API_KEY="your-secret-key"
chmod 700 scripts/cron-runner.sh
```

Do not add separate entries for global feeds, user feeds, or cleanup.

## Manual testing

Run the complete job:

```bash
curl -X POST https://kidd.one/api/cron/run-all \
  -H "Authorization: Bearer YOUR_CRON_API_KEY" \
  -H "Content-Type: application/json"
```

Run the same job and force cleanup:

```bash
curl -X POST 'https://kidd.one/api/cron/run-all?forceCleanup=true' \
  -H "Authorization: Bearer YOUR_CRON_API_KEY" \
  -H "Content-Type: application/json"
```

The standalone endpoints remain available for diagnostics and compatibility:

- `/api/cron/fetch-feeds`
- `/api/cron/fetch-user-sources`
- `/api/cron/cleanup-articles`
- `/api/cron/stats`

They must not be configured as additional automatic cron jobs.

## Monitoring

Check the Cloudflare Worker logs and the application logs for:

- `[CRON] Starting global source fetch...`
- `[CRON] Starting user source fetch...`
- `[CRON] Starting weekly article cleanup...`

Check the current VM entries if a legacy server was previously used:

```bash
crontab -l
```

Remove old `fetch-feeds.sh`, `cleanup-articles.sh`, and duplicate `cron-runner.sh`
entries before enabling the Worker.

## Security notes

1. Never commit `CRON_API_KEY` to the repository.
2. Use a random key of at least 32 characters.
3. Store the key in Vercel/application environment variables and the Cloudflare
   Worker secret.
4. Rotate the key in both places together.
