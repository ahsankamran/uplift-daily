#!/bin/bash
# Resumable backfill: send every rendered edition that has no .whatsapp-sent
# marker, in small chunks.
#
#   bash scripts/backfill-whatsapp.sh [chunk_size]
#
# Why chunks instead of one long batch: restoring a whatsapp-web.js session
# intermittently stalls after "authenticated" and never fires "ready". A single
# 45-edition batch that stalls burns its whole ~25-minute timeout and delivers
# NOTHING (observed 2026-08-29). A fresh process is the known cure for the
# stall, so chunking turns one catastrophic hang into one cheap retry.
#
# Safe to re-run and safe to interrupt: send-whatsapp-batch.mjs writes a
# .whatsapp-sent marker per confirmed delivery, and this script recomputes the
# remaining set every pass — so nothing is ever sent twice.

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO" || exit 1
CHUNK="${1:-4}"
# Deliberately slow. A backfill is never urgent, and pace is what keeps the
# session alive: 45 documents sent back-to-back once got it soft-throttled
# into limbo. 15s between sends, 30s between chunks.
export WA_GAP_MS="${WA_GAP_MS:-15000}"
CHUNK_PAUSE="${CHUNK_PAUSE:-30}"

remaining() {
  node -e '
    const fs=require("fs"), path=require("path");
    const dirs=fs.readdirSync("cards").filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    const out=dirs.filter(d=>
      fs.existsSync(path.join("cards",d,`uplift-${d}.pdf`)) &&
      !fs.existsSync(path.join("cards",d,".whatsapp-sent")));
    process.stdout.write(out.join(" "));
  ' 2>/dev/null
}

TOTAL=$(remaining | wc -w | tr -d ' ')
echo "backfill: $TOTAL edition(s) undelivered, chunk size $CHUNK, gap ${WA_GAP_MS}ms, chunk pause ${CHUNK_PAUSE}s"
[ "$TOTAL" -eq 0 ] && { echo "nothing to do"; exit 0; }

stuck=0
while :; do
  LEFT=$(remaining)
  [ -z "$LEFT" ] && { echo "all editions delivered"; break; }

  BEFORE=$(echo "$LEFT" | wc -w | tr -d ' ')
  CHUNK_DATES=$(echo "$LEFT" | tr ' ' '\n' | head -n "$CHUNK" | tr '\n' ' ')
  echo "--- sending: $CHUNK_DATES"

  node scripts/send-whatsapp-batch.mjs $CHUNK_DATES
  rc=$?

  # 7 = session died mid-backfill. Only a human can fix that; stop immediately
  # rather than grinding through every remaining chunk to the same dead end.
  if [ "$rc" -eq 7 ]; then
    echo "session needs re-linking — stopping backfill"
    bash "$REPO/scripts/alert.sh" "Backfill halted: WhatsApp needs re-linking. Run: cd $REPO && npm run relink" critical
    exit 7
  fi

  AFTER=$(remaining | wc -w | tr -d ' ')
  echo "--- chunk done (exit $rc): $BEFORE → $AFTER remaining"

  if [ "$AFTER" -ge "$BEFORE" ]; then
    stuck=$((stuck + 1))
    echo "no progress (strike $stuck/3)"
    # A stalled session leaves Chrome behind; clear it so the retry gets a
    # genuinely fresh browser rather than inheriting the stuck one.
    pkill -f 'Chrome for Testing' 2>/dev/null
    sleep 10
    if [ "$stuck" -ge 3 ]; then
      echo "three chunks with no progress — giving up with $AFTER still undelivered"
      bash "$REPO/scripts/alert.sh" "Backfill stalled with $AFTER editions undelivered — see the log." warn
      exit 1
    fi
  else
    stuck=0
    sleep "$CHUNK_PAUSE"
  fi
done

echo "backfill complete"
