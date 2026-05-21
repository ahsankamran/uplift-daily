// Render today's 6 IG cards from templates/card.html → cards/YYYY-MM-DD/{1..6}.png
//
// Usage:
//   node scripts/render-cards.mjs            # uses today's UTC date
//   node scripts/render-cards.mjs 2026-05-21 # uses given date
//
// Reads the latest entry from issues/index.json (or the entry matching the
// passed date) and screenshots templates/card.html once per story at 1080x1350.
//
// Also writes cards/YYYY-MM-DD/caption.txt — a paste-ready Instagram caption.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const dateArg = process.argv[2] || new Date().toISOString().slice(0, 10);

async function main() {
  const manifest = JSON.parse(
    await fs.readFile(path.join(ROOT, "issues/index.json"), "utf8")
  );
  const issue =
    manifest.issues.find((i) => i.date === dateArg) || manifest.issues[0];
  if (!issue) throw new Error(`No issue found for ${dateArg}`);
  const stories = (issue.stories || []).slice(0, 6);
  if (!stories.length) throw new Error("Issue has no stories");

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

  for (let i = 0; i < stories.length; i++) {
    const s = stories[i];
    // Pass story data via URL hash so the template can read it without a server.
    const payload = encodeURIComponent(
      JSON.stringify({
        edition: issue.number,
        date: issue.date,
        n: i + 1,
        total: stories.length,
        story: s,
      })
    );
    const url = `${templateUrl}#${payload}`;
    await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
    // Give web fonts a moment to render
    await new Promise((r) => setTimeout(r, 400));
    const card = await page.$(".card");
    const fname = path.join(outDir, `${i + 1}.png`);
    await card.screenshot({ path: fname, type: "png" });
    console.log("wrote", path.relative(ROOT, fname));
  }

  await browser.close();

  // Build caption
  const lines = [];
  lines.push(`Six good things — ${issue.date}. ↓ swipe.`);
  lines.push("");
  stories.forEach((s, i) => {
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
  console.error(err);
  process.exit(1);
});
