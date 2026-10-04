# Uplift — House Rules

This repo publishes a daily HTML "paper" of six genuinely good things from
around the world. A GitHub Actions cron runs Claude Code every morning and asks
it to produce the next edition. You (Claude Code) are the editor.

> The cloud workflow runs Node 20; the local automation (see below) runs Node 22.

## What you do, every day

0. **Sync first.** Run `git pull --no-rebase origin main` before doing anything. This repo is published by a daily cron, so the remote is usually ahead of local — pushing without pulling first will be rejected with "fetch first."
1. Read **DAILY.md** for the daily prompt + search strategy.
2. Find six stories using web search (criteria in DAILY.md) — one from each
   of the six categories.
3. Snapshot the current homepage into the archive:
   `cp index.html issues/$(date -u +%Y-%m-%d).html` (use UTC).
4. Update `index.html` with today's edition:
   - new dateline (today's date, issue no = previous + 1)
   - new lead story (one big, photo-led)
   - two large secondary stories
   - three smaller "more today" stories
   - move yesterday's lead+secondaries into the "Yesterday" row
5. Append a new entry to `issues/index.json` with date, headlines, sources, slugs.
6. Update `feed.html`'s `STORIES_TODAY` array with the six new stories.
7. Update `archive.html`'s `STORIES` array with today's six.
8. Commit with message: `Edition NNN — YYYY-MM-DD`. **Do not push** — the
   cloud workflow verifies and QA-checks the edition, then pushes it itself
   (see `daily.yml`). This changed after a 2026-10-01–03 incident where the
   step reported clean success without ever writing a new edition; see
   `scripts/qa-edition.mjs` and `scripts/qa-visual-review.md`.

## Editorial principles (non-negotiable)

- **Global, not local.** Stories may come from anywhere on Earth.
  No more than one US-based story per edition.
- **Three sentences max per summary.** Specific verbs, specific numbers.
- **Always credit the original publication** and link out. We are a curator.
- **No uplift built on someone else's suffering.** No "brave survivor of X".
- **No heroes of last resort** (police, militaries, billionaires).
- **Quiet competence > dramatic rescue.**
- **One photograph per story**, with a real photographer credit. Prefer Unsplash
  URLs with photographer attribution if no licensed image is available. The image
  URL must be the Unsplash **CDN** form
  `https://images.unsplash.com/photo-<digits>-<hex>?w=1600&q=80&auto=format&fit=crop`
  — never the short page slug (`unsplash.com/photos/<slug>`), which 404s and
  renders a blank card. Verify each returns HTTP 200. (See DAILY.md Step 3.)

## Categories (pick one of each, every day)

`Quiet Kindness` · `Small Wonders` · `Everyday Joy` ·
`Nature` · `Science & Medicine` · `Global Progress`

Each edition is exactly one story from each of the six categories.
**Hard no's**: politics, war, crime, sports, business/markets, anything
contingent on prior suffering. Uplift is the opposite of news — pick
things that simply make a reader smile or feel quietly hopeful.

## Files & where things live

```
index.html          # today's edition (you overwrite this daily)
shared.css          # shared styles
tweaks.js           # client-side palette/layout tweaks panel
issues/             # permanent permalinks, one HTML per day (committed)
  index.json        # manifest; entries may be flat {date,slug,headlines[],sources[]}
                    #   or structured {date,number,stories:[{cat,place,head,src,img}]}
  YYYY-MM-DD.html
archive.html        # list view; reads issues/index.json on load
feed.html           # vertical IG-style swipeable feed (6 cards/day)
story.html          # single-story permalink template
about.html
signup.html
DAILY.md            # the daily editorial prompt + search strategy
templates/
  card.html         # 1080×1350 IG card template for PNG export
cards/              # generated cards + PDFs, one folder per date — GITIGNORED, local-only
.github/workflows/daily.yml   # the cloud cron that runs you
```

## Local automation (runs on the mac mini — NOT part of the cloud cron)

A launchd agent (`com.uplift.cards`, 2 PM PT) runs `scripts/render-today-local.sh`,
which after the cloud edition is published: renders photo-led cards, builds a PDF,
and sends it to a personal WhatsApp group. None of this is committed — `cards/` and
the WhatsApp session are gitignored.

- `scripts/render-cards.mjs`         — text-led cards from the manifest (run by daily.yml; output gitignored)
- `scripts/render-archive-cards.mjs` — photo-led cards from issue HTML → cards/<date>/{feed,story}/
- `scripts/render-pdf.mjs`           — stitches feed cards → cards/<date>/uplift-<date>.pdf
- `scripts/send-whatsapp.mjs`        — sends the daily PDF (target in whatsapp-target.json)
- `scripts/send-whatsapp-batch.mjs`  — backfill sender for past editions
- `scripts/render-today-local.sh`    — the launchd entrypoint tying these together
- `scripts/whatsapp-health.mjs`      — daily session heartbeat; runs first, independent of publishing
- `scripts/relink-whatsapp.mjs`      — `npm run relink`: QR as a scannable PNG when the link dies
- `scripts/alert.sh`                 — failure escalation off the machine (iMessage; target in alert-target.json)
- `scripts/backfill-whatsapp.sh`     — resumable chunked send of every rendered edition lacking a marker
- `scripts/weekly-health-check.sh`   — Friday audit (launchd `com.uplift.health`, 9 AM PT), independent of the daily job

If the daily PDF stops arriving, the link has almost certainly expired —
WhatsApp drops linked devices idle for ~14 days. Run `npm run relink`, scan
the PNG that opens in Preview, then `npm run health` to confirm. Anything
missed while it was down: `bash scripts/backfill-whatsapp.sh`.

Two launchd agents now: `com.uplift.cards` (2 PM daily — publish, render, send,
and a link health check that runs *first*, so session health no longer depends
on an edition existing) and `com.uplift.health` (Fridays 9 AM — an independent
audit that survives the daily job breaking, and also alerts when the link is
healthy but nothing has been delivered in days). Both escalate via `alert.sh`.

**Delivery state lives in two places and they must agree:** a per-edition
`cards/<date>/.whatsapp-sent` marker, and `cards/.whatsapp-health.json`
(`lastSendOk`). Every sender writes both. A sender that delivers without
writing a marker makes delivered editions look undelivered forever — that is
exactly how a 2026-06-12 backfill of 32 editions nearly got re-sent as
duplicates on 2026-08-29.

The cloud editor (you, in CI) does **not** need to run any of these.

## Tone

Plain, warm, specific. Write like a curator, not a cheerleader. Italics are
quiet emphasis only. Never use exclamation marks. Never use the words
"amazing," "incredible," or "heartwarming."
