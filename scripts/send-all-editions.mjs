// Send every edition for a date over ONE WhatsApp connection.
//
//   node scripts/send-all-editions.mjs            # today (UTC)
//   node scripts/send-all-editions.mjs 2026-10-04
//   node scripts/send-all-editions.mjs 2026-10-04 --dry-run
//
// Deliberately one client for all ten sends, not ten clients: restoring a
// saved session is the slow, failure-prone part, and CLAUDE.md is explicit
// that two WhatsApp clients on one session contend and hang. Connect once,
// send sequentially, tear down once.
//
// Per-edition markers (cards/<date>/.sent-<slug>) mean a re-run only sends
// what didn't land, so a partial failure is resumable rather than a choice
// between duplicates and gaps.
//
// Exit codes: 0 all sent (or already marked) · 5 stalled · 7 needs re-link
//             4 one or more sends failed

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import pkg from "whatsapp-web.js";
const { Client, LocalAuth, MessageMedia } = pkg;
import puppeteer from "puppeteer";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const date = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) || new Date().toISOString().slice(0, 10);

const CATEGORIES = [
  { slug: "quiet-kindness", name: "Quiet Kindness" },
  { slug: "small-wonders", name: "Small Wonders" },
  { slug: "everyday-joy", name: "Everyday Joy" },
  { slug: "nature", name: "Nature" },
  { slug: "science-medicine", name: "Science & Medicine" },
  { slug: "global-progress", name: "Global Progress" },
  { slug: "coming-together", name: "Coming Together" },
  { slug: "open-hands", name: "Open Hands" },
  { slug: "human-spirit", name: "Human Spirit" },
];

// ---- work out what there is to send -----------------------------------
const jobs = [];

// 1. The combined digest, as the PDF of its six feed cards.
const pdf = resolve(REPO, "cards", date, `uplift-${date}.pdf`);
if (existsSync(pdf)) {
  let edition = "";
  try {
    const man = JSON.parse(readFileSync(resolve(REPO, "issues", "index.json"), "utf8"));
    const list = Array.isArray(man) ? man : man.issues || [];
    const e = list.find((x) => x.date === date);
    edition = e ? e.edition || e.number || "" : "";
  } catch {}
  jobs.push({
    slug: "combined",
    file: pdf,
    asDocument: true,
    caption: `Uplift${edition ? ` — Edition ${edition}` : ""} · ${date}\nSix good things.`,
  });
}

// 2. Each category edition, as its rendered card.
for (const c of CATEGORIES) {
  const card = resolve(REPO, "cards", "_samples", `${c.slug}.png`);
  const manifestPath = resolve(REPO, "editions", c.slug, "issues", "index.json");
  if (!existsSync(card) || !existsSync(manifestPath)) continue;
  let entry = null;
  try {
    entry = JSON.parse(readFileSync(manifestPath, "utf8"))[0] || null;
  } catch {}
  if (!entry) continue;
  // The date is already in the caption, so say what's actually useful:
  // that this edition has no story for the requested date yet.
  const stale = entry.date !== date ? `\n(no new edition for ${date} — showing the latest)` : "";
  jobs.push({
    slug: c.slug,
    file: card,
    asDocument: false,
    caption: `Uplift: ${c.name} · ${entry.date}\n${entry.head}\nSource: ${entry.src}${stale}`,
  });
}

if (!jobs.length) {
  console.error(`nothing to send for ${date}`);
  process.exit(2);
}

// Skip anything already delivered.
const markerDir = resolve(REPO, "cards", date);
mkdirSync(markerDir, { recursive: true });
const pending = jobs.filter((j) => !existsSync(resolve(markerDir, `.sent-${j.slug}`)));

console.log(`${date}: ${jobs.length} edition(s), ${pending.length} not yet sent`);
for (const j of pending) console.log(`  - ${j.slug}`);
if (!pending.length) {
  console.log("everything already marked sent — nothing to do");
  process.exit(0);
}
if (DRY) {
  console.log("\n--dry-run: stopping before connecting to WhatsApp");
  for (const j of pending) console.log(`\n[${j.slug}]\n${j.caption}`);
  process.exit(0);
}

