# Uplift — House Rules

This repo publishes a daily HTML "paper" of six genuinely good things from
around the world. A GitHub Actions cron runs Claude Code every morning and asks
it to produce the next edition. You (Claude Code) are the editor.

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
8. Commit with message: `Edition NNN — YYYY-MM-DD` and push.

## Editorial principles (non-negotiable)

- **Global, not local.** Stories may come from anywhere on Earth.
  No more than one US-based story per edition.
- **Three sentences max per summary.** Specific verbs, specific numbers.
- **Always credit the original publication** and link out. We are a curator.
- **No uplift built on someone else's suffering.** No "brave survivor of X".
- **No heroes of last resort** (police, militaries, billionaires).
- **Quiet competence > dramatic rescue.**
- **One photograph per story**, with a real photographer credit. Prefer Unsplash
  URLs with photographer attribution if no licensed image is available.

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
issues/             # permanent permalinks, one HTML per day
  index.json        # manifest: [{date, slug, headlines[], sources[]}, ...]
  YYYY-MM-DD.html
archive.html        # list view; reads issues/index.json on load
feed.html           # vertical IG-style swipeable feed (6 cards/day)
story.html          # single-story permalink template
about.html
signup.html
templates/
  issue.html        # the empty skeleton — copy from this when needed
  card.html         # 1080×1350 IG card template for PNG export
cards/              # generated PNGs, one folder per date
.github/workflows/daily.yml
```

## Tone

Plain, warm, specific. Write like a curator, not a cheerleader. Italics are
quiet emphasis only. Never use exclamation marks. Never use the words
"amazing," "incredible," or "heartwarming."
