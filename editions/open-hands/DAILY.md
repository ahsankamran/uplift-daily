# Daily Prompt — Open Hands edition

Standalone single-story daily edition. Today's date is whatever
`date -u +%Y-%m-%d` reports. This is independent of the main 6-category
digest — do not touch `index.html`, `feed.html`, `archive.html`, or the
root `issues/index.json`. This edition has its own manifest at
`editions/open-hands/issues/index.json`.

## Category definition

**Open Hands** — generosity that actually cost the giver something real:
time, money, comfort, or effort, given to someone or something outside
their own life. What separates this from `Quiet Kindness` in the main
digest is scale and stakes, not kindness itself — Quiet Kindness is small,
local, low-cost acts; Open Hands is generosity where the giver genuinely
gave something up.

**Good shapes:**
- Someone donating a significant asset to a cause with no personal tie.
- A company giving away a patent or technology instead of monetizing it.
- A large anonymous gift with a verifiable, concrete effect.
- Someone giving up a meaningful amount of their own time or comfort,
  sustained, not a one-off photo-op.

**Category-specific hard no:** no billionaire-as-sole-savior framing. If a
wealthy or powerful person is involved, the story needs structural
substance beyond "rich person wrote a check" — what changed because of it,
concretely, matters more than who gave it.

## Step 1 — Find one story

Use web search. Find one story published in the last 7 days that fits the
definition above. Find the exact article URL (not a homepage or section
page).

**Hard no's** (same as the main digest, `CLAUDE.md`):
- Politics, elections, geopolitics, war, military
- Crime, accidents, disasters (even recovery from them)
- Sports scores, league news, athlete contracts
- Stock market, economy, business news, corporate PR
- Anything contingent on someone's prior suffering
- Hard "news" of any kind
- No "hero of last resort" — this rules out police, militaries, and
  billionaires positioned as the sole saving grace of a story

Reject candidates if: the story is sentimental rather than substantive, the
source is a content aggregator rather than an originating publication, it's
older than 7 days, or it would belong on the front page of a newspaper.

## Step 2 — Write the summary

Three sentences, same format as the main digest:

> A clear declarative headline ending with a period.
>
> First sentence: what happened, with the specific number or location.
> Second sentence: who did it, or how it worked, with one corroborating detail.
> Third sentence: what's next, or why it matters, in plain language.

Avoid: "amazing", "incredible", "heartwarming", "uplifting", "inspires",
"reminds us that", "in a world where", "amid". No exclamation marks.
Italics for quotes only.

## Step 3 — Pick a photo

Search Unsplash for a thematic, calm image; credit the photographer.

The `img` URL MUST be the Unsplash **CDN** form:
`https://images.unsplash.com/photo-<NUMERIC>-<HEX>?w=1600&q=80&auto=format&fit=crop`
— not the short page slug, which 404s.

Before finalizing, verify the `img` URL returns HTTP 200. Then verify the
photo actually depicts the real subject or place described, not just a
matching theme or mood. If no genuinely matching photo exists on the first search, that is not a
stopping point — it's a signal to search differently. Try activity-based
terms (what the people in the story are actually doing — building,
sawing, planting, carrying) as well as place-based terms, before
concluding nothing matches. A photo of the right *region* but the wrong
*scene* (empty landscape when the story is about people doing something
specific) is not a genuine match either — this is exactly the kind of
compromise that isn't acceptable to submit as finished.

Never submit a "closest available" photo as the final answer. If, after
real effort on both place and activity searches, nothing genuinely
depicts this story, the correct move is to go back to Step 1 and find a
different qualifying story that does have a real photo available — not
to finalize this one with a weak match and a disclaimer. A flagged
compromise is still a compromise; the job isn't done until it isn't one.

## Step 4 — Self-check before calling it curated

Before this counts as done, confirm explicitly, in your own output:
1. The story clears every hard-no above, including "no hero of last resort."
2. The `url` is the exact article, verified HTTP 200.
3. The `img` is the Unsplash CDN form, verified HTTP 200, and verified to
   actually depict the subject/place (not just the theme).
4. The summary is exactly 3 sentences, follows the format, contains none
   of the banned words.

Report the result as:
```json
{
  "date": "YYYY-MM-DD",
  "cat": "Open Hands",
  "place": "City, Country",
  "head": "Headline sentence ending with a period.",
  "summary": "Full three-sentence summary.",
  "src": "Publication Name",
  "url": "https://exact-article-url",
  "img": "https://images.unsplash.com/photo-ID?w=1600&q=80&auto=format&fit=crop",
  "photographer": "Name, via Unsplash",
  "selfCheck": { "hardNo": "pass", "linkOk": true, "imageOk": true, "imageMatchesSubject": true, "formatOk": true }
}
```

## Step 5 — Write the files

Do not hand-author any HTML. Write the JSON object from Step 4 to a file
(e.g. `/tmp/open-hands-story.json`), then run:

```
node scripts/build-single-story-edition.mjs open-hands "Open Hands" /tmp/open-hands-story.json
```

This writes `editions/open-hands/index.html`,
`editions/open-hands/issues/YYYY-MM-DD.html`,
`editions/open-hands/issues/index.json`, and regenerates
`editions/open-hands/archive.html` — all from the one shared generator
(`scripts/lib/edition-page.mjs`) that every edition uses, so the HTML
stays consistent without being hand-written each day.

## Step 6 — Stop here

Do not run `git add`, `git commit`, or `git push`. The workflow stages,
QA-checks, and commits your edition itself after this step — your job
ends once the files from Step 5 are written to disk.
