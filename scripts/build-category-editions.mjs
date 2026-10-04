// Phase 2 — derives the 6 category editions from the combined digest.
// Zero extra sourcing: the day's manifest entry (issues/index.json) already
// carries one structured story per category, so each category edition is
// just that day's existing story, repackaged via the shared generator in
// scripts/lib/edition-page.mjs — same visual system as the 3 new editions.
//
// Does NOT touch the combined digest itself (index.html / feed.html /
// archive.html / issues/index.json at the repo root) — those stay exactly
// as Claude hand-authors them today.
//
// Usage:
//   node scripts/build-category-editions.mjs <date>   # defaults to newest entry if omitted

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildEditionPages } from "./lib/edition-page.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Category name -> edition slug + display name. Keep in sync with
// CLAUDE.md's category list.
const CATEGORIES = {
  "Quiet Kindness": { slug: "quiet-kindness", name: "Quiet Kindness" },
  "Small Wonders": { slug: "small-wonders", name: "Small Wonders" },
  "Everyday Joy": { slug: "everyday-joy", name: "Everyday Joy" },
  "Nature": { slug: "nature", name: "Nature" },
  "Science & Medicine": { slug: "science-medicine", name: "Science & Medicine" },
  "Global Progress": { slug: "global-progress", name: "Global Progress" },
};

// The manifest's structured stories[] carries only a headline (cat, place,
// head, src, url, img — per DAILY.md's spec), not the full 3-sentence
// summary. That text only exists in the hand-authored issues/<date>.html,
// as <p class="dek">...</p> inside the "today" section, in the same order
// as the kickers. Same extraction approach as render-archive-cards.mjs.
function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

async function extractSummaries(date) {
  let html;
  try {
    html = await fs.readFile(path.join(ROOT, "issues", `${date}.html`), "utf8");
  } catch {
    return [];
  }
  const th = html.indexOf('aria-labelledby="today-h"');
  if (th < 0) return [];
  let yh = html.indexOf('aria-labelledby="yesterday-h"', th + 1);
  if (yh < 0) yh = html.length;
  const seg = html.slice(th, yh);
  const kickers = [...seg.matchAll(/class="kicker"[^>]*>([\s\S]*?)<\/span>/g)].map((m) => decodeEntities(m[1]));
  const deks = [...seg.matchAll(/class="dek"[^>]*>([\s\S]*?)<\/p>/g)].map((m) =>
    decodeEntities(m[1].replace(/<[^>]+>/g, ""))
  );
  return kickers.map((kicker, i) => ({ kicker, summary: deks[i] || "" }));
}

const manifest = JSON.parse(await fs.readFile(path.join(ROOT, "issues", "index.json"), "utf8"));
const list = Array.isArray(manifest) ? manifest : manifest.issues || [];
const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date));

const dateArg = process.argv[2];
const entry = dateArg ? sorted.find((e) => e.date === dateArg) : sorted[0];
if (!entry) {
  console.error(dateArg ? `no manifest entry for ${dateArg}` : "manifest is empty");
  process.exit(1);
}
if (!Array.isArray(entry.stories) || !entry.stories.length) {
  console.error(`entry for ${entry.date} has no structured stories[] array — cannot derive category editions`);
  process.exit(1);
}

console.log(`Deriving category editions from ${entry.date} (Edition ${entry.edition ?? entry.number ?? "?"})\n`);

const extracted = await extractSummaries(entry.date);
if (!extracted.length) {
  console.log(`(no issues/${entry.date}.html found or no "today" section parsed — summaries will fall back to the headline alone)\n`);
}

let ok = 0;
for (const s of entry.stories) {
  const cat = CATEGORIES[s.cat];
  if (!cat) {
    console.log(`skip — unrecognized category "${s.cat}"`);
    continue;
  }
  // Match by kicker text ("Category · Place"), not array order — the
  // manifest's stories[] order isn't guaranteed to match the HTML's.
  const kickerText = [s.cat, s.place].filter(Boolean).join(" · ");
  const match = extracted.find((e) => e.kicker === kickerText);
  const story = {
    date: entry.date,
    cat: s.cat,
    place: s.place || "",
    head: s.head || "",
    summary: (match && match.summary) || s.summary || s.head || "",
    src: s.src || "",
    url: s.url || "",
    img: s.img || "",
    photographer: s.photographer || "",
  };
  if (!match) console.log(`  (no matching dek found for "${kickerText}" — using headline as summary)`);
  try {
    const { files } = await buildEditionPages(ROOT, cat.slug, cat.name, story);
    console.log(`✓ ${cat.name} — ${files.length} files`);
    ok++;
  } catch (err) {
    console.log(`✗ ${cat.name} — ${err.message}`);
  }
}

console.log(`\n${ok}/${Object.keys(CATEGORIES).length} category editions derived from ${entry.date}.`);
process.exit(ok === Object.keys(CATEGORIES).length ? 0 : 1);
