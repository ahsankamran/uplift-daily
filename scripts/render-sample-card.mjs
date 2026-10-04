// Render a single one-off sample card from templates/card.html, for
// reviewing a candidate story (e.g. from a new edition's editor agent)
// before it's wired into daily automation. Not part of the daily pipeline —
// see render-cards.mjs / render-archive-cards.mjs for that.
//
//   node scripts/render-sample-card.mjs <editionLabel> <outSlug> <storyJsonPath>
//
// storyJsonPath must contain a JSON object: { cat, place, head, src, img }
// (same shape templates/card.html expects). Writes cards/_samples/<outSlug>.png

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const [editionLabel, outSlug, storyJsonPath] = process.argv.slice(2);
if (!editionLabel || !outSlug || !storyJsonPath) {
  console.error(
    "usage: node scripts/render-sample-card.mjs <editionLabel> <outSlug> <storyJsonPath>"
  );
  process.exit(1);
}

const story = JSON.parse(await fs.readFile(storyJsonPath, "utf8"));
for (const field of ["cat", "place", "head", "src", "img"]) {
  if (!story[field]) {
    console.error(`story JSON missing required field: ${field}`);
    process.exit(1);
  }
}

const outDir = path.join(ROOT, "cards", "_samples");
await fs.mkdir(outDir, { recursive: true });

const templateUrl = pathToFileURL(path.join(ROOT, "templates/card.html")).toString();

const payload = encodeURIComponent(
  JSON.stringify({ edition: editionLabel, date: story.date || "", n: 1, total: 1, story })
);

const browser = await puppeteer.launch({
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1 });
  await page.goto(`${templateUrl}?sample=${outSlug}#${payload}`, {
    waitUntil: "networkidle0",
    timeout: 30000,
  });
  await new Promise((r) => setTimeout(r, 400));
  const card = await page.$(".card");
  const outPath = path.join(outDir, `${outSlug}.png`);
  await card.screenshot({ path: outPath, type: "png" });
  console.log("wrote", path.relative(ROOT, outPath));
} finally {
  await browser.close();
}
