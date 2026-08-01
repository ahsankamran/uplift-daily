// One-off backfill: the cloud editor sometimes wrote Unsplash image URLs using
// the photo PAGE SLUG (images.unsplash.com/photo-<slug>) instead of the CDN id
// (images.unsplash.com/photo-<digits>-<hex>). Slug URLs 404, so cards render
// blank. This resolves each slug -> CDN id via the photo's /download redirect
// (throttled + retried + cached) and patches every file that references it.
//
//   node scripts/backfill-images.mjs --dry   # scan + resolve, no writes
//   node scripts/backfill-images.mjs         # resolve + patch files
//
// Resolved slugs are cached in scripts/.image-backfill-map.json so re-runs after
// a rate-limit don't redo work.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");
const DRY = process.argv.includes("--dry");
const CACHE = resolve(__dirname, ".image-backfill-map.json");

const targets = [resolve(REPO, "index.html"), resolve(REPO, "issues", "index.json")];
const issuesDir = resolve(REPO, "issues");
for (const f of readdirSync(issuesDir)) if (f.endsWith(".html")) targets.push(resolve(issuesDir, f));

const BROKEN = /images\.unsplash\.com\/photo-([A-Za-z0-9_-]+)/g;
const isValidCdnId = (id) => /^\d{10,}-[0-9a-fA-F]+$/.test(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. Collect unique broken slugs.
const slugs = new Set();
const fileText = new Map();
for (const f of targets) {
  if (!existsSync(f)) continue;
  const txt = readFileSync(f, "utf8");
  fileText.set(f, txt);
  for (const m of txt.matchAll(BROKEN)) if (!isValidCdnId(m[1])) slugs.add(m[1]);
}
console.log(`found ${slugs.size} unique broken slug(s)`);

// 2. Resolve (cache-first, throttled curl /download redirect, retried).
const map = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
const resolveSlug = (slug) => {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const loc = execSync(
        `curl -s -o /dev/null -w "%{redirect_url}" "https://unsplash.com/photos/${slug}/download"`,
        { encoding: "utf8", timeout: 20000 }
      ).trim();
      const m = loc.match(/photo-(\d{10,}-[0-9a-fA-F]+)/);
      if (m) return m[1];
    } catch {}
    execSync(`sleep ${attempt * 3}`); // backoff between retries
  }
  return null;
};

const failed = [];
let i = 0;
for (const slug of slugs) {
  i++;
  if (map[slug]) { continue; } // cached
  const id = resolveSlug(slug);
  if (id) { map[slug] = id; console.log(`  [${i}/${slugs.size}] ${slug} -> photo-${id}`); }
  else { failed.push(slug); console.log(`  [${i}/${slugs.size}] ${slug} -> FAILED`); }
  writeFileSync(CACHE, JSON.stringify(map, null, 2)); // persist after each
  await sleep(1500); // gentle throttle
}

const resolvedCount = [...slugs].filter((s) => map[s]).length;
console.log(`\nresolved ${resolvedCount}/${slugs.size} (${failed.length} failed)`);

// 3. Patch files with whatever is resolved.
const changedDates = new Set();
let filesPatched = 0;
for (const [f, txt0] of fileText) {
  let txt = txt0;
  for (const slug of slugs) if (map[slug]) txt = txt.split(`photo-${slug}`).join(`photo-${map[slug]}`);
  if (txt !== txt0) {
    if (!DRY) writeFileSync(f, txt);
    filesPatched++;
    const dm = f.split("/").pop().match(/^(\d{4}-\d{2}-\d{2})\.html$/);
    if (dm) changedDates.add(dm[1]);
  }
}
console.log(`${DRY ? "[dry] would patch" : "patched"} ${filesPatched} file(s)`);
console.log(`affected edition dates: ${[...changedDates].sort().join(" ") || "(none)"}`);
if (failed.length) console.log(`STILL UNRESOLVED (re-run to retry): ${failed.join(", ")}`);
