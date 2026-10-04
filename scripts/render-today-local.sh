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

# Surface problems on the desktop. This job is unattended, so a failure that
# only lands in render.log is a failure nobody sees — it went unnoticed for 35
# days once (a dirty tree blocked every git pull from 2026-06-28 to 08-01).
# A desktop notification on a headless Mac Mini is indistinguishable from
# silence — that is exactly how 300 consecutive WhatsApp failures went unseen.
# alert.sh fans out to iMessage (leaves the machine, lands on your phone) as
# well as the notification, and drops a Desktop file for anything critical.
notify() { bash "$REPO/scripts/alert.sh" "$1" "${2:-warn}" || true; }
fail() { echo "FATAL: $1"; notify "$1" critical; exit 1; }

# One run at a time: two WhatsApp clients on one session contend and hang.
LOCK="$REPO/.render.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  # Break a lock left behind by a crashed run (older than an hour).
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +60 2>/dev/null)" ]; then
    echo "breaking stale lock $LOCK"
    rmdir "$LOCK" 2>/dev/null && mkdir "$LOCK" 2>/dev/null || fail "could not take lock $LOCK"
  else
    echo "another run is in progress — exiting"
    exit 0
  fi
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

# --- WhatsApp session health -------------------------------------------------
# Deliberately FIRST: before the git pull, before the published-yet guard,
# before rendering. The two-month outage happened precisely because session
# health was only ever exercised as a side effect of publishing, so an
# unrelated failure upstream (a stale checkout) let the session sit idle until
# WhatsApp unlinked it at ~14 days. Connecting daily regardless of everything
# else both keeps the session warm and surfaces a dead link the same day.
echo "--- whatsapp health ---"
node scripts/whatsapp-health.mjs
HEALTH_RC=$?
# An alarm with no off-switch gets ignored, so recovery clears the Desktop
# file the critical path drops. Anything still on the Desktop is still true.
if [ "$HEALTH_RC" -eq 0 ]; then
  rm -f "$HOME/Desktop/UPLIFT-NEEDS-ATTENTION.txt" 2>/dev/null || true
fi
if [ "$HEALTH_RC" -eq 7 ]; then
  STALE_DAYS=$(node -e '
    const fs=require("fs");
    try{
      const h=JSON.parse(fs.readFileSync("cards/.whatsapp-health.json","utf8"));
      const last=h.lastSendOk||h.lastLinkOk;
      process.stdout.write(last ? String(Math.floor((Date.now()-Date.parse(last))/86400000)) : "999");
    }catch(_){ process.stdout.write("999"); }
  ' 2>/dev/null || echo 999)
  # One missed day is a warning; two or more means the daily paper has actually
  # stopped arriving, which earns the Desktop file and the louder wording.
  SEV=warn
  [ "${STALE_DAYS:-999}" -gt 1 ] && SEV=critical
  echo "whatsapp link is DEAD (nothing delivered for ${STALE_DAYS}d) — escalating"
  notify "WhatsApp link is dead — no edition delivered for ${STALE_DAYS} day(s). Fix: cd $REPO && npm run relink" "$SEV"
fi

echo "--- git pull ---"
# --autostash so uncommitted local edits can never block the sync, and a failed
# sync is now FATAL. Previously the job logged the failure, carried on against a
# stale checkout, found no edition for today, and reported "not published yet"
# — the wrong diagnosis, repeated silently for weeks.
if ! git pull --no-rebase --autostash origin main; then
  fail "git pull failed — checkout is stale, refusing to render against old state"
fi

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
  # We just synced successfully, so "absent" really does mean "not published
  # yet" — but if the manifest's newest entry is days old, the cloud cron is
  # the thing that's broken and that deserves a shout, not a silent retry.
  NEWEST=$(node -e '
    const fs=require("fs");
    try{
      const d=JSON.parse(fs.readFileSync("issues/index.json"));
      const a=(Array.isArray(d)?d:d.issues||[]).map(x=>x.date).filter(Boolean).sort();
      process.stdout.write(a[a.length-1]||"");
    }catch(_){process.stdout.write("")}
  ')
  LAG=$(( ( $(date -u +%s) - $(date -u -j -f %Y-%m-%d "${NEWEST:-1970-01-01}" +%s 2>/dev/null || echo 0) ) / 86400 ))
  if [ "$LAG" -gt 2 ]; then
    fail "no new edition since ${NEWEST:-never} (${LAG}d) — the cloud cron may be down"
  fi
  echo "edition for $DATE not published yet (newest: $NEWEST) — will retry on the next scheduled run"
  exit 0
fi
# Warn (don't block) on photos that will render as an empty well. A card with
# one blank photo still beats no card, but this must not pass unremarked.
echo "--- image check ---"
if ! node scripts/check-images.mjs "$DATE"; then
  notify "$DATE has broken photo URLs — cards will render blank. See render.log."
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
  relink=0
  for attempt in 1 2 3; do
    echo "whatsapp send attempt $attempt/3"
    node scripts/send-whatsapp.mjs "$DATE"
    rc=$?
    if [ "$rc" -eq 0 ]; then
      touch "$SENT_MARK"
      echo "sent and marked $SENT_MARK"
      sent=1
      break
    fi
    # Exit 7 = the session is gone and WhatsApp wants a QR. No number of
    # retries can fix that; only a human with the phone can. Retrying it three
    # times cost 7.5 minutes a day for two months and changed nothing.
    if [ "$rc" -eq 7 ]; then
      echo "session needs re-linking — not retrying"
      relink=1
      break
    fi
    echo "attempt $attempt did not complete (exit $rc)"
    pkill -f 'Chrome for Testing' 2>/dev/null
    sleep 5
  done
  if [ "$relink" -eq 1 ]; then
    notify "WhatsApp needs re-linking — $DATE was not delivered. Fix: cd $REPO && npm run relink" critical
  elif [ "$sent" -eq 0 ]; then
    echo "whatsapp send failed after 3 attempts (will retry next scheduled run)"
    notify "WhatsApp send failed for $DATE — will retry tomorrow. See render.log."
  fi
fi
echo
