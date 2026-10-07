// Keep the previous deploy's hashed assets (dist/_astro) online for one more deploy.
//
// Right after a deploy, a visitor can still get the previous HTML for a few seconds (edge propagation, a tab opened
// before the deploy): it names /_astro files the new build no longer has, so the page would load unstyled, without
// its scripts or with broken images until the next navigation. Hashed names never collide, so serving both sets is
// safe; files Cloudflare already holds are not uploaded again (wrangler skips known hashes), so this costs nothing.
//
//   node scripts/keep-previous-assets.mjs          before `wrangler deploy` (after every dist check): copy the files
//                                                  of the last deployed build that dist/_astro lacks into it
//   node scripts/keep-previous-assets.mjs --save   after a successful deploy: remember THIS build's own files
//                                                  (not the carried-over ones), so only one previous build is kept
// State lives in .deploy-prev/ (gitignored): _astro/ = the files of the last deployed build, current.json = this
// build's own file list, written by the first step for the second.
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIST = "dist/_astro";
const PREV = ".deploy-prev/_astro";
const OWN = ".deploy-prev/current.json";

const files = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => join(e.parentPath, e.name).slice(dir.length + 1))
    : [];

if (!existsSync(DIST)) throw new Error(`${DIST} is missing: build first`);
mkdirSync(".deploy-prev", { recursive: true });

if (process.argv.includes("--save")) {
  const own = existsSync(OWN) ? JSON.parse(readFileSync(OWN, "utf8")) : files(DIST);
  rmSync(PREV, { recursive: true, force: true });
  for (const f of own) {
    mkdirSync(join(PREV, f, ".."), { recursive: true });
    copyFileSync(join(DIST, f), join(PREV, f));
  }
  rmSync(OWN, { force: true });
  console.log(`keep-previous-assets: remembered ${own.length} files of this deploy for the next one`);
} else {
  const own = files(DIST);
  writeFileSync(OWN, JSON.stringify(own));
  const have = new Set(own);
  const carried = files(PREV).filter((f) => !have.has(f));
  for (const f of carried) cpSync(join(PREV, f), join(DIST, f));
  console.log(`keep-previous-assets: ${carried.length} files of the previous deploy kept online for one more deploy`);
}
