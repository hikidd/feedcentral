#!/bin/bash
#
# Legacy wrapper for the unified FeedCentral cron job.
# Use cloudflare/scheduler for production automatic scheduling.
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/cron-runner.sh" "$@"
