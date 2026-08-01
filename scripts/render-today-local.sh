#!/bin/bash
# Local daily card render — run automatically by the launchd agent
# com.uplift.cards (see ~/Library/LaunchAgents/com.uplift.cards.plist).
#
# Pulls the day's published edition, then renders photo-led IG cards for
# today's UTC date into cards/<date>/. Cards are intentionally local-only
# (cards/ is gitignored); nothing is committed or pushed.
#
# Run it by hand any time with:  bash scripts/render-today-local.sh

set -uo pipefail

REPO="/Users/keira/projects/uplift-daily"
# launchd runs with a minimal PATH, so point at the nvm node explicitly.
export PATH="/Users/keira/.nvm/versions/node/v22.22.3/bin:/usr/local/bin:/usr/bin:/bin"

cd "$REPO" || { echo "repo not found: $REPO"; exit 1; }

DATE="$(date -u +%Y-%m-%d)"
echo "===== $(date '+%Y-%m-%d %H:%M:%S %Z') — rendering cards for $DATE ====="

echo "--- git pull ---"
git pull --no-rebase origin main || echo "git pull failed (continuing with local state)"

# Idempotent guard: this job runs several times a day because the cloud cron
# (GitHub Actions) publishes at an unpredictable time. Skip if the edition
# isn't published yet, or if today's cards are already complete.
EXPECTED=$(node -e '
  const fs=require("fs");
  try{
    const d=JSON.parse(fs.readFileSync("issues/index.json"));
    const e=(Array.isArray(d)?d:d.issues||[]).find(x=>x.date===process.argv[1]);
    let n=0; if(e){ n=Array.isArray(e.stories)?e.stories.length:(e.headlines||[]).length; }
    process.stdout.write(String(n));
  }catch(_){process.stdout.write("0")}
' "$DATE")
HAVE=$(ls cards/"$DATE"/feed/*.png 2>/dev/null | wc -l | tr -d ' ')
if [ "${EXPECTED:-0}" -eq 0 ]; then
  echo "edition for $DATE not published yet — will retry on the next scheduled run"
  exit 0
fi
if [ "$HAVE" -ge "$EXPECTED" ]; then
  echo "cards already rendered ($HAVE/$EXPECTED) for $DATE — skipping card render"
else
  echo "--- render ($EXPECTED stories expected) ---"
  node scripts/render-archive-cards.mjs "$DATE"

  echo "--- result ---"
  if [ -d "cards/$DATE" ]; then
    feed=$(ls cards/"$DATE"/feed/*.png 2>/dev/null | wc -l | tr -d ' ')
    story=$(ls cards/"$DATE"/story/*.png 2>/dev/null | wc -l | tr -d ' ')
    echo "wrote $feed feed + $story story card(s) to cards/$DATE/"
  else
    echo "no cards produced for $DATE (edition may not be published yet)"
  fi
fi

# --- PDF of the edition (idempotent — just overwrites) ---
echo "--- pdf ---"
node scripts/render-pdf.mjs "$DATE"

# --- WhatsApp: send the PDF to self, once per day ---
# Gated by a marker so re-runs don't double-send. A failed/timed-out send (e.g.
# the WhatsApp session needs re-linking) leaves the marker absent, so the next
# scheduled run retries. The very first send needs a one-time interactive QR
# scan: run `node scripts/send-whatsapp.mjs` by hand once to link the device.
SENT_MARK="cards/$DATE/.whatsapp-sent"
if [ -f "$SENT_MARK" ]; then
  echo "--- whatsapp --- already sent for $DATE, skipping"
else
  echo "--- whatsapp ---"
  # Restoring the WhatsApp session occasionally stalls before "ready". A fresh
  # process clears it, so retry up to 3 times with a pause between (each attempt
  # also clears stale browser locks on its own).
  sent=0
  for attempt in 1 2 3; do
    echo "whatsapp send attempt $attempt/3"
    if node scripts/send-whatsapp.mjs "$DATE"; then
      touch "$SENT_MARK"
      echo "sent and marked $SENT_MARK"
      sent=1
      break
    fi
    echo "attempt $attempt did not complete"
    pkill -f 'Chrome for Testing' 2>/dev/null
    sleep 5
  done
  [ "$sent" -eq 0 ] && echo "whatsapp send failed after 3 attempts (will retry next scheduled run)"
fi
echo
