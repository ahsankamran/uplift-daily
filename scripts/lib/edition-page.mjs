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
.lead-story .photo { aspect-ratio: 16/10; margin-bottom: clamp(18px, 2.6vw, 28px); border-radius: 2px; }
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
</style>
</head>`;
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
    <a href="${toEdition}index.html" aria-current="${activeLabel === "today" ? "page" : "false"}">Today</a>
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

function storyBlock(s) {
  return `<main class="page page--narrow">
  <article class="lead-story">
    <span class="edition-tag">${esc(s.cat)} · ${esc(s.place)}</span>
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
  </article>
</main>`;
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

  // 1. index.html (today) — lives in editions/<slug>/, root is ../../
  const indexHtml = `${head(`${displayName} — ${story.head}`, "../../")}
<body>
${masthead(displayName, "today", "../../", "")}
${storyBlock(story)}
${footer(displayName, "../../")}
</body>
</html>
`;
  await fs.writeFile(path.join(editionDir, "index.html"), indexHtml);

  // 2. issues/<date>.html (permalink) — root is ../../../, edition is ../
  const permalinkHtml = `${head(`${displayName} — ${story.date} — ${story.head}`, "../../../")}
<body>
${masthead(displayName, "archive", "../../../", "../")}
${storyBlock(story)}
${footer(displayName, "../../../")}
</body>
</html>
`;
  await fs.writeFile(path.join(issuesDir, `${story.date}.html`), permalinkHtml);

  // 3. issues/index.json (manifest, prepend/replace by date)
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
