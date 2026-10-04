# Daily Prompt — Coming Together edition

Standalone single-story daily edition. Today's date is whatever
`date -u +%Y-%m-%d` reports. This is independent of the main 6-category
digest — do not touch `index.html`, `feed.html`, `archive.html`, or the
root `issues/index.json`. This edition has its own manifest at
`editions/coming-together/issues/index.json`.

## Category definition

**Coming Together** — a community, a crowd of strangers, or two previously
disconnected groups rallying around someone or something, at real
verifiable scale. Collective action, not one person's gesture (that's
`Quiet Kindness` in the main digest) and not an institutional/government
milestone (that's `Global Progress`). The story needs a specific number
that proves scale — people involved, amount raised, days it took — not
just "the community pulled together."

**Good shapes:**
- A town showing up for a family who lost their home.
- A crowdfund that hit its goal and saved a local business.
- Neighbors rebuilding a shared public space together.
- A cross-group or cross-border collaboration producing something concrete.

**Category-specific hard no:** if a loss or disaster is what prompted the
coming-together, state it in one plain clause and move straight to the
collective response. Never dwell on the suffering — the scale of the
response is the news, not the setup.

## Step 1 — Find one story

Use web search. Find one story published in the last 7 days that fits the
definition above. Find the exact article URL (not a homepage or section
page).

**Hard no's** (same as the main digest, `CLAUDE.md`):
- Politics, elections, geopolitics, war, military
- Crime, accidents, disasters (even recovery from them, beyond one clause)
- Sports scores, league news, athlete contracts
- Stock market, economy, business news, corporate PR
- Anything contingent on someone's prior suffering
- Hard "news" of any kind

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
matching theme or mood — a cherry-blossom photo for a story set in
Tasmania is a fail even if it returns 200.

If no genuinely matching photo exists on the first search, that is not a
stopping point — it's a signal to search differently. Try activity-based
terms (what the people in the story are actually doing — building,
rebuilding, gathering, carrying) as well as place-based terms, before
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
1. The story clears every hard-no above.
2. The `url` is the exact article, verified HTTP 200.
3. The `img` is the Unsplash CDN form, verified HTTP 200, and verified to
   actually depict the subject/place (not just the theme).
4. The summary is exactly 3 sentences, follows the format, contains none
   of the banned words.

Report the result as:
```json
{
  "date": "YYYY-MM-DD",
  "cat": "Coming Together",
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

## Step 5 — Update files (once wired into daily automation — not yet)

Append to `editions/coming-together/issues/index.json`, write
`editions/coming-together/issues/YYYY-MM-DD.html`, regenerate
`editions/coming-together/feed.html` and `archive.html`, render the card
via `templates/card.html`. This step is not active yet — see the main repo
plan for the automation rollout.
