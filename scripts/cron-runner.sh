#!/bin/bash
#
# FeedCentral unified RSS and cleanup cron job
# Prefer the Cloudflare Worker scheduler for production. If this script is
# used on a VM, configure only one crontab entry for it.
#
# Setup:
# 1. chmod +x scripts/cron-runner.sh
# 2. Add one entry to crontab: crontab -e
#    0 * * * * /path/to/scripts/cron-runner.sh >> /var/log/feedcentral-cron.log 2>&1
#

DOMAIN="${DOMAIN:-https://kidd.one}"
CRON_API_KEY="${CRON_API_KEY:?CRON_API_KEY must be set}"
ENDPOINT="${DOMAIN}/api/cron/run-all"

# Timestamp for logging
echo "==================================================================="
echo "FeedCentral Cron Run - $(date '+%Y-%m-%d %H:%M:%S')"
echo "==================================================================="

echo ""
echo "📡 Running unified feed fetch and cleanup..."

response=$(curl -sS -w "\nHTTP_STATUS:%{http_code}" -X POST \
    -H "Authorization: Bearer ${CRON_API_KEY}" \
    -H "Content-Type: application/json" \
    "${ENDPOINT}")

http_code=$(echo "$response" | grep HTTP_STATUS | cut -d':' -f2)
body=$(echo "$response" | sed '/HTTP_STATUS/d')

if [ "$http_code" -eq 200 ]; then
    echo "✅ Success - unified cron completed"
    echo "$body" | jq -r '.durationMs // "N/A"' | xargs -I {} echo "   Duration: {} ms"
    echo "$body" | jq -r '(.global.articlesAdded + .user.articlesAdded) // "N/A"' | xargs -I {} echo "   Articles added: {}"
else
    echo "❌ Failed - HTTP $http_code"
    echo "$body" | jq -r '.errors // .error // "Unknown error"' | xargs -I {} echo "   Error: {}"
    exit 1
fi

echo ""
echo "==================================================================="
echo "Cron run completed - $(date '+%Y-%m-%d %H:%M:%S')"
echo "==================================================================="
echo ""
