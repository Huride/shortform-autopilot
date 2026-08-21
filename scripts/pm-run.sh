#!/bin/zsh
# Optional second daily slot (afternoon/evening edition).
#
# Two-phase pattern: the scheduler calls this script twice —
#   1) generate+build an hour before the slot (news window = the day so far)
#   2) publish at the slot (with publishAt the upload itself is scheduled, so
#      phase 2 just flushes the queue)
# The phase is decided by wall-clock hour, so a single script serves both cron
# entries. Configure via env:
#   PM_CHANNEL     channel id            (default: example)
#   PM_PUBLISH_AT  local publish time    (default: 19:05)
#   PM_MIN_SCORE   skip the slot if the day's best topic scores below this
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd "$(dirname "$0")/.."

CHANNEL="${PM_CHANNEL:-example}"
PUBLISH_AT="${PM_PUBLISH_AT:-19:05}"
MIN_SCORE="${PM_MIN_SCORE:-75}"
PUBLISH_HOUR="${PUBLISH_AT%%:*}"

LOG="logs/pm-$(date +%Y%m%d).log"
mkdir -p logs
HOUR=$(date +%H)

{
  echo "===== $(date '+%F %T') pm slot start (HOUR=$HOUR) ====="
  if [ "$HOUR" -lt "$PUBLISH_HOUR" ]; then
    # Generation pass: use only today's window so the evening edition doesn't
    # repeat the morning's topic. Guardrail: below MIN_SCORE, skip the slot —
    # a weak evening video costs more (channel-level watch-time signals) than
    # publishing nothing.
    npx tsx src/cli.ts daily --channel "$CHANNEL" --hours 12 --min-score "$MIN_SCORE" \
      --at "$(date +%Y-%m-%d)T${PUBLISH_AT}:00$(date +%z | sed 's/\(..\)$/:\1/')"
    npx tsx src/cli.ts build
  else
    npx tsx src/cli.ts publish
  fi
  echo "===== $(date '+%F %T') done ====="
} >> "$LOG" 2>&1
