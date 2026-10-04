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
3. **Verdict per card:** `pass` (genuine match), or `fail` (theme-only /
   region-only / wrong scene) with a one-line reason naming specifically
   what's missing — not just "doesn't match."
4. **Never let a flagged weak match pass as "pass with a note."** A `fail`
   here means the story goes back to Step 3 of that edition's `DAILY.md`
   (search again, or swap the story) — see
   `MEMORY.md` → `feedback_uplift_editor_agent_quality_bar` for why this is
   a hard rule, not a preference.

## Running it today (pre-automation)

Dispatch a read-only agent (Read access to the PNGs is enough — no Bash,
no web) with the story data and the rendered card paths, instructed to
follow the procedure above and report a verdict per card. See this
session's run against Edition 552 for a worked example: it correctly
failed card #5 (Everyday Joy / Tasmania) and passed the other five.

## Once wired into `daily.yml` (Phase 1 automation)

Runs as a narrow Claude Code step, after `render-cards.mjs`, before the
workflow's push step. Any `fail` verdict blocks the push (same as a Tier 1
hard block) and triggers the `alert.sh`-style escalation — a half-reviewed
edition never reaches `main`.
