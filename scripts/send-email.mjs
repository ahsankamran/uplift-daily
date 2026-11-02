// Email an edition (or several) via Resend.
//
//   node scripts/send-email.mjs 2026-11-01
//   node scripts/send-email.mjs 2026-10-04 2026-11-01
//   node scripts/send-email.mjs --since 2026-10-01
//   node scripts/send-email.mjs --latest
//   node scripts/send-email.mjs --latest --dry-run     # render, don't send
//
// Needs RESEND_API_KEY in the environment. Destination comes from
// scripts/email-target.json ({"to": "..."}), which is gitignored.
//
// Deliberately a plain HTTPS POST with no SDK: this channel exists because
// WhatsApp's unofficial library broke against a server-side change and
// stayed broken. Fewer moving parts between us and the transport is the
// entire point. Images are referenced by their public Unsplash CDN URL
// rather than attached, so the message stays small and renders in any
// client that loads remote images.
//
// Exit: 0 all sent · 1 send failure · 2 nothing to send / misconfigured

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry-run");
const FROM = process.env.RESEND_FROM || "Uplift <onboarding@resend.dev>";

const manifest = JSON.parse(readFileSync(resolve(REPO, "issues", "index.json"), "utf8"));
const all = (Array.isArray(manifest) ? manifest : manifest.issues || [])
  .filter((e) => Array.isArray(e.stories) && e.stories.length)
  .sort((a, b) => a.date.localeCompare(b.date));

if (!all.length) {
  console.error("no editions with stories[] in issues/index.json — nothing to send");
  process.exit(2);
}

// Selectors are mutually exclusive and --since is validated. Previously
// they were applied in sequence so the last one silently won: passing an
// explicit date alongside --since discarded the date, and `--since
// --latest` made every ISO date compare >= "--latest", selecting the
// ENTIRE archive. Verified: that combination queued 92 messages.
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const explicit = argv.filter((a) => ISO.test(a));
const wantsLatest = argv.includes("--latest");
const sinceIdx = argv.indexOf("--since");
const sinceVal = sinceIdx !== -1 ? argv[sinceIdx + 1] : null;

const selectors = [explicit.length ? "dates" : null, wantsLatest ? "--latest" : null,
                   sinceIdx !== -1 ? "--since" : null].filter(Boolean);
if (selectors.length > 1) {
  console.error(`choose one selector, got ${selectors.length}: ${selectors.join(", ")}`);
  process.exit(2);
}

let dates = [];
if (explicit.length) {
  dates = explicit;
} else if (wantsLatest) {
  dates = [all[all.length - 1].date];
} else if (sinceIdx !== -1) {
  if (!sinceVal || !ISO.test(sinceVal)) {
    console.error(`--since needs a YYYY-MM-DD date, got ${sinceVal === undefined ? "nothing" : `"${sinceVal}"`}`);
    process.exit(2);
  }
  dates = all.filter((e) => e.date >= sinceVal).map((e) => e.date);
}

if (!dates.length) {
  console.error("usage: send-email.mjs <date>... | --since <YYYY-MM-DD> | --latest  [--dry-run]");
  process.exit(2);
}

// A bulk send is almost never intended interactively; make it deliberate.
const BULK = 5;
if (dates.length > BULK && !DRY && process.env.ALLOW_BULK !== "1") {
  console.error(`refusing to send ${dates.length} emails in one run (limit ${BULK}).`);
  console.error("re-run with --dry-run to preview, or ALLOW_BULK=1 to proceed.");
  process.exit(2);
}

let to = null;
const cfg = resolve(REPO, "scripts", "email-target.json");
if (existsSync(cfg)) {
  try { to = JSON.parse(readFileSync(cfg, "utf8")).to || null; } catch {}
}
if (!to) {
  console.error('no destination — set {"to": "..."} in scripts/email-target.json');
  process.exit(2);
}

const KEY = process.env.RESEND_API_KEY;
if (!KEY && !DRY) {
  console.error("RESEND_API_KEY is not set. Export it, or re-run with --dry-run to preview.");
  process.exit(2);
}

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const SITE = "https://ahsankamran.github.io/uplift-daily";

// issues/index.json stores only the headline per story (that is what
// DAILY.md's manifest shape specifies); the three-sentence summary exists
// only in the hand-authored issues/<date>.html, as <p class="dek"> inside
// the "today" section. Without this the email is a list of headlines with
// no body, which is not a newsletter. Same extraction as
// build-category-editions.mjs, matched by kicker rather than array order.
function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&ndash;/g, "–").replace(/&mdash;/g, "—")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .trim();
}

