// Is the WhatsApp link alive? Connect, confirm, record — send nothing.
//
//   node scripts/whatsapp-health.mjs
//
// This exists because the failure it guards against was invisible for two
// months. The chain: a stale-checkout bug made the daily job exit before ever
// reaching the WhatsApp step → the session sat unused → WhatsApp unlinks
// devices idle for ~14 days → the link died on its own → and by the time the
// checkout bug was fixed there was nothing left to send with.
//
// Every link in that chain depended on session health being checked only as a
// side effect of publishing an edition. So this check is deliberately
// independent: it runs whether or not an edition exists, whether or not cards
// rendered, whether or not the repo synced. Two things follow.
//
//   1. Connecting daily keeps the session warm, which prevents the 14-day idle
//      unlink outright — the root cause, not the symptom.
//   2. A dead link is detected the same day, not on day 63.
//
// Exit: 0 healthy · 7 needs re-link (human must scan) · 5 stalled/unknown

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync, readFileSync, writeFileSync, rmSync, readdirSync, mkdirSync } from "node:fs";
import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import puppeteer from "puppeteer";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");
const HEALTH = resolve(REPO, "cards", ".whatsapp-health.json");

mkdirSync(resolve(REPO, "cards"), { recursive: true });

function readHealth() {
  if (!existsSync(HEALTH)) return {};
  try { return JSON.parse(readFileSync(HEALTH, "utf8")); } catch { return {}; }
}
function recordHealth(patch) {
  try { writeFileSync(HEALTH, JSON.stringify({ ...readHealth(), ...patch }, null, 2) + "\n"); } catch {}
}

const sessionDir = resolve(REPO, ".wwebjs_auth", "session");
if (existsSync(sessionDir)) {
  for (const f of readdirSync(sessionDir)) {
    if (f.startsWith("Singleton")) {
      try { rmSync(resolve(sessionDir, f), { force: true }); } catch {}
    }
  }
}

// No saved session at all — no point starting Chrome to be told so.
if (!existsSync(sessionDir)) {
  console.error("NEEDS RELINK: no saved WhatsApp session (.wwebjs_auth/session missing)");
  recordHealth({ lastCheck: new Date().toISOString(), state: "needs-relink", reason: "no session on disk" });
  process.exit(7);
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
  console.error("NEEDS RELINK: WhatsApp asked for a QR — the saved session is dead.");
  recordHealth({ lastCheck: new Date().toISOString(), state: "needs-relink", reason: "server requested QR" });
  finish(7);
});

client.on("auth_failure", (m) => {
  console.error("NEEDS RELINK: auth failure:", m);
  recordHealth({ lastCheck: new Date().toISOString(), state: "needs-relink", reason: `auth failure: ${m}` });
  finish(7);
});

client.on("ready", () => {
  let who = "";
  try { who = client.info?.wid?._serialized || ""; } catch {}
  const now = new Date().toISOString();
  console.log(`healthy — session live${who ? ` as ${who}` : ""}`);
  recordHealth({ lastCheck: now, lastLinkOk: now, state: "healthy", reason: null, wid: who || undefined });
  finish(0);
});

// Shorter cap than the sender's: this only has to reach "ready", with no
// multi-MB upload to wait on. A stall here is inconclusive rather than fatal —
// report it as unknown (5), not as needs-relink, so a flaky connection can
// never trigger a spurious "go scan a QR" alarm at someone.
setTimeout(() => {
  if (!done) {
    console.error("health check stalled before ready — inconclusive");
    recordHealth({ lastCheck: new Date().toISOString(), state: "stalled", reason: "no ready event within 90s" });
    finish(5);
  }
}, 90 * 1000);

client.initialize();
