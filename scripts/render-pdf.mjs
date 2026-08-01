// Stitch the day's six feed cards into a single PDF — one card per page,
// edge to edge. The cards (cards/<date>/feed/{1..6}.png, 1080×1350) are our
// already-designed, photo-led layouts, so the PDF looks like a small printed
// edition rather than a reflowed webpage. Local-only, like the cards.
//
//   node scripts/render-pdf.mjs 2026-06-10
//   node scripts/render-pdf.mjs                # defaults to today (UTC)
//
// Runs after the cards in render-today-local.sh, so the PNGs already exist.

import puppeteer from "puppeteer";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");

const date = process.argv[2] || new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error(`bad date: "${date}" (expected YYYY-MM-DD)`);
  process.exit(1);
}

// Card geometry (matches the feed renderer).
const CARD_W = 1080;
const CARD_H = 1350;

// Inline each card as a base64 data URI. A page built with setContent has no
// file origin, so Chrome blocks file:// images (blank pages); data URIs avoid
// the origin issue entirely.
// Collect cards 1..6 in order, stopping at the first gap. Most editions have
// 6, but early ones (e.g. 2026-05-12) have fewer — render whatever exists.
const feedDir = resolve(REPO, "cards", date, "feed");
const cards = [];
for (let i = 1; i <= 6; i++) {
  const p = resolve(feedDir, `${i}.png`);
  if (!existsSync(p)) break;
  cards.push(`data:image/png;base64,${readFileSync(p).toString("base64")}`);
}
if (!cards.length) {
  console.error(`no feed cards for ${date} in ${feedDir} — render the cards first (render-archive-cards.mjs)`);
  process.exit(2);
}

const outPath = resolve(REPO, "cards", date, `uplift-${date}.pdf`);

// One image per page, sized exactly to the card so there is no margin or
// letterboxing. page-break-after on every page but the last.
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: ${CARD_W}px ${CARD_H}px; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .page { width: ${CARD_W}px; height: ${CARD_H}px; page-break-after: always; overflow: hidden; }
  .page:last-child { page-break-after: auto; }
  img { width: ${CARD_W}px; height: ${CARD_H}px; display: block; }
</style></head><body>
${cards.map((src) => `<div class="page"><img src="${src}"></div>`).join("\n")}
</body></html>`;

const browser = await puppeteer.launch({
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
try {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0", timeout: 60000 });
  await page.pdf({
    path: outPath,
    width: `${CARD_W}px`,
    height: `${CARD_H}px`,
    printBackground: true,
  });
  console.log(`wrote ${outPath} (${cards.length} cards)`);
} finally {
  await browser.close();
}
