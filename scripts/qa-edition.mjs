// Tier 1 of the editorial QA gate — deterministic checks, no model call.
// Catches broken links and malformed images outright (hard block); flags
// text-format issues that need a human or Tier 2 eye (soft — reported, not
// blocking, since these are heuristics that can misfire on real prose).
//
// Does NOT catch a photo that loads fine but shows the wrong thing (the
// Tasmania/Japan cherry-blossom mismatch that started this). That's Tier 2 —
// see scripts/qa-visual-review.md — a model call that looks at the actual
// pixels, which this script deliberately doesn't do.
//
// Usage:
//   node scripts/qa-edition.mjs <date>                   # combined digest (issues/index.json), expects 6 stories
//   node scripts/qa-edition.mjs <date> <editionSlug>      # category edition (editions/<slug>/issues/index.json), expects 1 story
//   node scripts/qa-edition.mjs --story <path.json>       # ad-hoc single story, for testing before it's in any manifest
//
// Exit 0: no hard blocks (soft flags may still be present — check the report).
// Exit 1: at least one hard block.
// Exit 2: usage/lookup error (bad date, missing manifest entry, etc).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");

const CDN_FORM = /^https:\/\/images\.unsplash\.com\/photo-\d{10,}-[0-9a-fA-F]{6,}\?/;
const BANNED_WORDS = [
  "amazing", "incredible", "heartwarming", "uplifting", "inspires", "inspiring",
  "reminds us that", "in a world where", "amid",
];
// Heuristic: a homepage/section front is almost always short on path segments
// and has no digits (no article id/slug/date in the URL).
function looksLikeHomepage(url) {
  try {
    const u = new URL(url);
    const segs = u.pathname.split("/").filter(Boolean);
    return segs.length <= 1 && !/\d/.test(u.pathname);
  } catch {
    return true; // unparseable URL is its own problem, flagged separately
  }
}

