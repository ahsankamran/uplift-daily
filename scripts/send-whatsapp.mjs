// Send the day's edition PDF to yourself on WhatsApp.
//
// Uses whatsapp-web.js, which drives WhatsApp Web in headless Chrome and acts
// as a linked device on your account. The session is saved under .wwebjs_auth/
// (gitignored) so this only needs an interactive QR scan once.
//
//   node scripts/send-whatsapp.mjs 2026-06-10
//   node scripts/send-whatsapp.mjs                # defaults to today (UTC)
//
// First run: a QR code prints in the terminal — open WhatsApp on your phone →
// Settings → Linked Devices → Link a Device, and scan it. Every run after that
// is automatic. Called by render-today-local.sh after the PDF is built.
//
// Note: this is unofficial automation (against WhatsApp's ToS). Fine for
// sending to your own account; don't point it at strangers.

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync, readFileSync, rmSync, readdirSync } from "node:fs";
import pkg from "whatsapp-web.js";
const { Client, LocalAuth, MessageMedia } = pkg;
import qrcode from "qrcode-terminal";
import puppeteer from "puppeteer";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");

const date = process.argv[2] || new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error(`bad date: "${date}" (expected YYYY-MM-DD)`);
  process.exit(1);
}

const pdfPath = resolve(REPO, "cards", date, `uplift-${date}.pdf`);
if (!existsSync(pdfPath)) {
  console.error(`no PDF for ${date} at ${pdfPath} — run render-pdf.mjs first`);
  process.exit(2);
}

// A previous run whose Chrome didn't exit cleanly leaves Singleton* lock files
// in the session dir; on the next launch the restored WhatsApp Web then gets
// stuck on the loading screen and never fires "ready" (the send silently times
// out). No browser is running at this point, so clearing stale locks is safe
// and makes each run self-healing.
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
const finish = (code) => {
  if (done) return;
  done = true;
  Promise.resolve(client.destroy()).catch(() => {}).finally(() => process.exit(code));
};

// Tearing down headless Chrome can emit a late "Target closed" protocol error
// after we've already decided to exit. It's harmless noise — don't let it crash
// the process (which would look like a failure to the shell wrapper).
process.on("unhandledRejection", (err) => {
  const m = String(err?.message || err);
  if (m.includes("Target closed") || m.includes("Protocol error") || m.includes("Session closed")) return;
  console.error("unhandledRejection:", m);
});

client.on("qr", (qr) => {
  console.log("\nScan this with WhatsApp → Linked Devices → Link a Device:\n");
  qrcode.generate(qr, { small: true });
});

client.on("authenticated", () => console.log("authenticated — session saved"));
client.on("auth_failure", (m) => { console.error("auth failure:", m); finish(3); });

// Destination: a chat ID from scripts/whatsapp-target.json (a personal group —
// reliable + notifies). Falls back to your own number, but self-chat sends
// don't reliably surface in the WhatsApp app, so the group is strongly
// preferred. Set it with: { "chatId": "...@g.us" }
let target = null;
const cfgPath = resolve(REPO, "scripts", "whatsapp-target.json");
if (existsSync(cfgPath)) {
  try { target = JSON.parse(readFileSync(cfgPath, "utf8")).chatId || null; } catch {}
}

client.on("ready", async () => {
  try {
    const dest = target || client.info.wid._serialized;
    const media = MessageMedia.fromFilePath(pdfPath);
    const caption = `Uplift — ${date}. Six good things.`;
    const msg = await client.sendMessage(dest, media, {
      sendMediaAsDocument: true,
      caption,
    });
    // sendMessage resolves as soon as the message is QUEUED, but a multi-MB
    // document keeps uploading afterward. Destroying the browser right away
    // (the original bug) aborts that upload — "sent" prints but the doc never
    // arrives, while a tiny text message uploads instantly and does. So wait
    // until the server acknowledges the message (ack >= 1) before exiting.
    const id = msg.id?._serialized;
    let ack = msg.ack ?? 0;
    for (let i = 0; i < 45 && ack < 1; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try { const fresh = await client.getMessageById(id); ack = fresh?.ack ?? ack; } catch {}
    }
    if (ack >= 1) {
      console.log(`sent uplift-${date}.pdf to ${dest} (ack ${ack})`);
      finish(0);
    } else {
      console.error(`upload not confirmed for uplift-${date}.pdf (ack ${ack}) — not marking sent`);
      finish(6);
    }
  } catch (err) {
    console.error("send failed:", err);
    finish(4);
  }
});

// Single clean attempt with a hard cap. Restoring a saved session occasionally
// stalls after "authenticated" and never reaches "ready"; rather than restart
// the browser in-process (which races teardown and crashes), we just exit
// non-zero and let the shell wrapper retry with a fresh process — a cleaner
// reset. Exit 5 = stalled/timeout (retryable); the wrapper distinguishes it.
setTimeout(() => {
  if (!done) { console.error("timed out before send (session stalled or needs re-link)"); finish(5); }
}, 150 * 1000);

client.initialize();
