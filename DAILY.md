# Daily Prompt — read this every morning

Today's date is whatever `date -u +%Y-%m-%d` reports. The edition number is
the previous issue's number + 1 (look at `issues/index.json`).

## Step 1 — Find six stories

Use web search. Find six stories that will make a reader genuinely
**smile** — published in the last 7 days, one from each category.
For each story, find the **exact article URL** (not a homepage or
section page). Every `url` field in `index.json` and every `href` in
`index.html` must link to the specific article, not the publication root.
Categories:

1. **Quiet Kindness** — small acts of generosity between strangers,
   neighbours helping neighbours, communities looking after their own.
   Local, human-scale, specific.
2. **Small Wonders** — a delightful nature observation, an animal doing
   something charming or clever, an unexpected restoration, a sweet
   coincidence. Wonder, not utility.
3. **Everyday Joy** — an unusual hobby, a charming tradition, an
   eccentric person's life work, a quirky place, an odd record set, a
   thing that simply exists and is lovely.
4. **Nature** — a species recovering, a habitat restored, a quiet
   conservation win, a beautiful natural phenomenon documented.
5. **Science & Medicine** — a substantive research result with concrete
   human benefit. Not hype, not press releases — published findings,
   peer-reviewed or trial-stage.
6. **Global Progress** — a country or region hitting a meaningful
   threshold: disease eliminated, milestone passed, public good delivered.
   Numbers should be real and verifiable.

**Hard no's** — do not include:
- Politics, elections, geopolitics, war, military
- Crime, accidents, disasters (even the recovery from them)
- Sports scores, league news, athlete contracts
- Stock market, economy, business news, corporate PR
- Anything contingent on someone's prior suffering
- Hard "news" of any kind — Uplift is the opposite of news

**Geographic diversity matters.** Track the last 7 issues in
`issues/index.json`. No more than **one** US story per edition. Aim for
representation across at least three continents.

Reject candidates if any of these are true:
- The story is sentimental rather than substantive
- The source is a content aggregator, not an originating publication
- It is older than 7 days
- It would belong on the front page of a newspaper

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

Search Unsplash for a thematic, calm image per story. Credit the
photographer in the byline. Image dimensions: use
`?w=1600&q=80&auto=format&fit=crop` query string.

## Step 4 — Update files

Use the checklist in `CLAUDE.md`. The structure of `index.html` is the
template — copy its current shape, replacing the six story blocks and
the dateline. Layout:

- 1 lead (largest) — pick the story with the strongest photo
- 2 large secondary
- 3 smaller "more today" cards

Also update:
- `feed.html` — `STORIES_TODAY` array near the top; replace its six entries
- `issues/index.json` — prepend the new entry using **exactly** this shape:
  ```json
  {
    "date": "YYYY-MM-DD",
    "slug": "YYYY-MM-DD",
    "edition": NNN,
    "stories": [
      {
        "cat": "Category Name",
        "place": "City, Country",
        "head": "Headline sentence ending with a period.",
        "src": "Publication Name",
        "url": "https://exact-article-url",
        "img": "https://images.unsplash.com/photo-ID?w=1600&q=80&auto=format&fit=crop"
      }
    ]
  }
  ```
  The `stories` array must have exactly 6 objects, one per category.
  Do NOT use flat `headlines`/`sources` arrays — the card renderer needs
  structured `stories` objects.
- `archive.html` — prepend six new entries to the `STORIES` array
- `issues/YYYY-MM-DD.html` — write a standalone copy of today's edition

## Step 5 — Generate IG cards (optional but preferred)

Run `node scripts/render-cards.mjs YYYY-MM-DD`. It opens
`templates/card.html` with each story's data in turn and screenshots to
`cards/YYYY-MM-DD/{1..6}.png` at 1080×1350.

## Step 6 — Commit

```
git add -A
git commit -m "Edition NNN — YYYY-MM-DD"
git push
```

GitHub Pages will rebuild within ~60s. Done.
