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

**Do not search for a "thematic" image.** That instruction used to be here
and it is what broke this step for a month: every edition from 2026-10-05
to 10-31 was rejected at visual review for photos that matched a theme but
not the story — an Alpine peak for a river in Cumbria, a tropical reef for
southern Australia, a Vietnamese outdoor gym for an English retirement
village, baby shoes for a school custodian. Mood matching fails. Find a
photo of the actual thing.

The `img` URL MUST be a Unsplash **CDN** URL of the exact form:
`https://images.unsplash.com/photo-<NUMERIC>-<HEX>?w=1600&q=80&auto=format&fit=crop`
e.g. `https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1600&q=80&auto=format&fit=crop`

- The id is the long `photo-<digits>-<hash>` string found in the image's real
  `src` on the photo page — **NOT** the short slug in the page URL
  (`unsplash.com/photos/<slug>`). A slug-based URL like
  `images.unsplash.com/photo-nTF7sqg1vJo` returns 404 and the card renders blank.
- Verify each `img` returns HTTP 200; if not, pick another photo.

### You must LOOK at every photo before accepting it

HTTP 200 only proves a file exists. Unsplash titles and alt text are
routinely wrong — the photo that failed review on 2026-10-04 is titled
"A man mowing a lawn with a lawn mower" and actually shows a two-man
commercial crew on a ride-on mower. **Judging a photo by its metadata is
how every one of these failures happened.** So, for each story:

```
curl -sL "<cdn-url>" -o /tmp/check.jpg
```

then open `/tmp/check.jpg` with the Read tool and look at it. Then ask:

1. **Subject** — does the image show the actual thing the headline is
   about? A story about seahorses needs a seahorse, not a reef.
2. **Place** — if the story names a real location, is this plausibly
   *that* place? Cumbria is not the Alps. Southern Australia is not the
   Red Sea. England is not Vietnam. Check signage, vegetation, architecture
   and climate for contradictions.
3. **Relationship** — if people appear, are they the right people to each
   other? A uniformed commercial crew contradicts a story about an unpaid
   neighbour, even though both are "someone mowing a lawn".

A photo that fails any of these is rejected, not noted. Search again with
different terms — try the specific subject and the specific activity, not
just the mood. If after real effort nothing genuinely depicts the story,
**pick a different story**; do not finalize a weak match with a caveat.

An honest generic image is acceptable where the story has no visual
specifics — fresh vegetables for a dietary-trial story, lab bench work for
a diagnostics story — *provided it does not imply a place or relationship
that isn't true*. "Generic but honest" passes. "Evocative but wrong" does
not.

Every photo you accept will be independently reviewed twice before the
edition can publish, and either reviewer rejecting a single card blocks the
whole edition. Checking now costs you one `curl` and one look.

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

## Step 6 — Commit (do not push)

```
git add index.html feed.html archive.html issues/index.json issues/YYYY-MM-DD.html
git commit -m "Edition NNN — YYYY-MM-DD"
```

Do not run `git push`. The workflow verifies, QA-checks, and pushes your
commit itself in a later step — it may also add more commits on top
(derived category editions) before the final push. Scope `git add` to
exactly these five paths, not `-A` — other steps in the same workflow run
write to other parts of the tree (`editions/`) and must not get swept into
this commit.
