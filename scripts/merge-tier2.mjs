// Merge the two Tier 2 visual-review passes into one verdict.
//
//   node scripts/merge-tier2.mjs <expectedCombinedCount>
//
// Reads  .qa/tier2-report-1.json and .qa/tier2-report-2.json
// Writes .qa/tier2-report.json  (merged)
//
// Exit 0 = a usable merged verdict was produced (which may still contain
//          pass:false entries — deciding what to do about those is the
//          caller's job, not this script's)
// Exit 1 = the reviewers' output could not be understood at all
//
// WHY THIS IS A SCRIPT AND NOT INLINE YAML
// The first version of this lived inline in daily.yml and assumed the
// reviewers would always emit `editions.combined` as an array. When a
// reviewer instead emitted an object keyed by card number — a completely
// reasonable reading of the contract — the merge produced an EMPTY array,
// exited 0, and the next step failed with "length < 6". Every edition from
// 2026-10-05 to 2026-10-31 was written, reviewed, and then thrown away on
// that single line, with nothing in the output saying why.
//
// Two lessons are baked in below: normalise anything sane the reviewers
// might emit, and never let "I could not understand this" masquerade as
// "this failed review". Those are different problems with different fixes
// and they must not produce the same message.

import { writeFileSync, appendFileSync } from "node:fs";
import { loadReport, normaliseCombined, normaliseSingle, isApproved, reasonOf } from "./lib/qa-report.mjs";

const expectedCombined = Number(process.argv[2] || 6);

const SLUGS = ["coming-together", "open-hands", "human-spirit"];

const r1 = loadReport(".qa/tier2-report-1.json");
const r2 = loadReport(".qa/tier2-report-2.json");

for (const [label, r] of [["pass 1", r1], ["pass 2", r2]]) {
  if (!r.ok) console.log(`::warning::Tier 2 ${label} unusable — ${r.why}`);
}

if (!r1.ok && !r2.ok) {
  console.log("::error::Both Tier 2 passes produced unusable output. This is a REVIEWER malfunction, not a verdict on the edition's photos — do not read it as 'the images are bad'. Inspect the uploaded qa-reports artifact.");
  process.exit(1);
}

const a = r1.ok ? r1.data : null;
const b = r2.ok ? r2.data : null;

const combinedA = normaliseCombined(a?.editions?.combined);
const combinedB = normaliseCombined(b?.editions?.combined);

if (!combinedA && !combinedB) {
  console.log("::error::Neither Tier 2 pass reported anything card-shaped under editions.combined. REVIEWER malfunction, not a photo verdict. Inspect the uploaded qa-reports artifact.");
  process.exit(1);
}

// Align the two reviewers by CARD NUMBER, never by array position. A
// reviewer may legitimately report only the cards it rejected; zipping by
// index attributed card 5's defect to card 1 — blocking a good photo and
// publishing the bad one. Verified before this fix.
const cardNumbers = [...new Set([
  ...(combinedA ? [...combinedA.keys()] : []),
  ...(combinedB ? [...combinedB.keys()] : []),
])].sort((x, y) => x - y);

const merged = { date: (a || b).date || "", editions: { combined: [] } };
let blocked = 0;

for (const num of cardNumbers) {
  const ca = combinedA?.get(num);
  const cb = combinedB?.get(num);
  const src = ca || cb;
  // Either reviewer withholding approval blocks the card. isApproved()
  // requires an affirmative verdict, so pass:"false" / pass:0 /
  // pass:"fail" / a bare reason can no longer read as approval.
  const failA = ca && !isApproved(ca);
  const failB = cb && !isApproved(cb);
  const pass = !failA && !failB;
  const reason = [
    failA ? `pass1: ${reasonOf(ca)}` : null,
    failB ? `pass2: ${reasonOf(cb)}` : null,
  ].filter(Boolean).join(" | ");
  merged.editions.combined.push({ n: num, cat: src.cat || "", pass, reason });
  if (!pass) {
    blocked++;
    console.log(`combined card ${num}: BLOCKED — ${reason}`);
  }
}

for (const slug of SLUGS) {
  const ea = normaliseSingle(a?.editions?.[slug]);
  const eb = normaliseSingle(b?.editions?.[slug]);
  if (!ea && !eb) continue;
  const failA = ea && !isApproved(ea);
  const failB = eb && !isApproved(eb);
  const pass = !failA && !failB;
  const reason = [
    failA ? `pass1: ${reasonOf(ea)}` : null,
    failB ? `pass2: ${reasonOf(eb)}` : null,
  ].filter(Boolean).join(" | ");
  merged.editions[slug] = { pass, reason };
  if (!pass) console.log(`${slug}: BLOCKED — ${reason}`);
}

// Short coverage is a reviewer problem, not a photo problem — say so in
// those words, because the old code's "length < 6" read as a quality
// failure and sent three weeks of debugging in the wrong direction.
const covered = merged.editions.combined.length;
if (covered < expectedCombined) {
  console.log(`::warning::Tier 2 covered only ${covered} of ${expectedCombined} combined cards — REVIEWER coverage gap, not a photo verdict.`);
  merged.coverageShortfall = { covered, expected: expectedCombined };
}

merged.blockedCount = blocked;
writeFileSync(".qa/tier2-report.json", JSON.stringify(merged, null, 2));
console.log(`merged: ${covered}/${expectedCombined} combined cards reviewed, ${blocked} blocked`);

// Let the workflow branch on this: a blocked card should trigger a repair
// round, not end the day. Blocking with no way to repair is what turned
// ordinary photo misses into 27 consecutive days of nothing published.
if (process.env.GITHUB_OUTPUT) {
  const failedCards = merged.editions.combined
    .filter((c) => !c.pass)
    .map((c) => c.n)
    .join(",");
  appendFileSync(process.env.GITHUB_OUTPUT, `blocked=${blocked}\nfailed_cards=${failedCards}\n`);
}
