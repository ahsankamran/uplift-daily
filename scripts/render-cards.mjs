// Render today's 6 IG cards from templates/card.html → cards/YYYY-MM-DD/{1..6}.png
//
// Usage:
//   node scripts/render-cards.mjs            # uses today's UTC date
//   node scripts/render-cards.mjs 2026-05-21 # uses given date
//
// Tolerant of a few manifest shapes:
//   - { issues: [ {date, number, stories: [...]}, ... ] }
//   - [ {date, number, stories: [...]}, ... ]              (bare array)
//   - { entries: [...] } / { editions: [...] } / etc.
//
// Stories on each issue may be under any of:
//   stories | items | headlines | entries
//
// Each story may use any of:
//   cat | category   |   place | location | where
//   head | headline | title    |   src | source | publication
//   img | image | photo

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const dateArg = process.argv[2] || new Date().toISOString().slice(0, 10);

function pick(obj, keys) {
  for (const k of keys) if (obj && obj[k] != null) return obj[k];
  return undefined;
}

async function loadIssue() {
  const raw = await fs.readFile(path.join(ROOT, "issues/index.json"), "utf8");
  const parsed = JSON.parse(raw);
  let list = Array.isArray(parsed)
    ? parsed
    : pick(parsed, ["issues", "entries", "editions", "items"]) || null;
  if (!list) throw new Error("Cannot find issue list in issues/index.json");

  // Sort so newest is first (defensive — manifest may or may not already be ordered)
  list = [...list].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const match = list.find((i) => i.date === dateArg) || list[0];
  if (!match) throw new Error(`No issue found for ${dateArg}`);

  const storiesRaw =
    pick(match, ["stories", "items", "entries"]) || null;

  let stories;
  if (storiesRaw && Array.isArray(storiesRaw) && typeof storiesRaw[0] === "object") {
    // Structured format: [{cat, place, head, src, img}, ...]
    stories = storiesRaw.slice(0, 6).map((s) => ({
      cat: pick(s, ["cat", "category"]) || "",
      place: pick(s, ["place", "location", "where"]) || "",
      head: pick(s, ["head", "headline", "title"]) || "",
      src: pick(s, ["src", "source", "publication"]) || "",
      img: pick(s, ["img", "image", "photo"]) || "",
    }));
  } else {
    // Flat format fallback: separate headlines[] + sources[] arrays
    const heads = match.headlines || [];
    const srcs = match.sources || [];
    stories = heads.slice(0, 6).map((h, i) => ({
      cat: "",
      place: "",
      head: h || "",
      src: srcs[i] || "",
      img: "",
    }));
  }
  return {
    date: match.date || dateArg,
    number: match.number || match.edition || match.no || "",
    stories,
  };
}

async function main() {
  const issue = await loadIssue();
  if (!issue.stories.length) {
    console.log("No stories for", issue.date, "- skipping card render");
    return;
  }

  const outDir = path.join(ROOT, "cards", issue.date);
  await fs.mkdir(outDir, { recursive: true });

  const templateUrl = pathToFileURL(
    path.join(ROOT, "templates/card.html")
  ).toString();

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1 });

  for (let i = 0; i < issue.stories.length; i++) {
    const s = issue.stories[i];
    const payload = encodeURIComponent(
      JSON.stringify({
        edition: issue.number,
        date: issue.date,
        n: i + 1,
        total: issue.stories.length,
        story: s,
      })
    );
    await page.goto(`${templateUrl}?v=${i}#${payload}`, {
      waitUntil: "networkidle0",
      timeout: 30000,
    });
    await new Promise((r) => setTimeout(r, 400));
    const card = await page.$(".card");
    const fname = path.join(outDir, `${i + 1}.png`);
    await card.screenshot({ path: fname, type: "png" });
    console.log("wrote", path.relative(ROOT, fname));
  }

  await browser.close();

  // Caption
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
  console.log("wrote", path.relative(ROOT, path.join(outDir, "caption.txt")));
}

main().catch((err) => {
  console.error("Card render failed:", err.message);
  console.error(err.stack);
  process.exit(1);
});
