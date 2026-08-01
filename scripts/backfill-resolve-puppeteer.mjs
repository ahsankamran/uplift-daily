// Resolve the remaining broken Unsplash slugs that plain curl can't reach
// (Unsplash gates scripted requests behind an Anubis bot-challenge / HTTP 401).
// A real headless browser runs the challenge JS and loads the page, so we can
// read the true CDN photo id. Populates scripts/.image-backfill-map.json;
// re-run backfill-images.mjs afterward to patch files from the cache.

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");
const CACHE = resolve(__dirname, ".image-backfill-map.json");

// Gather still-broken slugs from the source files.
const files = [resolve(REPO, "index.html"), resolve(REPO, "issues", "index.json")];
const issuesDir = resolve(REPO, "issues");
for (const f of readdirSync(issuesDir)) if (f.endsWith(".html")) files.push(resolve(issuesDir, f));
const BROKEN = /images\.unsplash\.com\/photo-([A-Za-z0-9_-]+)/g;
const valid = (id) => /^\d{10,}-[0-9a-fA-F]+$/.test(id);
const slugs = new Set();
for (const f of files) if (existsSync(f)) for (const m of readFileSync(f, "utf8").matchAll(BROKEN)) if (!valid(m[1])) slugs.add(m[1]);

const map = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
const todo = [...slugs].filter((s) => !map[s]);
console.log(`${todo.length} slug(s) to resolve via browser`);
if (!todo.length) process.exit(0);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox", "--disable-setuid-sandbox"] });
const page = await browser.newPage();
await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36");

// Warm up: Unsplash gates the first loads behind a proof-of-work challenge and
// only issues its pass-cookie after the browser solves it. Load the site and
// wait until the "not a bot" interstitial clears before resolving slugs.
console.log("warming up (passing bot challenge)…");
for (let t = 0; t < 15; t++) {
  try {
    await page.goto("https://unsplash.com/", { waitUntil: "networkidle2", timeout: 45000 });
    const title = await page.title();
    if (!/not a bot/i.test(title)) { console.log(`  warmed up after ${t + 1} load(s)`); break; }
  } catch {}
  await sleep(3000);
}

let ok = 0;
const failed = [];
for (let i = 0; i < todo.length; i++) {
  const slug = todo[i];
  try {
    await page.goto(`https://unsplash.com/photos/${slug}`, { waitUntil: "networkidle2", timeout: 45000 });
    // Wait for the challenge to clear and a real CDN url to be present.
    let id = null;
    for (let t = 0; t < 12 && !id; t++) {
      id = await page.evaluate(() => {
        const og = document.querySelector('meta[property="og:image"]')?.content || "";
        let m = og.match(/photo-(\d{10,}-[0-9a-f]+)/);
        if (m) return m[1];
        const img = [...document.querySelectorAll("img")].map((i) => i.src).find((s) => /images\.unsplash\.com\/photo-\d{10,}-/.test(s));
        m = img && img.match(/photo-(\d{10,}-[0-9a-f]+)/);
        return m ? m[1] : null;
      });
      if (!id) await sleep(2000);
    }
    if (id) { map[slug] = id; ok++; console.log(`  [${i + 1}/${todo.length}] ${slug} -> photo-${id}`); }
    else { failed.push(slug); console.log(`  [${i + 1}/${todo.length}] ${slug} -> no id (challenge/page issue)`); }
  } catch (e) {
    failed.push(slug);
    console.log(`  [${i + 1}/${todo.length}] ${slug} -> ERROR ${e.message}`);
  }
  writeFileSync(CACHE, JSON.stringify(map, null, 2));
  await sleep(2500);
}
await browser.close();
console.log(`\nresolved ${ok}/${todo.length}${failed.length ? `; still failed: ${failed.join(", ")}` : ""}`);
