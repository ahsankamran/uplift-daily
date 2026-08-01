// Render IG cards for ARCHIVED editions, photo-led.
//
// The published manifest (issues/index.json) only carries headlines + sources.
// The photographs and category/place kickers live in each issues/<date>.html.
// This script combines both: images + kicker (category · place) come from the
// HTML's "Today" section; headlines + sources come from the manifest (they align
// by index). Output: cards/<date>/{1..N}.png + caption.txt — exactly like
// render-cards.mjs, which it deliberately does not touch.
//
// Usage:
//   node scripts/render-archive-cards.mjs              # every edition in the manifest
//   node scripts/render-archive-cards.mjs 2026-06-06   # one date
//   node scripts/render-archive-cards.mjs 2026-06-01 2026-06-06   # explicit list

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

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

// Pull the "Today" section's images + kickers, in document order.
function parseIssueHtml(html) {
  const th = html.indexOf('aria-labelledby="today-h"');
  if (th < 0) return { imgs: [], kickers: [] };
  // The first 'yesterday-h' hit is a print-CSS rule; take the one AFTER today-h.
  let yh = html.indexOf('aria-labelledby="yesterday-h"', th + 1);
  if (yh < 0) yh = html.length;
  const seg = html.slice(th, yh);

  const imgs = [...seg.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  const kickers = [...seg.matchAll(/class="kicker"[^>]*>([\s\S]*?)<\/span>/g)].map(
    (m) => decodeEntities(m[1])
  );
  return { imgs, kickers };
}

function splitKicker(kicker) {
  // "Category · Place, Country" -> { cat, place }
  const parts = kicker.split(" · ");
  return { cat: parts[0] || "", place: parts.slice(1).join(" · ") };
}

async function buildIssue(date, manEntry) {
  const number = manEntry.edition || manEntry.number || "";

  // Newer manifests (DAILY.md format) carry a structured stories[] array with
  // everything we need — use it directly, no HTML parsing required.
  const structured = manEntry.stories;
  if (Array.isArray(structured) && structured.length && typeof structured[0] === "object") {
    const stories = structured.slice(0, 6).map((s) => ({
      cat: s.cat || s.category || "",
      place: s.place || s.location || "",
      head: s.head || s.headline || s.title || "",
      src: s.src || s.source || s.publication || "",
      img: s.img || s.image || s.photo || "",
    }));
    return {
      date,
      number,
      stories,
      counts: { imgs: stories.length, kickers: stories.length, heads: stories.length },
    };
  }

  // Older manifests are flat (headlines[] + sources[]); pull the photos and
  // category/place kickers out of the archived issue HTML and merge.
  const htmlPath = path.join(ROOT, "issues", `${date}.html`);
  const html = await fs.readFile(htmlPath, "utf8");
  const { imgs, kickers } = parseIssueHtml(html);

  const heads = manEntry.headlines || [];
  const srcs = manEntry.sources || [];
  const n = Math.min(
    heads.length || Infinity,
    imgs.length || Infinity,
    kickers.length || Infinity
  );
  if (!Number.isFinite(n) || n === 0) return null;

  const stories = [];
  for (let i = 0; i < n; i++) {
    const { cat, place } = splitKicker(kickers[i] || "");
    stories.push({
      cat,
      place,
      head: heads[i] || "",
      src: srcs[i] || "",
      img: imgs[i] || "",
    });
  }
  return {
    date,
    number,
    stories,
    counts: { imgs: imgs.length, kickers: kickers.length, heads: heads.length },
  };
}

// Instagram needs two sizes: a 4:5 feed card (carousel) and a 9:16 story card.
const FORMATS = [
  { name: "feed", width: 1080, height: 1350 },
  { name: "story", width: 1080, height: 1920 },
];

async function renderIssue(page, templateUrl, issue) {
  const dateDir = path.join(ROOT, "cards", issue.date);

  for (const fmt of FORMATS) {
    const outDir = path.join(dateDir, fmt.name);
    await fs.mkdir(outDir, { recursive: true });
    await page.setViewport({
      width: fmt.width,
      height: fmt.height,
      deviceScaleFactor: 1,
    });

    for (let i = 0; i < issue.stories.length; i++) {
      const payload = encodeURIComponent(
        JSON.stringify({
          edition: issue.number,
          date: issue.date,
          n: i + 1,
          total: issue.stories.length,
          format: fmt.name,
          story: issue.stories[i],
        })
      );
      // The query must change per render: a URL differing only in the
      // #fragment is a same-document navigation, so the template's inline
      // script would never re-run and every card would render story 1.
      await page.goto(`${templateUrl}?card=${i + 1}&fmt=${fmt.name}#${payload}`, {
        waitUntil: "networkidle0",
        timeout: 45000,
      });
      await new Promise((r) => setTimeout(r, 400));
      const card = await page.$(".card");
      await card.screenshot({
        path: path.join(outDir, `${i + 1}.png`),
        type: "png",
      });
    }
  }

  const outDir = dateDir;
  const lines = [];
  lines.push(`Six good things — ${issue.date}. ↓ swipe.`);
  lines.push("");
  issue.stories.forEach((s, i) => {
    lines.push(`${i + 1}. ${s.head} — via ${s.src}`);
  });
  lines.push("");
  lines.push("Full stories & original sources at uplift.daily (link in bio).");
  lines.push("");
  lines.push("#uplift #goodnews #quietkindness #smallwonders #everydayjoy");
  await fs.writeFile(path.join(outDir, "caption.txt"), lines.join("\n"));
}

async function main() {
  const raw = await fs.readFile(path.join(ROOT, "issues/index.json"), "utf8");
  const parsed = JSON.parse(raw);
  const list = Array.isArray(parsed) ? parsed : parsed.issues || [];
  const byDate = new Map(list.map((e) => [e.date, e]));

  const argv = process.argv.slice(2);
  const dates = (argv.length ? argv : [...byDate.keys()])
    .filter((d) => byDate.has(d))
    .sort();

  if (!dates.length) {
    console.error("No matching dates found in manifest.");
    process.exit(1);
  }

  const templateUrl = pathToFileURL(
    path.join(ROOT, "templates/card.html")
  ).toString();
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1 });

  let ok = 0,
    total = 0;
  for (const date of dates) {
    total++;
    try {
      const issue = await buildIssue(date, byDate.get(date));
      if (!issue) {
        console.log(`skip ${date} — no renderable stories`);
        continue;
      }
      const { imgs, kickers, heads } = issue.counts;
      const note =
        imgs === kickers && kickers === heads
          ? `${issue.stories.length} cards`
          : `${issue.stories.length} cards (imgs=${imgs} kickers=${kickers} heads=${heads})`;
      await renderIssue(page, templateUrl, issue);
      ok++;
      console.log(`✓ ${date} — ${note}`);
    } catch (err) {
      console.error(`✗ ${date} — ${err.message}`);
    }
  }

  await browser.close();
  console.log(`\nDone: ${ok}/${total} editions rendered into cards/`);
}

main().catch((err) => {
  console.error("Render failed:", err.message);
  console.error(err.stack);
  process.exit(1);
});
