// Single source of truth for reading Tier 2 reviewer verdicts.
//
// merge-tier2.mjs and evaluate-qa.mjs previously each parsed the reviewers'
// JSON their own way, and disagreed. merge-tier2 normalised an
// object-keyed `combined`; evaluate-qa did not, silently saw zero cards,
// and PUBLISHED an edition a reviewer had explicitly rejected. Two parsers
// for one contract is how a gate ends up failing open.
//
// Three rules encoded here, each from a verified defect:
//
//  1. Cards are identified by their number `n`, never by array position.
//     Reviewers legitimately report different numbers of entries (one may
//     list only the cards it rejected). Zipping by index attributed card
//     5's defect to card 1 — blocking a good photo and shipping the bad
//     one.
//
//  2. A card passes only on an affirmative pass. `pass: "false"`,
//     `pass: 0`, `pass: "fail"` and a bare `reason` with no `pass` were all
//     read as approval, because the check was `pass !== false` and a string
//     is not the boolean. An explicit rejection must never become a pass.
//
//  3. An entry that is absent is a coverage gap, not approval — and not a
//     failure either. Those are three distinct states and the caller
//     decides what each means.

import { readFileSync, existsSync } from "node:fs";

// Returns { ok, data } | { ok:false, why }
export function loadReport(path) {
  if (!existsSync(path)) return { ok: false, why: "file not written" };
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    return { ok: false, why: `unreadable: ${e.message}` };
  }

  // Try the file as-is first. The previous version went straight to
  // slicing indexOf("{")..lastIndexOf("}"), which DESTROYED valid JSON
  // whenever prose around it contained a brace, and rejected a valid
  // top-level array outright.
  const direct = tryParse(raw);
  if (direct.ok) return direct;

  // Fenced block, the common wrapper.
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    const r = tryParse(fence[1]);
    if (r.ok) return r;
  }

  // Last resort: try every "{" as a start, closing at the last "}". A
  // single widest-span attempt failed whenever the surrounding prose
  // itself contained a brace ("Review complete (note: {caveat}): {...}"),
  // discarding a perfectly good verdict and costing the day.
  const end = raw.lastIndexOf("}");
  if (end !== -1) {
    for (let i = raw.indexOf("{"); i !== -1 && i < end; i = raw.indexOf("{", i + 1)) {
      const r = tryParse(raw.slice(i, end + 1));
      if (r.ok && r.data.editions) return r;
    }
  }
  return { ok: false, why: "no parseable JSON object found" };
}

function tryParse(text) {
  try {
    const v = JSON.parse(text);
    if (v && typeof v === "object") return { ok: true, data: v };
    return { ok: false, why: "JSON is not an object" };
  } catch (e) {
    return { ok: false, why: `invalid JSON: ${e.message}` };
  }
}

// A card is approved ONLY by an affirmative value. Everything else —
// including an explicit rejection in any spelling, and a reason with no
// verdict — counts as not-passing.
export function isApproved(entry) {
  if (!entry || typeof entry !== "object") return false;
  const v = entry.pass ?? entry.passed ?? entry.verdict ?? entry.result;
  if (v === true) return true;
  if (typeof v === "string") return /^(true|pass|passed|ok)$/i.test(v.trim());
  return false;
}

export function reasonOf(entry) {
  if (!entry || typeof entry !== "object") return "";
  return String(entry.reason || entry.why || entry.note || "").trim() || "(no reason given)";
}

// Accepts an array, an object keyed by card number, or an object wrapping
// an array under any key. Returns a Map of cardNumber -> entry so callers
// can align two reviewers correctly. Null/garbage members are dropped.
export function normaliseCombined(v) {
  if (v == null) return null;

  let list = null;
  if (Array.isArray(v)) {
    list = v.map((e, i) => (e && typeof e === "object" ? { n: numOr(e.n, i + 1), ...e } : null));
  } else if (typeof v === "object") {
    const nested = Object.values(v).find((x) => Array.isArray(x));
    if (nested) {
      list = nested.map((e, i) => (e && typeof e === "object" ? { n: numOr(e.n, i + 1), ...e } : null));
    } else {
      list = Object.entries(v).map(([k, e]) =>
        e && typeof e === "object" ? { n: numOr(e.n, Number(k)), ...e } : null
      );
    }
  }
  if (!list) return null;
  list = list.filter(Boolean);
  if (!list.length) return null;

  const byNumber = new Map();
  list.forEach((e, i) => byNumber.set(numOr(e.n, i + 1), e));
  return byNumber;
}

export function normaliseSingle(v) {
  if (v == null) return null;
  if (Array.isArray(v)) {
    // Keep the worst verdict, not just the first — discarding later
    // entries silently dropped a rejection.
    const objs = v.filter((x) => x && typeof x === "object");
    if (!objs.length) return null;
    return objs.find((x) => !isApproved(x)) || objs[0];
  }
  if (typeof v === "object") return v;
  return null;
}

function numOr(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
