// Decide what today's QA verdicts mean for publication.
//
//   node scripts/evaluate-qa.mjs
//
// Reads  .qa/tier2-report.json (written by merge-tier2.mjs) and
//        .qa/tier1-<slug>.status
// Writes .qa/final-<slug>.status  ("pass" | "fail") for the 3 new editions
//
// Exit 0 = publish the combined digest
// Exit 1 = do not publish
//
// THE DISTINCTION THIS SCRIPT EXISTS TO MAKE
// A reviewer saying "this photo is wrong" and a reviewer failing to
// produce a usable answer are different events with different correct
// responses, and the first version of this conflated them. It blocked on
// `combined.length < 6`, which fires both when a photo genuinely fails
// and when the reviewer simply didn't cover six cards. The result: every
// edition from 2026-10-05 to 2026-10-31 was researched, written, QA'd and
// then silently discarded — 26 days of nothing published, over an output
// formatting mismatch.
//
// So:
//   * a genuine pass:false verdict BLOCKS. That is the gate working.
//   * a coverage gap (the reviewer didn't report on some cards) WARNS and
//     publishes. Tier 1 has already verified every link and image resolves;
//     Tier 2 is an additional quality check, and losing the publication
//     entirely is a worse outcome than shipping a day whose photos got
//     only partial review. It is loud, not silent.
//
// FORCE_PUBLISH=1 overrides a genuine block, for manual recovery runs.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { loadReport, normaliseCombined, normaliseSingle, isApproved, reasonOf } from "./lib/qa-report.mjs";

const SLUGS = ["coming-together", "open-hands", "human-spirit"];
const EXPECTED_COMBINED = 6;
const force = process.env.FORCE_PUBLISH === "1";

// Uses the SAME parser as merge-tier2.mjs. These two files previously
// parsed the contract differently: merge normalised an object-keyed
// `combined`, this one did not, silently saw zero cards, and published an
// edition a reviewer had explicitly rejected. One parser, one meaning.
const loaded = loadReport(".qa/tier2-report.json");
if (!loaded.ok) {
  console.log(`::error::.qa/tier2-report.json unreadable (${loaded.why}). See the qa-reports artifact.`);
  // Write the per-edition statuses BEFORE any exit: the workflow reads a
  // missing status as "discard", so returning early here silently threw
  // away all three category editions on a forced recovery run.
  for (const slug of SLUGS) writeFileSync(`.qa/final-${slug}.status`, "fail");
  if (force) {
    console.log("::warning::FORCE_PUBLISH=1 — publishing the combined digest despite an unreadable report.");
    process.exit(0);
  }
  process.exit(1);
}
const report = loaded.data;

const combinedMap = normaliseCombined(report?.editions?.combined);
const combined = combinedMap ? [...combinedMap.entries()].map(([n, e]) => ({ n, ...e })) : [];
// Not-approved, not merely `pass === false` — an explicit rejection
// spelled any other way used to slip through as approval.
const genuineFailures = combined.filter((c) => !isApproved(c));
const covered = combined.length;

for (const c of genuineFailures) {
  console.log(`::error::combined card #${c.n}${c.cat ? ` (${c.cat})` : ""} failed visual review — ${reasonOf(c)}`);
}

if (covered < EXPECTED_COMBINED) {
  console.log(
    `::warning::Tier 2 reviewed only ${covered}/${EXPECTED_COMBINED} combined cards. ` +
    `This is a reviewer coverage gap, NOT a verdict that the photos are wrong. ` +
    `Publishing anyway — Tier 1 verified every link and image resolves — but the ` +
    `unreviewed cards are worth a manual look. Reports are in the qa-reports artifact.`
  );
}

// Per-edition decisions for the three new categories: both tiers must pass.
for (const slug of SLUGS) {
  const entry = normaliseSingle(report?.editions?.[slug]);
  const tier1 = existsSync(`.qa/tier1-${slug}.status`)
    ? readFileSync(`.qa/tier1-${slug}.status`, "utf8").trim()
    : "fail";
  // No Tier 2 entry means it wasn't reviewed (usually because Tier 1 already
  // excluded it). Only an explicit pass:false is a quality failure.
  const tier2Failed = entry && !isApproved(entry);
  const ok = tier1 === "pass" && !tier2Failed;
  writeFileSync(`.qa/final-${slug}.status`, ok ? "pass" : "fail");
  if (ok) {
    console.log(`${slug}: publishing${entry ? "" : " (Tier 2 did not report on it)"}`);
  } else {
    console.log(`${slug}: held back — ${tier1 !== "pass" ? "failed Tier 1" : reasonOf(entry)}`);
  }
}

if (genuineFailures.length) {
  if (force) {
    console.log(`::warning::FORCE_PUBLISH=1 — publishing despite ${genuineFailures.length} failed card(s).`);
    process.exit(0);
  }
  console.log(`::error::Not publishing: ${genuineFailures.length} combined card(s) failed visual review. Fix the photo(s) and re-run, or re-run with FORCE_PUBLISH=1 to override.`);
  process.exit(1);
}

console.log(`combined digest: clear to publish (${covered} card(s) reviewed, 0 failures).`);
process.exit(0);
