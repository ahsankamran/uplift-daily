// CLI wrapper around scripts/lib/edition-page.mjs — generates one
// standalone single-story edition from a story JSON file. Used for the 3
// genuinely new categories (Coming Together / Open Hands / Human Spirit),
// each sourced independently (see editions/<slug>/DAILY.md).
//
// Usage:
//   node scripts/build-single-story-edition.mjs <slug> "<Display Name>" <story.json>
//
// story.json: { date, cat, place, head, summary, src, url, img, photographer? }

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildEditionPages } from "./lib/edition-page.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const [slug, displayName, storyPath] = process.argv.slice(2);
if (!slug || !displayName || !storyPath) {
  console.error(
    'usage: build-single-story-edition.mjs <slug> "<Display Name>" <story.json>'
  );
  process.exit(1);
}

const story = JSON.parse(await fs.readFile(storyPath, "utf8"));
const { manifest, files } = await buildEditionPages(ROOT, slug, displayName, story);
for (const f of files) console.log("wrote", f);
console.log(`(${manifest.length} entries in manifest)`);
