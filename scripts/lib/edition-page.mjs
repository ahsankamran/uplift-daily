// Shared generator for a standalone single-story edition — used by both
// build-category-editions.mjs (the 6 categories derived from the combined
// digest, Phase 2) and build-single-story-edition.mjs (the 3 genuinely new
// categories, Phase 3). One story in, four files out:
//
//   editions/<slug>/index.html          today's story (overwritten each run)
//   editions/<slug>/issues/<date>.html  permanent permalink for that date
//   editions/<slug>/issues/index.json   manifest (new entry prepended)
//   editions/<slug>/archive.html        regenerated from the manifest
//
// Unlike the main site (which inlines the full shared.css into every page),
// these link it — one stylesheet, not N duplicated copies of it.

import fs from "node:fs/promises";
import path from "node:path";

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const FONT_LINK =
  '<link rel="preconnect" href="https://fonts.googleapis.com" />\n' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />\n' +
  '<link href="https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400;1,500&family=IBM+Plex+Sans:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />';

// Every page lives under editions/<slug>/, so every path is two params:
//   toRoot    — how to get back to the repo root (for shared.css, about.html, /index.html)
//   toEdition — how to get back to editions/<slug>/ itself (for Today/Archive)
// index.html and archive.html sit directly in editions/<slug>/, so toEdition
// is "". issues/<date>.html sits one level deeper, so toEdition is "../".

function head(title, toRoot) {
  return `<!doctype html>
<html lang="en" data-palette="paper" data-mark="quiet">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
${FONT_LINK}
<link rel="stylesheet" href="${toRoot}shared.css" />
<style>
.lead-story { max-width: 820px; margin: clamp(32px, 6vw, 72px) auto; }
/* .photo is an <a>, inline by default — aspect-ratio has no effect on a
   non-replaced inline box, so it must be made a block first. */
.lead-story .photo { display: block; aspect-ratio: 16/10; margin-bottom: clamp(18px, 2.6vw, 28px); border-radius: 2px; }
.lead-story .headline { font-size: clamp(32px, 5vw, 52px); }
.lead-story .dek { font-size: clamp(17px, 1.9vw, 20px); max-width: var(--measure); }
.edition-tag {
  display: inline-block; font-family: var(--sans); font-size: 11px;
  letter-spacing: 0.2em; text-transform: uppercase; color: var(--ink-mute);
  margin-bottom: 18px;
}
.archive-list { max-width: 780px; margin: clamp(24px, 4vw, 48px) auto; }
.archive-row {
  display: flex; gap: 20px; padding: 20px 0; border-bottom: 1px solid var(--rule-soft);
  align-items: baseline; justify-content: space-between;
}
.archive-row .date { font-family: var(--mono); font-size: 12px; color: var(--ink-mute); flex: 0 0 auto; }
.archive-row .head { flex: 1; }
.archive-row .head a { text-decoration: none; }
.archive-row .head a:hover { color: var(--accent-deep); }

/* The five stories behind the lead. align-items:start keeps rows from
   stretching to the tallest card; each card is its own column flow. */
.more-grid {
  display: grid; grid-template-columns: 1fr; gap: clamp(28px, 4vw, 44px);
  align-items: start;
  margin-bottom: clamp(40px, 6vw, 72px);
}
@media (min-width: 680px) { .more-grid { grid-template-columns: 1fr 1fr; } }
.more-card { display: flex; flex-direction: column; min-width: 0; }
.more-card .photo { display: block; aspect-ratio: 3/2; margin-bottom: 14px; border-radius: 2px; }
.more-card .headline { font-size: clamp(19px, 2.2vw, 23px); }
.more-card .dek { font-size: 15px; margin-top: 10px; }
.more-card .edition-tag { margin-bottom: 8px; font-size: 10.5px; letter-spacing: 0.16em; }
.more-card .byline { font-size: 10.5px; margin-top: 12px; }

/* Section switcher — the other categories, newspaper-style. */
.section-nav {
  border-top: 1px solid var(--rule-soft);
  border-bottom: 1px solid var(--rule-soft);
  padding: 12px var(--gutter);
  margin-bottom: clamp(20px, 3vw, 36px);
}
.section-nav-inner {
  max-width: 1240px; margin: 0 auto;
  display: flex; flex-wrap: wrap; gap: 6px 22px; align-items: baseline;
  font-family: var(--sans); font-size: 11px; letter-spacing: 0.14em;
  text-transform: uppercase;
}
.section-nav .label { color: var(--ink-mute); margin-right: 4px; }
.section-nav a { text-decoration: none; color: var(--ink-soft); }
.section-nav a:hover { color: var(--accent-deep); }
.section-nav a[aria-current="page"] { color: var(--ink); border-bottom: 1px solid var(--accent); }
</style>
</head>`;
}

