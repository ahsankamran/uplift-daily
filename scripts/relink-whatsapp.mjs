// Re-link the WhatsApp device by scanning a QR code — the one manual step in
// the whole pipeline.
//
//   npm run relink
//
// Why this exists instead of just scanning send-whatsapp.mjs's terminal QR:
// that one is drawn in block characters, and any terminal with line spacing (or
// a font where the blocks don't tile into squares) stretches it vertically so a
// phone can never lock on. It also rotates every ~60s and the sender exits after
// 150s, so you get about two attempts before the process dies. Both of those
// cost us a two-month outage nobody could see.
//
// So: render the QR as a real PNG, open it in Preview, overwrite that same file
// each time WhatsApp rotates the code (Preview live-reloads), and wait as long
// as it takes. Scan it from the image, not the terminal.

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync, readFileSync, rmSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import QRCode from "qrcode";
import puppeteer from "puppeteer";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");
const OUT_DIR = resolve(REPO, "cards");
const QR_PNG = resolve(OUT_DIR, "whatsapp-qr.png");
const HEALTH = resolve(OUT_DIR, ".whatsapp-health.json");

mkdirSync(OUT_DIR, { recursive: true });

// Same stale-lock cleanup the sender does: a Chrome that didn't exit cleanly
// leaves Singleton* files behind and the next launch hangs on the loading
// screen forever.
const sessionDir = resolve(REPO, ".wwebjs_auth", "session");
if (existsSync(sessionDir)) {
  for (const f of readdirSync(sessionDir)) {
    if (f.startsWith("Singleton")) {
      try { rmSync(resolve(sessionDir, f), { force: true }); } catch {}
    }
  }
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
let opened = false;
let qrCount = 0;

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

client.on("qr", async (qr) => {
  qrCount++;
  // Big and high-contrast: this gets scanned off a monitor, sometimes at an
  // angle, so give the phone plenty of pixels to work with.
  await QRCode.toFile(QR_PNG, qr, { width: 900, margin: 3, errorCorrectionLevel: "M" });

  if (!opened) {
    opened = true;
    console.log(`\n  QR written to ${QR_PNG} — opening it in Preview.\n`);
    console.log("  On your phone: WhatsApp → Settings → Linked Devices →");
    console.log("  Link a Device → scan the image on screen.\n");
    console.log("  The code rotates about once a minute; the file updates in");
    console.log("  place and Preview reloads it, so just keep scanning whatever");
    console.log("  is on screen. No time limit — take as long as you need.\n");
    execFile("/usr/bin/open", [QR_PNG], () => {});
  } else {
    console.log(`  code refreshed (#${qrCount}) — Preview has the new one`);
  }
});

client.on("authenticated", () => {
  console.log("\n  authenticated — session saved to .wwebjs_auth/");
});

client.on("auth_failure", (m) => {
  console.error("\n  auth failure:", m);
  console.error("  The saved session is unusable. Delete .wwebjs_auth/ and re-run.");
  finish(3);
});

client.on("ready", async () => {
  let who = "";
  try { who = client.info?.wid?._serialized || ""; } catch {}
  console.log(`  ready — linked as ${who || "(unknown)"}`);

  // Record the link so the health check has a baseline from moment one.
  // MERGE, never overwrite: lastSendOk is the answer to "when did a paper
  // last actually arrive?", and clobbering it here would reset the staleness
  // clock to zero on every re-link — hiding the very outage this all exists
  // to surface.
  try {
    let cur = {};
    if (existsSync(HEALTH)) { try { cur = JSON.parse(readFileSync(HEALTH, "utf8")); } catch {} }
    writeFileSync(HEALTH, JSON.stringify({
      ...cur,
      lastLinkOk: new Date().toISOString(),
      state: "healthy",
      reason: null,
      wid: who,
    }, null, 2) + "\n");
  } catch {}

  try { rmSync(QR_PNG, { force: true }); } catch {}
  console.log("\n  Done. The daily job will pick up from here.\n");
  finish(0);
});

console.log("Connecting to WhatsApp Web…");
if (existsSync(sessionDir)) {
  console.log("(a saved session exists — if it is still valid this will go");
  console.log(" straight to 'ready' without ever showing a QR)");
}
client.initialize();
