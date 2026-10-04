#!/bin/bash
# Weekly WhatsApp link audit — launchd agent com.uplift.health, Fridays 9 AM PT.
#
# The daily job (render-today-local.sh) already runs the same health check every
# afternoon, so this is NOT the primary monitor. It exists because that check
# lives *inside* the daily job: if launchd unloads com.uplift.cards, or the
# script dies early, or someone edits a syntax error into it, the daily check
# disappears silently and takes the alarm with it. A monitor that shares a
# failure mode with the thing it monitors is not a monitor.
#
# This one is deliberately independent: separate agent, separate log, and it
# checks BOTH that the link is alive AND that editions are actually arriving —
# a live session that hasn't delivered in a week is still a broken pipeline.
#
# Run by hand any time:  bash scripts/weekly-health-check.sh

set -uo pipefail

REPO="/Users/keira/projects/uplift-daily"
export PATH="/Users/keira/.nvm/versions/node/v22.22.3/bin:/usr/local/bin:/usr/bin:/bin"
cd "$REPO" || exit 1

echo "===== $(date '+%Y-%m-%d %H:%M:%S %Z') — weekly health audit ====="

# Never contend with the daily job: two whatsapp-web.js clients on one session
# hang each other. If the daily run holds the lock, just skip — we run weekly,
# missing one is harmless.
LOCK="$REPO/.render.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  echo "daily job is running — skipping this week's audit"
  exit 0
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

notify() { bash "$REPO/scripts/alert.sh" "$1" "${2:-warn}" || true; }

# --- 1. is the link alive? ---------------------------------------------------
node scripts/whatsapp-health.mjs
RC=$?

# --- 2. is the paper actually arriving? --------------------------------------
# Independent of RC: the session can be perfectly healthy while nothing ships.
STALE=$(node -e '
  const fs=require("fs");
  try{
    const h=JSON.parse(fs.readFileSync("cards/.whatsapp-health.json","utf8"));
    process.stdout.write(h.lastSendOk ? String(Math.floor((Date.now()-Date.parse(h.lastSendOk))/86400000)) : "999");
  }catch(_){ process.stdout.write("999"); }
' 2>/dev/null || echo 999)

echo "link check: exit $RC | days since last delivery: $STALE"

if [ "$RC" -eq 7 ]; then
  notify "Weekly audit: WhatsApp link is DEAD (${STALE}d since last delivery). Fix: cd $REPO && npm run relink" critical
elif [ "$RC" -ne 0 ]; then
  notify "Weekly audit: link check inconclusive (exit $RC). Probably transient — see weekly-health.log."
elif [ "${STALE:-999}" -gt 3 ]; then
  # Link is fine, so this is the cloud cron or the render pipeline failing.
  notify "Weekly audit: link is healthy but nothing has been delivered in ${STALE} days — check the publishing side." critical
else
  echo "healthy — link live, last delivery ${STALE}d ago"
  rm -f "$HOME/Desktop/UPLIFT-NEEDS-ATTENTION.txt" 2>/dev/null || true
fi
echo
