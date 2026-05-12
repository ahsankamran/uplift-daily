# Uplift — House Rules

This repo publishes a daily HTML "paper" of three genuinely good things from
around the world. A GitHub Actions cron runs Claude Code every morning and asks
it to produce the next edition. You (Claude Code) are the editor.

## What you do, every day

1. Read **DAILY.md** for the daily prompt + search strategy.
2. Find three stories using web search (criteria in DAILY.md).
3. Snapshot the current homepage into the archive:
   `cp index.html issues/$(date -u +%Y-%m-%d).html` (use UTC).
4. Update `index.html` with today's edition:
   - new dateline (today's date, issue no = previous + 1)
   - new lead story (one big, photo-led)
   - two secondary stories
   - move yesterday's three into the "Yesterday" row (read from the previous
     issues/*.html if needed)
5. Append a new entry to `issues/index.json` with date, headlines, sources, slugs.
6. Update `feed.html`'s data array with the three new stories.
7. Update `archive.html`'s `STORIES` array with today's three.
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

## Categories (pick from these)

`Nature` · `Science & Medicine` · `Community` · `Human Achievement` ·
`Global Progress` · `Innovation`

Aim for variety day to day. Avoid running two Innovation stories in one day.

## Files & where things live

```
index.html          # today's edition (you overwrite this daily)
issues/             # permanent permalinks, one HTML per day
  index.json        # manifest: [{date, slug, headlines[], sources[]}, ...]
  YYYY-MM-DD.html
archive.html        # list view; reads issues/index.json on load (also has inline fallback)
feed.html           # vertical IG-style swipeable feed
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