// Every category links to every other — the point of sections is that you can
// move between them without going back to the front page first.
const SECTIONS = [
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

function sectionNav(currentSlug, toRoot) {
  const links = SECTIONS.map(
    (s) =>
      `      <a href="${toRoot}editions/${s.slug}/index.html"${
        s.slug === currentSlug ? ' aria-current="page"' : ""
      }>${esc(s.name)}</a>`
  ).join("\n");
  return `<nav class="section-nav">
    <div class="section-nav-inner">
      <span class="label">Sections</span>
${links}
    </div>
  </nav>`;
}

function masthead(displayName, activeLabel, toRoot, toEdition) {
  return `<header class="masthead">
  <div class="masthead-inner">
    <div class="masthead-utility">
      <a href="${toRoot}index.html">← Uplift</a>
      <span class="issue">${esc(displayName)}</span>
    </div>
    <div class="masthead-rule--thin"></div>
    <div class="wordmark-wrap">
      <p class="wordmark">${esc(displayName)}</p>
      <p class="tagline">One ${esc(displayName.toLowerCase())} story, every day.</p>
    </div>
  </div>
  <nav class="nav">
    <a href="${toEdition}index.html" aria-current="${activeLabel === "today" ? "page" : "false"}">Latest</a>
    <a href="${toEdition}archive.html" aria-current="${activeLabel === "archive" ? "page" : "false"}">Archive</a>
    <a href="${toRoot}index.html">Uplift home</a>
  </nav>
</header>`;
}

function footer(displayName, toRoot) {
  return `<footer class="foot">
  <div class="foot-inner">
    <div>${esc(displayName)} — part of <a href="${toRoot}index.html">Uplift</a></div>
    <div class="foot-links">
      <a href="${toRoot}about.html">About</a>
      <a href="${toRoot}index.html">All categories</a>
    </div>
  </div>
</footer>`;
}

function prettyDate(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y || !m || !d) return iso;
  const months = ["January","February","March","April","May","June","July",
                  "August","September","October","November","December"];
  return `${months[m - 1]} ${d}, ${y}`;
}

// The newest story, full width and photo-led.
function leadStory(s, { showDate = false } = {}) {
  return `  <article class="lead-story">
    <span class="edition-tag">${esc(s.cat)} · ${esc(s.place)}${showDate ? ` · ${esc(prettyDate(s.date))}` : ""}</span>
    <a class="photo" href="${esc(s.url)}" aria-label="Read: ${esc(s.head)}">
      <img src="${esc(s.img)}" alt="" loading="lazy" />
    </a>
    ${s.photographer ? `<div class="photo-credit">Photo: ${esc(s.photographer)}</div>` : ""}
    <h1 class="headline"><a href="${esc(s.url)}">${esc(s.head)}</a></h1>
    <p class="dek">${esc(s.summary)}</p>
    <div class="byline">
      <span>Source: ${esc(s.src)}</span>
      <span class="dot">·</span>
      <a href="${esc(s.url)}">Read the original →</a>
    </div>
  </article>`;
}

