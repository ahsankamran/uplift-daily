// Backfill: send many edition PDFs to the WhatsApp target in ONE session.
//
//   node scripts/send-whatsapp-batch.mjs            # all cards/*/uplift-*.pdf, oldest→newest
//   node scripts/send-whatsapp-batch.mjs 2026-05-12 2026-05-13 ...   # specific dates
//
// Opens the WhatsApp session once and sends each PDF in order, waiting for the
// server to ack each upload before the next, with a pause between (gentle on
// WhatsApp's rate limits). Never run concurrently with send-whatsapp.mjs — two
// clients on one session contend and hang.

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync, readFileSync, rmSync, readdirSync } from "node:fs";
import pkg from "whatsapp-web.js";
const { Client, LocalAuth, MessageMedia } = pkg;
import puppeteer from "puppeteer";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");
const cardsDir = resolve(REPO, "cards");
const GAP_MS = 4000; // pause between sends

// Which dates: explicit args, else every date that has a rendered PDF.
let dates = process.argv.slice(2).filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
if (!dates.length) {
  dates = readdirSync(cardsDir)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && existsSync(resolve(cardsDir, d, `uplift-${d}.pdf`)))
    .sort();
}
if (!dates.length) { console.error("no edition PDFs found — run render-pdf.mjs first"); process.exit(2); }

const target = (() => {
  const p = resolve(REPO, "scripts", "whatsapp-target.json");
  if (existsSync(p)) { try { return JSON.parse(readFileSync(p, "utf8")).chatId || null; } catch {} }
  return null;
})();

// Clear stale browser locks (see send-whatsapp.mjs).
const sessionDir = resolve(REPO, ".wwebjs_auth", "session");
if (existsSync(sessionDir)) for (const f of readdirSync(sessionDir)) if (f.startsWith("Singleton")) try { rmSync(resolve(sessionDir, f), { force: true }); } catch {}

process.on("unhandledRejection", (err) => {
  const m = String(err?.message || err);
  if (m.includes("Target closed") || m.includes("Protocol error") || m.includes("Session closed")) return;
  console.error("unhandledRejection:", m);
});

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: resolve(REPO, ".wwebjs_auth") }),
  puppeteer: { executablePath: puppeteer.executablePath(), headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let done = false;
const finish = (code) => { if (done) return; done = true; Promise.resolve(client.destroy()).catch(() => {}).finally(() => process.exit(code)); };

client.on("authenticated", () => console.log("authenticated"));
client.on("auth_failure", (m) => { console.error("auth failure:", m); finish(3); });

client.on("ready", async () => {
  const dest = target || client.info.wid._serialized;
  console.log(`sending ${dates.length} editions to ${dest}\n`);
  const failed = [];
  for (let i = 0; i < dates.length; i++) {
    const d = dates[i];
    const pdf = resolve(cardsDir, d, `uplift-${d}.pdf`);
    const tag = `[${i + 1}/${dates.length}] ${d}`;
    if (!existsSync(pdf)) { console.log(`${tag} — no PDF, skipped`); failed.push(d); continue; }
    try {
      const media = MessageMedia.fromFilePath(pdf);
      const msg = await client.sendMessage(dest, media, { sendMediaAsDocument: true, caption: `Uplift — ${d}. Six good things.` });
      const id = msg.id?._serialized;
      let ack = msg.ack ?? 0;
      for (let k = 0; k < 45 && ack < 1; k++) { await sleep(2000); try { const fr = await client.getMessageById(id); ack = fr?.ack ?? ack; } catch {} }
      if (ack >= 1) console.log(`${tag} — sent (ack ${ack})`);
      else { console.log(`${tag} — upload NOT confirmed (ack ${ack})`); failed.push(d); }
    } catch (e) {
      console.log(`${tag} — error: ${e.message}`);
      failed.push(d);
    }
    if (i < dates.length - 1) await sleep(GAP_MS);
  }
  console.log(`\ndone: ${dates.length - failed.length}/${dates.length} sent` + (failed.length ? `; failed: ${failed.join(" ")}` : ""));
  finish(failed.length ? 7 : 0);
});

// Generous hard cap: ~30s/edition + slack.
setTimeout(() => { if (!done) { console.error("batch timed out"); finish(5); } }, dates.length * 30000 + 120000);
client.initialize();
