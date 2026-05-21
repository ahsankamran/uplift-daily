[HANDOFF.md](https://github.com/user-attachments/files/28116582/HANDOFF.md)
# UpLift — Claude Code Handoff

Hi Claude. You're picking up an existing project from another session. This
document is the current state, the known issues, and what to do next.

## What this repo is

A daily auto-generated HTML "paper" of six genuinely good things from around
the world. A GitHub Actions cron triggers Claude Code (you) every morning at
14:00 UTC to produce the next edition: search the web for six stories meeting
the criteria in `DAILY.md`, write today's edition, snapshot yesterday's edition
into `issues/`, update the archive + feed + manifest, commit & push.

Hosted on GitHub Pages at: **https://ahsankamran.github.io/uplift-daily/**
(may have a custom domain by now — check repo Settings → Pages).

## File map

```
index.html                    # today's edition (overwritten daily)
feed.html                     # Instagram-style vertical card stack of today's 6
story.html                    # single-story permalink template
archive.html                  # browsable archive (reads issues/index.json)
about.html
signup.html
shared.css, tweaks.js         # shared styles + the tweaks panel
issues/
  index.json                  # manifest of all past editions
  YYYY-MM-DD.html             # one permanent file per day
templates/
  card.html                   # 1080×1350 IG card template
scripts/
  render-cards.mjs            # headless-Chrome script — screenshots 6 PNGs/day
cards/
  YYYY-MM-DD/                 # daily output: 1.png..6.png + caption.txt
CLAUDE.md                     # house rules — read this first every morning
DAILY.md                      # daily prompt + search criteria
.github/workflows/daily.yml   # the cron
.gitignore
```

## What's working

- The site is live on GitHub Pages.
- The cron has run successfully for several days. Editions 446 and prior exist
  in `issues/`.
- Claude Code can authenticate via Max-plan OAuth (token stored in repo Secret
  `CLAUDE_CODE_OAUTH_TOKEN`).
- The web design is solid on desktop. Five pages: index, feed, story, archive,
  about, signup — all share masthead/footer and the Tweaks panel.
- Editorial direction is fully spec'd in `CLAUDE.md` + `DAILY.md`. Six
  categories: Quiet Kindness · Small Wonders · Everyday Joy · Nature ·
  Science & Medicine · Global Progress. One story per category per day.
  No politics/crime/sports/business — strict.

## Known issues (please investigate & fix)

### 1. Mobile layout: overlapping text on phones
On phones the index page and possibly feed.html have **overlapping lines** —
content bleeding into other content. The user reported this on both browser
mobile and the rendered PDF. Likely culprits:
- Claude's daily writes may produce HTML with slightly different structure
  than the original template — class names or nesting that the existing CSS
  selectors don't grab.
- The "more today" 3-up row I added may have introduced unexpected stacking.
- `feed.html` uses `100dvh` + flex column anchored to flex-end — long
  content may overflow upward into the wordmark.

**Fix path:** open the live site on a real phone (or use Chrome DevTools
device emulation), find the specific elements overlapping, and either tighten
CSS or update the daily prompt in `DAILY.md` so future writes use a more
constrained structure.

### 2. IG card rendering is failing
`scripts/render-cards.mjs` keeps tripping over the shape of
`issues/index.json` — each daily run, Claude (you, in the workflow) writes
the manifest slightly differently. Most recent error:
`Card render failed: list is not iterable`

**Fix path options:**
- Lock the manifest shape: amend `DAILY.md` with a strict JSON schema
  example. The script expects `{ issues: [{date, number, stories: [{cat,
  place, head, src, img}]}] }`.
- OR delete the card automation entirely and have the user just screenshot
  `feed.html` on their phone (they already said that's an OK fallback).

### 3. node_modules was accidentally committed once
A bad version of the workflow's safety-net push step did `git add -A` and
committed 3,000+ node_modules files. The current workflow only commits
`cards/` so it shouldn't recur, but the historical bloat may still be in
git history. If `git log --stat` shows a giant commit, consider
`git filter-repo` to scrub it.

### 4. Source URLs from Claude's writes
The user noted that secondary-story links sometimes point to publication
homepages instead of the specific article URL. Confirm `DAILY.md` step 1
requires the *exact* article URL, and that the templates use it.

## How to test changes

Manual workflow trigger:
- Actions tab → "Daily edition" → "Run workflow"

Or to test card rendering in isolation, locally:
```
cd uplift-daily
npm install puppeteer@22
node scripts/render-cards.mjs 2026-05-21
```

## Editorial guardrails (do not regress)

Read `CLAUDE.md` and `DAILY.md` end-to-end every morning. The hard no's
list (no politics, war, crime, sports, business, etc.) is non-negotiable
— this site exists *because* mainstream news doesn't fit those criteria.

## Tone

Plain, warm, specific. No exclamation marks. Never use "amazing,"
"incredible," or "heartwarming." Italics for quoted emphasis only.

— End of handoff. Good luck.