// The five behind it — smaller, two-up, still photo-led.
function moreStories(stories) {
  if (!stories.length) return "";
  const cards = stories
    .map(
      (s) => `    <article class="more-card">
      <a class="photo" href="${esc(s.url)}" aria-label="Read: ${esc(s.head)}">
        <img src="${esc(s.img)}" alt="" loading="lazy" />
      </a>
      <span class="edition-tag">${esc(s.place)} · ${esc(prettyDate(s.date))}</span>
      <h2 class="headline"><a href="${esc(s.url)}">${esc(s.head)}</a></h2>
      <p class="dek">${esc(s.summary)}</p>
      <div class="byline"><span>Source: ${esc(s.src)}</span></div>
    </article>`
    )
    .join("\n");
  return `
  <div class="section-label"><span>More in this category</span></div>
  <div class="more-grid">
${cards}
  </div>`;
}

const REQUIRED_FIELDS = ["date", "cat", "place", "head", "summary", "src", "url", "img"];

// root: absolute path to the repo root. slug: editions/<slug>/. displayName:
// e.g. "Open Hands". story: { date, cat, place, head, summary, src, url,
// img, photographer? }. Returns the final manifest (array) for convenience.
export async function buildEditionPages(root, slug, displayName, story) {
  for (const f of REQUIRED_FIELDS) {
    if (!story[f]) throw new Error(`story missing required field: ${f}`);
  }

  const editionDir = path.join(root, "editions", slug);
  const issuesDir = path.join(editionDir, "issues");
  await fs.mkdir(issuesDir, { recursive: true });

  // 1. issues/index.json first — index.html renders the newest six FROM the
  // manifest, so the manifest has to include today's story before we build it.
  const manifestPath = path.join(issuesDir, "index.json");
  let manifest = [];
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  } catch {
    manifest = [];
  }
  manifest = manifest.filter((e) => e.date !== story.date);
  manifest.unshift({ ...story });
  manifest.sort((a, b) => b.date.localeCompare(a.date));
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  // 2. index.html — a category front page: newest story as the lead, the five
  // behind it below. A one-story page read as thin; six gives the category
  // enough substance to stand on its own.
  const recent = manifest.slice(0, 6);
  const indexHtml = `${head(`${displayName} — ${recent[0].head}`, "../../")}
<body>
${masthead(displayName, "today", "../../", "")}
${sectionNav(slug, "../../")}
<main class="page page--narrow">
${leadStory(recent[0], { showDate: true })}
${moreStories(recent.slice(1))}
</main>
${footer(displayName, "../../")}
</body>
</html>
`;
  await fs.writeFile(path.join(editionDir, "index.html"), indexHtml);

  // 3. issues/<date>.html (permalink) — one story, exactly as published.
  const permalinkHtml = `${head(`${displayName} — ${story.date} — ${story.head}`, "../../../")}
<body>
${masthead(displayName, "archive", "../../../", "../")}
${sectionNav(slug, "../../../")}
<main class="page page--narrow">
${leadStory(story, { showDate: true })}
</main>
${footer(displayName, "../../../")}
</body>
</html>
`;
  await fs.writeFile(path.join(issuesDir, `${story.date}.html`), permalinkHtml);

  // 4. archive.html (regenerated from the manifest) — root is ../../, edition is ""
  const rows = manifest
    .map(
      (e) => `    <div class="archive-row">
      <span class="date">${esc(e.date)}</span>
      <span class="head"><a href="issues/${esc(e.date)}.html">${esc(e.head)}</a></span>
    </div>`
    )
    .join("\n");

  const archiveHtml = `${head(`${displayName} — Archive`, "../../")}
<body>
${masthead(displayName, "archive", "../../", "")}
${sectionNav(slug, "../../")}
<main class="page page--narrow">
  <div class="archive-list">
${rows}
  </div>
</main>
${footer(displayName, "../../")}
</body>
</html>
`;
  await fs.writeFile(path.join(editionDir, "archive.html"), archiveHtml);

  return {
    manifest,
    files: [
      path.relative(root, path.join(editionDir, "index.html")),
      path.relative(root, path.join(issuesDir, `${story.date}.html`)),
      path.relative(root, manifestPath),
      path.relative(root, path.join(editionDir, "archive.html")),
    ],
  };
}
