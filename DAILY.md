# Daily Prompt — read this every morning

Today's date is whatever `date -u +%Y-%m-%d` reports. The edition number is
the previous issue's number + 1 (look at `issues/index.json`).

## Step 1 — Find three stories

Use web search. Look for reporting published in the **last 72 hours** about:

1. **One Nature or Environment story** — restorations, species recoveries,
   conservation wins, climate progress at municipal or national scale.
2. **One Science / Medicine / Innovation story** — peer-reviewed work,
   clinical milestones, accessible technology.
3. **One Community / Human Achievement / Global Progress story** — measurable
   local improvements anywhere on Earth, education wins, housing-first
   programmes, public-health milestones.

**Geographic diversity matters.** Track the last 7 issues in
`issues/index.json`. If five of the past seven leads are from the same
continent, pick from elsewhere.

Reject candidates if any of these are true:
- The uplift depends on a prior catastrophe or someone's suffering
- The story is corporate PR with no independent reporting
- It is sentimental rather than substantive
- The source is a content aggregator, not an originating publication
- It is older than 7 days

## Step 2 — Write the summaries

Three sentences each. Format:

> A clear declarative headline ending with a period.
>
> First sentence: what happened, with the specific number or location.
> Second sentence: who did it, or how it worked, with one corroborating detail.
> Third sentence: what's next, or why it matters, in plain language.

Avoid: "amazing", "incredible", "heartwarming", "uplifting", "inspires",
"reminds us that", "in a world where", "amid". Italics for quotes only.

## Step 3 — Pick photos

Search Unsplash for a thematic, calm image. Credit the photographer in the
byline. Image dimensions: use `?w=1600&q=80&auto=format&fit=crop` query string.

## Step 4 — Update files

Use the checklist in `CLAUDE.md`. The structure of `index.html` is the
template — copy its current shape, replacing the three story blocks and
the dateline.

Also update:
- `feed.html` — there's a `STORIES_TODAY` array near the top; replace its
  three entries
- `issues/index.json` — prepend the new entry
- `archive.html` — prepend three new entries to the `STORIES` array
- `issues/YYYY-MM-DD.html` — write a standalone copy of today's edition

## Step 5 — Generate IG cards (optional but preferred)

Run `node scripts/render-cards.mjs YYYY-MM-DD`. It opens
`templates/card.html` with each story's data in turn and screenshots to
`cards/YYYY-MM-DD/{1,2,3}.png` at 1080×1350.

## Step 6 — Commit

```
git add -A
git commit -m "Edition NNN — YYYY-MM-DD"
git push
```

GitHub Pages will rebuild within ~60s. Done.
