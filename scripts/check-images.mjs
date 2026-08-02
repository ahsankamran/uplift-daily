// Verify an edition's photos actually load before we render cards from them.
//
//   node scripts/check-images.mjs 2026-08-01   # one edition
//   node scripts/check-images.mjs --all        # audit the whole manifest
//
// Two ways a photo goes missing, both of which render a card as text-on-black
// with an empty photo well — and neither of which the renderer complains about:
//
//   1. The URL is an Unsplash page SLUG (photo-i5kMNyhiw6c) rather than a CDN
//      id (photo-1717292741426-d050f4f25503). Slug URLs always 404.
//   2. The id is well-formed but invented, so it 404s anyway.
//
// Exits 1 if any image is bad, so the daily job can shout instead of quietly
// publishing blank cards (it did exactly that for the June 20-30 editions).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");

const arg = process.argv[2];
if (!arg) {
  console.error("usage: check-images.mjs <YYYY-MM-DD>|--all");
  process.exit(2);
}

const CDN_FORM = /^https:\/\/images\.unsplash\.com\/photo-\d{10,}-[0-9a-fA-F]{6,}\?/;

const manifest = JSON.parse(readFileSync(resolve(REPO, "issues", "index.json"), "utf8"));
const all = (Array.isArray(manifest) ? manifest : manifest.issues || []).slice().sort((a, b) => a.date.localeCompare(b.date));
const editions = arg === "--all" ? all : all.filter((e) => e.date === arg);

if (!editions.length) {
  console.error(`no manifest entry for ${arg}`);
  process.exit(2);
}

// HEAD the URL; Unsplash answers HEAD fine and it saves pulling the bytes.
async function status(url) {
  try {
    const r = await fetch(url, { method: "HEAD", redirect: "follow" });
    return r.status;
  } catch (e) {
    return `ERR ${e.message}`;
  }
}

let bad = 0;
let checked = 0;

for (const e of editions) {
  const stories = e.stories || [];
  const problems = [];

  // Shape first (free), then network only for the plausible ones.
  const results = await Promise.all(
    stories.map(async (s, i) => {
      const n = i + 1;
      if (!s.img) return { n, why: "no img field" };
      if (!CDN_FORM.test(s.img)) return { n, why: `not CDN form: ${s.img.slice(0, 72)}` };
      checked++;
      const code = await status(s.img);
      return code === 200 ? null : { n, why: `HTTP ${code}: ${s.img.slice(0, 72)}` };
    })
  );

  for (const r of results) if (r) problems.push(r);

  if (problems.length) {
    bad += problems.length;
    console.log(`${e.date} — ${problems.length}/${stories.length} bad`);
    for (const p of problems) console.log(`   #${p.n} ${p.why}`);
  } else if (arg !== "--all") {
    console.log(`${e.date} — all ${stories.length} images OK`);
  }
}

if (arg === "--all") {
  console.log(`\nchecked ${editions.length} edition(s), ${checked} live request(s) — ${bad} bad image(s)`);
}
process.exit(bad ? 1 : 0);