function summariesFor(date) {
  const p = resolve(REPO, "issues", `${date}.html`);
  if (!existsSync(p)) return new Map();
  const html = readFileSync(p, "utf8");
  const th = html.indexOf('aria-labelledby="today-h"');
  if (th < 0) return new Map();
  let yh = html.indexOf('aria-labelledby="yesterday-h"', th + 1);
  if (yh < 0) yh = html.length;
  const seg = html.slice(th, yh);
  const kickers = [...seg.matchAll(/class="kicker"[^>]*>([\s\S]*?)<\/span>/g)].map((m) => decodeEntities(m[1]));
  const deks = [...seg.matchAll(/class="dek"[^>]*>([\s\S]*?)<\/p>/g)].map((m) =>
    decodeEntities(m[1].replace(/<[^>]+>/g, ""))
  );
  const out = new Map();
  kickers.forEach((k, i) => { if (deks[i]) out.set(k, deks[i]); });
  return out;
}

function prettyDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["January","February","March","April","May","June","July",
                  "August","September","October","November","December"];
  return `${months[m - 1]} ${d}, ${y}`;
}

function render(entry) {
  const deks = summariesFor(entry.date);
  const stories = entry.stories
    .map((s) => {
      const summary = s.summary || deks.get([s.cat, s.place].filter(Boolean).join(" · ")) || "";
      return `
      <tr><td style="padding:0 0 34px;">
        <a href="${esc(s.url)}" style="text-decoration:none;color:inherit;">
          <img src="${esc(s.img)}" width="560" alt=""
               style="width:100%;max-width:560px;height:auto;display:block;border-radius:2px;margin-bottom:14px;" />
        </a>
        <div style="font:500 11px/1.4 'Helvetica Neue',Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:#9a7b53;margin-bottom:8px;">
          ${esc(s.cat)}${s.place ? ` &middot; ${esc(s.place)}` : ""}
        </div>
        <a href="${esc(s.url)}" style="text-decoration:none;">
          <h2 style="margin:0 0 10px;font:500 23px/1.25 Georgia,'Times New Roman',serif;color:#241f17;">${esc(s.head)}</h2>
        </a>
        ${summary ? `<p style="margin:0 0 10px;font:400 15px/1.6 Georgia,serif;color:#4a4136;">${esc(summary)}</p>` : ""}
        <div style="font:400 11px/1.4 'Helvetica Neue',Arial,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#8a7f70;">
          <a href="${esc(s.url)}" style="color:#9a6b3f;text-decoration:none;">${esc(s.src)} &rarr;</a>
        </div>
      </td></tr>`;
    })
    .join("");

  return `<!doctype html><html><body style="margin:0;padding:0;background:#f7f4ed;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ed;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="padding-bottom:6px;font:400 34px/1 Georgia,serif;letter-spacing:.14em;text-transform:uppercase;color:#241f17;">Uplift</td></tr>
        <tr><td style="padding-bottom:26px;border-bottom:1px solid #d9cfc0;font:italic 400 14px/1.5 Georgia,serif;color:#6b6052;">
          Six good things &middot; ${esc(prettyDate(entry.date))}${entry.edition ? ` &middot; Edition ${esc(String(entry.edition))}` : ""}
        </td></tr>
        <tr><td style="height:30px;"></td></tr>
        ${stories}
        <tr><td style="border-top:1px solid #d9cfc0;padding-top:18px;font:400 11px/1.6 'Helvetica Neue',Arial,sans-serif;letter-spacing:.08em;color:#8a7f70;">
          <a href="${SITE}/issues/${esc(entry.date)}.html" style="color:#9a6b3f;text-decoration:none;">Read this edition on the web</a>
          &nbsp;&middot;&nbsp;
          <a href="${SITE}/" style="color:#9a6b3f;text-decoration:none;">All editions</a>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

let sent = 0, failed = 0;
for (const date of dates) {
  const entry = all.find((e) => e.date === date);
  if (!entry) { console.error(`✗ ${date} — no edition in the manifest`); failed++; continue; }

  const subject = `Uplift${entry.edition ? ` ${entry.edition}` : ""} — ${prettyDate(date)}`;
  const html = render(entry);

  if (DRY) {
    console.log(`[dry-run] ${date}: "${subject}" -> ${to} (${entry.stories.length} stories, ${html.length} bytes)`);
    for (const s of entry.stories) console.log(`    ${s.cat}: ${s.head}`);
    continue;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], subject, html }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      console.log(`✓ ${date} sent (id ${body.id || "?"})`);
      sent++;
    } else {
      console.error(`✗ ${date} — HTTP ${res.status}: ${body.message || JSON.stringify(body).slice(0, 200)}`);
      failed++;
    }
  } catch (err) {
    console.error(`✗ ${date} — ${err.message}`);
    failed++;
  }
}

console.log(DRY ? `\n${dates.length} previewed (nothing sent)` : `\n${sent} sent, ${failed} failed`);
process.exit(failed ? 1 : 0);
