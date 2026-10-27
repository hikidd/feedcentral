#!/bin/bash
#
# Legacy manual wrapper for the unified FeedCentral cron job.
# Use the Cloudflare Worker for production scheduling.
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/cron-runner.sh" "$@"
