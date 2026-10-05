#!/bin/bash
# Reach a human about an unattended failure.
#
#   bash scripts/alert.sh "message" [severity]
#
# severity: warn (default) | critical
#
# This machine is a headless Mac Mini, so `display notification` — the only
# alarm this pipeline had — is effectively /dev/null: the WhatsApp session died
# on 2026-06-27 and failed 300 times before anyone noticed. Alerts must leave
# the machine.
#
# Primary channel is iMessage to your own number, which lands on the phone you
# carry and needs no accounts or tokens. Deliberately NOT WhatsApp: the thing
# most likely to be broken is WhatsApp, and an alarm that shares a failure mode
# with the thing it monitors is not an alarm.
#
# Set the destination in scripts/alert-target.json (gitignored — this repo is
# public):  { "imessage": "+15551234567" }
#
# Every channel is best-effort and independent: iMessage failing must not stop
# the desktop notification, and neither may ever fail the calling job.

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MSG="${1:-Uplift: unspecified failure}"
SEVERITY="${2:-warn}"
CFG="$REPO/scripts/alert-target.json"

TAG="Uplift"
[ "$SEVERITY" = "critical" ] && TAG="Uplift — ACTION NEEDED"

# --- channel 1: iMessage to self ---------------------------------------------
HANDLE=""
if [ -f "$CFG" ]; then
  HANDLE=$(node -e '
    const fs=require("fs");
    try{ process.stdout.write(String(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).imessage||"")); }
    catch(_){ process.stdout.write(""); }
  ' "$CFG" 2>/dev/null)
fi

if [ -n "$HANDLE" ] && [[ "$HANDLE" != *"REPLACE"* ]]; then
  # `participant` resolves a raw phone number or Apple ID without requiring the
  # contact to exist in Contacts.
  if osascript <<APPLESCRIPT >/dev/null 2>&1
tell application "Messages"
  set svc to 1st account whose service type = iMessage
  set who to participant "$HANDLE" of svc
  send "$TAG: $MSG" to who
end tell
APPLESCRIPT
  then
    echo "alert: iMessage sent to $HANDLE"
  else
    echo "alert: iMessage FAILED (is Messages signed in? does Terminal have Automation permission for Messages in System Settings → Privacy & Security → Automation?)"
  fi
else
  echo "alert: no iMessage handle configured — set \"imessage\" in scripts/alert-target.json"
fi

# --- channel 1b: Jarvis app push (as Rocket) ----------------------------------
# The channel that actually reaches the phone from a launchd job. iMessage via
# osascript needs an Automation grant that macOS never prompts a background
# bash process for, so channel 1 fails silently under launchd (found 2026-10-04).
# Lives outside this repo (~/projects/prism/jarvis/app); skipped if absent.
JARVIS_PY="$HOME/projects/prism/venv/bin/python3"
JARVIS_APP="$HOME/projects/prism/jarvis/app"
if [ -x "$JARVIS_PY" ] && [ -f "$JARVIS_APP/push.py" ]; then
  N=$(cd "$JARVIS_APP" && "$JARVIS_PY" -c \
      'import sys, push; print(push.send_push("Rocket", sys.argv[1], persona="rocket"))' "$TAG: $MSG" 2>/dev/null)
  echo "alert: Jarvis app push to ${N:-0} device(s)"
fi

# --- channel 2: desktop notification (free, sometimes seen) ------------------
osascript -e "display notification \"$MSG\" with title \"$TAG\"" >/dev/null 2>&1 || true

# --- channel 3: a file you cannot miss, for anything critical ----------------
# Survives reboots and sitting unread, unlike a notification banner.
if [ "$SEVERITY" = "critical" ]; then
  {
    echo "$TAG"
    echo
    echo "$MSG"
    echo
    echo "Raised: $(date '+%Y-%m-%d %H:%M:%S %Z')"
    echo "Log:    $REPO/cards/render.log"
  } > "$HOME/Desktop/UPLIFT-NEEDS-ATTENTION.txt" 2>/dev/null || true
fi

exit 0
