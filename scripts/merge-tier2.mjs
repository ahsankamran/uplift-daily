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

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const expectedCombined = Number(process.argv[2] || 6);

function load(path) {
  if (!existsSync(path)) return { ok: false, why: "file not written" };
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    return { ok: false, why: `unreadable: ${e.message}` };
  }
  // A reviewer may wrap JSON in prose or a ```json fence despite the
  // contract; salvage the outermost object rather than discarding the work.
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return { ok: false, why: "no JSON object found" };
  try {
    return { ok: true, data: JSON.parse(raw.slice(start, end + 1)) };
  } catch (e) {
    return { ok: false, why: `invalid JSON: ${e.message}` };
  }
}

// Accepts: an array of entries; an object keyed by card number; or an
// object with a nested array. Returns [] only when there is genuinely
// nothing card-shaped in there.
function normaliseCombined(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return v;
  if (typeof v === "object") {
    const vals = Object.entries(v).map(([k, val]) => {
      if (val && typeof val === "object" && !Array.isArray(val)) {
        return { n: val.n ?? (Number(k) || undefined), ...val };
      }
      return null;
    }).filter(Boolean);
    return vals.length ? vals : null;
  }
  return null;
}

function normaliseSingle(v) {
  if (v == null) return null;
  if (typeof v === "object" && !Array.isArray(v)) return v;
  if (Array.isArray(v) && v.length) return v[0];
  return null;
}

const SLUGS = ["coming-together", "open-hands", "human-spirit"];

const r1 = load(".qa/tier2-report-1.json");
const r2 = load(".qa/tier2-report-2.json");

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

const n = Math.max(combinedA?.length || 0, combinedB?.length || 0);
const merged = { date: (a || b).date || "", editions: { combined: [] } };
let blocked = 0;

for (let i = 0; i < n; i++) {
  const ca = combinedA?.[i];
  const cb = combinedB?.[i];
  const src = ca || cb;
  // Union of failures: either reviewer failing a card blocks it. A card
  // only one reviewer saw still counts — a missing opinion is not approval,
  // but it is also not a failure on its own.
  const pass = (!ca || ca.pass !== false) && (!cb || cb.pass !== false);
  const reason = [
    ca && ca.pass === false ? `pass1: ${ca.reason || "(no reason given)"}` : null,
    cb && cb.pass === false ? `pass2: ${cb.reason || "(no reason given)"}` : null,
  ].filter(Boolean).join(" | ");
  merged.editions.combined.push({ n: src.n ?? i + 1, cat: src.cat || "", pass, reason });
  if (!pass) {
    blocked++;
    console.log(`combined card ${src.n ?? i + 1}: BLOCKED — ${reason}`);
  }
}

for (const slug of SLUGS) {
  const ea = normaliseSingle(a?.editions?.[slug]);
  const eb = normaliseSingle(b?.editions?.[slug]);
  if (!ea && !eb) continue;
  const pass = (!ea || ea.pass !== false) && (!eb || eb.pass !== false);
  const reason = [
    ea && ea.pass === false ? `pass1: ${ea.reason || "(no reason given)"}` : null,
    eb && eb.pass === false ? `pass2: ${eb.reason || "(no reason given)"}` : null,
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