// Rough sentence count: split on .?! followed by a space+capital or end of
// string, but don't split on common abbreviations. This is a heuristic — it
// will misfire on some valid prose (hence: soft flag, never a hard block).
const ABBREV = /\b(U\.S|U\.K|Dr|Mr|Mrs|Ms|St|vs|etc|Inc|Ltd|No)\.$/;
function countSentences(text) {
  const parts = text.split(/(?<=[.?!])\s+(?=[A-Z"“])/);
  let n = 0;
  for (const p of parts) {
    const trimmed = p.trim();
    if (!trimmed) continue;
    if (ABBREV.test(trimmed)) continue; // merged into neighbor, not a real boundary
    n++;
  }
  return n;
}

// A plain Node fetch with no UA gets blocked by sites that bot-filter on
// headers alone (seen live: a healthy Manchester University URL 503'd with
// no UA, 200'd instantly with one) — so always look like a real browser.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

async function fetchOnce(url, method) {
  try {
    const r = await fetch(url, { method, redirect: "follow", headers: { "User-Agent": UA } });
    return r.status;
  } catch (e) {
    return `ERR ${e.message}`;
  }
}

// Returns { status, botBlocked }. A 5xx gets one retry (several real
// publishers — Manchester included — 503 transiently and recover on the next
// request). A 403 that survives a GET retry is reported separately: sites
// like Smithsonian Magazine return 403 to *any* scripted client regardless of
// UA (Cloudflare/Akamai-style bot defense) even when the page is fine for a
// human — that is not evidence the article is broken, so it must never hard-
// block the edition on its own.
async function httpStatus(url) {
  let status = await fetchOnce(url, "HEAD");
  if (status === 405 || status === 403) status = await fetchOnce(url, "GET");
  if (typeof status === "number" && status >= 500) {
    await new Promise((r) => setTimeout(r, 1500));
    status = await fetchOnce(url, "GET");
  }
  return { status, botBlocked: status === 403 };
}

// Checks a single story object: { cat, place, head, summary?, src, url, img }
async function checkStory(s, label) {
  const hard = [];
  const soft = [];

  // --- link ---
  if (!s.url) hard.push("missing url");
  else {
    const { status, botBlocked } = await httpStatus(s.url);
    if (status !== 200 && botBlocked) {
      soft.push(`url returned 403 to an automated check (likely bot-defense, not a broken link — verify by hand): ${s.url}`);
    } else if (status !== 200) {
      hard.push(`url HTTP ${status}: ${s.url}`);
    }
    if (looksLikeHomepage(s.url)) soft.push(`url looks like a homepage/section front, not an article: ${s.url}`);
  }

  // --- image ---
  if (!s.img) hard.push("missing img");
  else if (!CDN_FORM.test(s.img)) hard.push(`img not Unsplash CDN form: ${s.img}`);
  else {
    const { status, botBlocked } = await httpStatus(s.img);
    if (status !== 200 && botBlocked) {
      soft.push(`img returned 403 to an automated check (likely bot-defense — verify by hand): ${s.img}`);
    } else if (status !== 200) {
      hard.push(`img HTTP ${status}: ${s.img}`);
    }
  }

  // --- text ---
  if (!s.head) hard.push("missing headline");
  else if (!s.head.trim().endsWith(".")) soft.push(`headline doesn't end with a period: "${s.head}"`);

  const body = s.summary || s.head || "";
  const lower = body.toLowerCase();
  for (const w of BANNED_WORDS) {
    if (lower.includes(w)) soft.push(`banned word "${w}" in summary`);
  }
  if (body.includes("!")) soft.push("exclamation mark in summary");
  if (s.summary) {
    const n = countSentences(s.summary);
    if (n !== 3) soft.push(`summary looks like ${n} sentence(s), expected 3 (heuristic — verify by eye)`);
  }

  return { label, place: s.place, cat: s.cat, hard, soft };
}

function loadManifestEntry(manifestPath, date) {
  const raw = JSON.parse(readFileSync(manifestPath, "utf8"));
  const list = Array.isArray(raw) ? raw : raw.issues || [];
  return list.find((e) => e.date === date);
}

function usExceedsOne(stories) {
  const usLike = (place) => /\b(USA|United States|U\.S\.)\b/i.test(place || "");
  return stories.filter((s) => usLike(s.place)).length > 1;
}

async function main() {
  const args = process.argv.slice(2);
  let stories = [];
  let context = "";

  if (args[0] === "--story") {
    const path = args[1];
    if (!path) { console.error("usage: qa-edition.mjs --story <path.json>"); process.exit(2); }
    stories = [JSON.parse(readFileSync(path, "utf8"))];
    context = `ad-hoc story (${path})`;
  } else {
    const [date, slug] = args;
    if (!date) {
      console.error(
        "usage: qa-edition.mjs <date> [editionSlug] | qa-edition.mjs --story <path.json>"
      );
      process.exit(2);
    }
    const manifestPath = slug
      ? resolve(REPO, "editions", slug, "issues", "index.json")
      : resolve(REPO, "issues", "index.json");
    let entry;
    try {
      entry = loadManifestEntry(manifestPath, date);
    } catch (e) {
      console.error(`no manifest at ${manifestPath}: ${e.message}`);
      process.exit(2);
    }
    if (!entry) {
      console.error(`no entry for ${date} in ${manifestPath}`);
      process.exit(2);
    }
    stories = Array.isArray(entry.stories) ? entry.stories : [entry];
    context = slug ? `${slug} / ${date}` : `combined digest / ${date}`;
  }

  console.log(`QA (Tier 1) — ${context} — ${stories.length} stor${stories.length === 1 ? "y" : "ies"}\n`);

  const results = await Promise.all(stories.map((s, i) => checkStory(s, `#${i + 1}`)));

  let hardTotal = 0, softTotal = 0;
  for (const r of results) {
    const tag = [r.cat, r.place].filter(Boolean).join(" · ") || r.label;
    if (!r.hard.length && !r.soft.length) {
      console.log(`✓ ${r.label} ${tag} — clean`);
      continue;
    }
    console.log(`${r.hard.length ? "✗" : "~"} ${r.label} ${tag}`);
    for (const h of r.hard) console.log(`   BLOCK: ${h}`);
    for (const s of r.soft) console.log(`   flag:  ${s}`);
    hardTotal += r.hard.length;
    softTotal += r.soft.length;
  }

  // Edition-level check: geographic diversity (only meaningful for the
  // 6-story combined digest, not single-story editions).
  if (stories.length > 1 && usExceedsOne(stories)) {
    console.log(`~ edition-level flag: more than one US-based story in this edition`);
    softTotal++;
  }

  console.log(`\n${hardTotal} hard block(s), ${softTotal} soft flag(s).`);
  process.exit(hardTotal ? 1 : 0);
}

main().catch((err) => {
  console.error("qa-edition failed:", err.message);
  process.exit(2);
});
