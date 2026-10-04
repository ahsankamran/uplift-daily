# Tier 2 — visual review

Tier 1 (`qa-edition.mjs`) only proves a URL resolves. It cannot know that
Edition 552's "Everyday Joy" card — headline about Deloraine, Tasmania,
illustrated with a Unsplash photo that reads as a Japanese cherry-blossom
tunnel — is wrong. That photo returns HTTP 200. The mismatch is a content
judgment, which needs a model actually looking at the pixels. This document
is the fixed procedure for that judgment call — run by an agent (today, by
hand; once Phase 1 is wired into `daily.yml`, by a dedicated review step
in the same job) after Tier 1 passes and the cards are rendered.

## Procedure

For each rendered feed card PNG (`cards/<date>/feed/*.png`, or a one-off
sample from `scripts/render-sample-card.mjs`), with that story's
`cat` / `place` / `head` on hand:

1. **Look at the photo alone, ignore the overlaid text first.** What does
   the image actually show — place, activity, season, built environment?
2. **Compare against the story**, specifically:
   - If `place` names a real, identifiable location (a named town, a
     specific landscape), does the photo plausibly show *that* place, or
     at least that kind of place — not just a matching mood? (A cherry
     blossom tunnel is not Tasmania. A snow-capped range with ranchland in
     the foreground is not a wilderness trail, even if it's the right
     state.)
   - If the story centers an activity (building, sawing, planting,
     rescuing), does the photo show people doing something in that
     territory, or at minimum objects/setting consistent with it — not an
     empty landscape standing in for human action?
   - **Does the photo depict the right *relationship*, not just the right
     activity?** This is the subtlest failure and the one a quick read
     misses. A story about a neighbour mowing someone's lawn unpaid is
     contradicted by a photo of a uniformed commercial crew with a
     zero-turn ride-on — same activity, opposite relationship, and the
     relationship is the whole story. Watch for: paid/professional
     signals (matching uniforms, hi-vis, company logos, commercial-grade
     equipment) on a story about volunteering or neighbourliness; an
     institutional setting on a story about an individual; a posed
     product shot on a story about ordinary life. Ask what the photo
     says about *who these people are to each other*, and check that
     against the story.
3. **Verdict per card:** `pass` (genuine match), or `fail` (theme-only /
   region-only / wrong scene) with a one-line reason naming specifically
   what's missing — not just "doesn't match."
4. **Never let a flagged weak match pass as "pass with a note."** A `fail`
   here means the story goes back to Step 3 of that edition's `DAILY.md`
   (search again, or swap the story) — see
   `MEMORY.md` → `feedback_uplift_editor_agent_quality_bar` for why this is
   a hard rule, not a preference.
5. **Judge the pixels, never the metadata.** Unsplash titles and alt text
   are frequently wrong — the commercial-crew photo that failed on
   2026-10-04 is titled "A man mowing a lawn with a lawn mower," and the
   sourcing agent passed it through by reading that title rather than
   opening the image. Download and look at the actual file before any
   verdict.

**This review is not reliably deterministic.** On 2026-10-04 two
independent passes over the same six cards disagreed: the first passed the
Moose Jaw card, the second correctly failed it on the relationship test
above. Treat a single clean pass as weaker evidence than it looks, and
when a run fails anything, re-review the *whole* set after the fix rather
than only re-checking the card that failed.

## Running it today (pre-automation)

Dispatch a read-only agent (Read access to the PNGs is enough — no Bash,
no web) with the story data and the rendered card paths, instructed to
follow the procedure above and report a verdict per card. See this
session's run against Edition 552 for a worked example: it correctly
failed card #5 (Everyday Joy / Tasmania) and passed the other five.

## Automated contract (wired into `daily.yml`)

The reviewer step is a narrow Claude Code invocation with Read access to
the rendered card PNGs and the day's story data, and Bash access to write
exactly one file: `.qa/tier2-report.json`, overwritten each run. Nothing
else. Its prompt ends with an explicit instruction to write this file in
this exact shape before finishing:

```json
{
  "date": "YYYY-MM-DD",
  "editions": {
    "combined": [
      { "n": 1, "cat": "Nature", "pass": true,  "reason": "" },
      { "n": 2, "cat": "Small Wonders", "pass": true, "reason": "" }
    ],
    "coming-together": { "pass": true, "reason": "" }
  }
}
```

`pass: false` always carries a one-line `reason` naming specifically what's
missing (region-only, theme-only, wrong scene) — never a bare `false`.

A following plain shell step reads this JSON (`node -e '...'`, no model
call) to decide what happens next — the model's job is the judgment, not
the gating logic:

- **Any `combined` entry with `pass: false`** blocks the entire push — the
  flagship product never goes live with an unreviewed photo. Job fails
  loudly, `alert.sh`-style escalation fires.
- **A new-category entry (`coming-together` / `open-hands` / `human-spirit`)
  with `pass: false`** blocks *only that edition's* commit for today — the
  combined digest and the other new categories still publish normally.
  Logged clearly, not silently dropped.
- If `.qa/tier2-report.json` is missing, malformed, or missing an edition
  that was supposed to run, treat it as `pass: false` for everything it
  should have covered — an absent verdict is not an approval.