// ---- destination -------------------------------------------------------
let target = null;
const cfg = resolve(REPO, "scripts", "whatsapp-target.json");
if (existsSync(cfg)) {
  try { target = JSON.parse(readFileSync(cfg, "utf8")).chatId || null; } catch {}
}

// A previous run whose Chrome didn't exit cleanly leaves Singleton* locks;
// the restored session then hangs on the loading screen and never fires
// "ready". No browser is running at this point, so clearing them is safe.
const sessionDir = resolve(REPO, ".wwebjs_auth", "session");
if (existsSync(sessionDir)) {
  for (const f of readdirSync(sessionDir)) {
    if (f.startsWith("Singleton")) {
      try { rmSync(resolve(sessionDir, f), { force: true }); } catch {}
    }
  }
}

const HEALTH = resolve(REPO, "cards", ".whatsapp-health.json");
function recordHealth(patch) {
  try {
    let cur = {};
    if (existsSync(HEALTH)) { try { cur = JSON.parse(readFileSync(HEALTH, "utf8")); } catch {} }
    writeFileSync(HEALTH, JSON.stringify({ ...cur, ...patch }, null, 2) + "\n");
  } catch {}
}

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: resolve(REPO, ".wwebjs_auth") }),
  puppeteer: {
    executablePath: puppeteer.executablePath(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

let done = false;
const finish = (code) => {
  if (done) return;
  done = true;
  Promise.resolve(client.destroy()).catch(() => {}).finally(() => process.exit(code));
};

process.on("unhandledRejection", (err) => {
  const m = String(err?.message || err);
  if (m.includes("Target closed") || m.includes("Protocol error") || m.includes("Session closed")) return;
  console.error("unhandledRejection:", m);
});

client.on("qr", () => {
  console.error("NEEDS RELINK: WhatsApp session is no longer valid (server asked for a QR).");
  console.error("Fix: run  npm run relink  and scan the QR that opens in Preview.");
  finish(7);
});
client.on("authenticated", () => console.log("authenticated"));
client.on("auth_failure", (m) => { console.error("auth failure:", m); finish(3); });

client.on("ready", async () => {
  const dest = target || client.info.wid._serialized;
  let sent = 0, failed = 0;

  for (const job of pending) {
    try {
      const media = MessageMedia.fromFilePath(job.file);
      const msg = await client.sendMessage(dest, media, {
        sendMediaAsDocument: job.asDocument,
        caption: job.caption,
      });
      // sendMessage resolves once QUEUED; a multi-MB document keeps
      // uploading after that. Wait for the server ack before moving on,
      // or tearing down at the end aborts the last upload.
      const id = msg.id?._serialized;
      let ack = msg.ack ?? 0;
      for (let i = 0; i < 30 && ack < 1; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        try { const fresh = await client.getMessageById(id); ack = fresh?.ack ?? ack; } catch {}
      }
      if (ack >= 1) {
        writeFileSync(resolve(markerDir, `.sent-${job.slug}`), new Date().toISOString() + "\n");
        console.log(`  ✓ ${job.slug} (ack ${ack})`);
        sent++;
      } else {
        console.error(`  ✗ ${job.slug} — upload not confirmed (ack ${ack}), not marking sent`);
        failed++;
      }
    } catch (err) {
      console.error(`  ✗ ${job.slug} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\n${sent} sent, ${failed} failed`);
  if (sent) recordHealth({ lastSendOk: new Date().toISOString(), lastSendDate: date });
  finish(failed ? 4 : 0);
});

// Generous cap: ten uploads over one session legitimately takes minutes.
setTimeout(() => {
  if (!done) { console.error("timed out — retryable"); finish(5); }
}, 10 * 60 * 1000);

client.initialize();
