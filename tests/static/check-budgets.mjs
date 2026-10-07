// Performance budgets over the built site (dist/). Run after `npm run build`:
//   node tests/static/check-budgets.mjs            check against tests/static/budgets.json (fails on any regression)
//   node tests/static/check-budgets.mjs --update   re-baseline: current values + 10 % headroom (commit the JSON)
//
// Per page type (worst page of the type, all four locales):
//   html    gzip size of the HTML document (inline CSS / JS / SVG included)
//   css     gzip size of the external stylesheets it loads for the screen (the media="print" sheet is not counted)
//   js      gzip size of the external same-origin scripts it loads, plus the modules they import statically
//           (shared chunks count once; lazy import() chunks and Turnstile, a third party, are not counted)
//   images  bytes of every image it references, per viewport class: for each <img>/<picture> the largest candidate
//           of the source a wide (1440px) or a narrow (412px) screen selects (AVIF when present; a data: URI source
//           costs 0), plus video posters; the page value is the larger of the two classes (an upper bound: a 1x screen
//           or a lazy image below the fold downloads less). <picture> sources split by `media` (desktop panel vs
//           phone band) are therefore counted once, not twice.
// Per file: the largest CSS / JS (gzip), font, image and video files.
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, relative, sep, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "node-html-parser";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const DIST = process.env.DIST_DIR ?? join(ROOT, "dist");
const BUDGETS = fileURLToPath(new URL("./budgets.json", import.meta.url));
const HEADROOM = 0.1;
const update = process.argv.includes("--update");

if (!existsSync(join(DIST, "sitemap-0.xml"))) {
  console.error("dist/ is missing or incomplete: run `npm run build` first.");
  process.exit(2);
}

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
})(DIST);
const rel = (p) => "/" + relative(DIST, p).split(sep).join("/");
const gz = (buf) => gzipSync(buf, { level: 9 }).length;
const sizeCache = new Map();
const bytes = (urlPath) => {
  if (!sizeCache.has(urlPath)) {
    const p = join(DIST, decodeURIComponent(urlPath));
    sizeCache.set(urlPath, existsSync(p) ? statSync(p).size : 0);
  }
  return sizeCache.get(urlPath);
};
const gzCache = new Map();
const gzOf = (urlPath) => {
  if (!gzCache.has(urlPath)) {
    const p = join(DIST, decodeURIComponent(urlPath));
    gzCache.set(urlPath, existsSync(p) ? gz(readFileSync(p)) : 0);
  }
  return gzCache.get(urlPath);
};

const TYPES = [
  ["home", /^\/[a-z]{2}\/$/],
  ["services-index", /^\/[a-z]{2}\/services\/$/],
  ["service", /^\/[a-z]{2}\/services\/[^/]+\/$/],
  ["industries-index", /^\/[a-z]{2}\/industries\/$/],
  ["industry", /^\/[a-z]{2}\/industries\/[^/]+\/$/],
  ["projects-index", /^\/[a-z]{2}\/projects\/$/],
  ["project", /^\/[a-z]{2}\/projects\/[^/]+\/$/],
  ["contact", /^\/[a-z]{2}\/contact\/$/],
  ["thanks", /^\/[a-z]{2}\/contact\/thanks\/$/],
  ["foreign-manufacturers", /^\/[a-z]{2}\/foreign-manufacturers\/$/],
  ["technologies", /^\/[a-z]{2}\/technologies\/$/],
  ["about", /^\/[a-z]{2}\/about\/$/],
  ["privacy", /^\/[a-z]{2}\/privacy\/$/],
  ["404", /^\/404\.html$/],
];
const typeOf = (path) => TYPES.find(([, re]) => re.test(path))?.[0];

const own = (u) => u && u.startsWith("/") && !u.startsWith("//");
/** Largest candidate of a srcset (by width descriptor, else the last one). data: candidates are skipped. */
function largest(srcset) {
  const c = srcset
    .split(/,(?=\s*(?:\/|https?:|data:))/)
    .map((s) => s.trim().split(/\s+/))
    .filter(([u]) => u && !u.startsWith("data:"));
  c.sort((a, b) => parseFloat(a[1] ?? "0") - parseFloat(b[1] ?? "0"));
  return c.at(-1)?.[0];
}
/** Viewport classes for `media` on <picture> sources: a wide desktop and a phone. */
const VIEWPORTS = { wide: 1440, narrow: 412 };
/** Does a simple media query ("(min-width: 1024px)", "(max-width: 1023.98px) and …") match a viewport width?
    Unknown features count as matching (keeps the measure an upper bound). */
function mediaMatches(media, width) {
  if (!media) return true;
  return media.split(",").some((q) =>
    q.split(/\band\b/).every((part) => {
      const m = part.match(/\(\s*(min|max)-width\s*:\s*([\d.]+)(px|rem|em)\s*\)/);
      if (!m) return true;
      const px = parseFloat(m[2]) * (m[3] === "px" ? 1 : 16);
      return m[1] === "min" ? width >= px : width <= px;
    }),
  );
}
/** The URL a viewport class downloads for an <img> (null: nothing, e.g. a 1x1 data: placeholder source). */
function imageFor(img, width) {
  const pic = img.parentNode?.tagName === "PICTURE" ? img.parentNode : null;
  if (pic) {
    const source = pic.querySelectorAll("source[srcset]").find((s) => mediaMatches(s.getAttribute("media"), width));
    if (source) {
      const srcset = source.getAttribute("srcset");
      return srcset.trim().startsWith("data:") ? null : largest(srcset);
    }
  }
  return img.getAttribute("srcset") ? largest(img.getAttribute("srcset")) : img.getAttribute("src");
}
/** Same-origin modules a script imports statically (`import … from "./x.js"` / `import "./x.js"`), recursively. */
const importsCache = new Map();
function withImports(urlPath, seen = new Set()) {
  if (seen.has(urlPath)) return seen;
  seen.add(urlPath);
  if (!importsCache.has(urlPath)) {
    const p = join(DIST, decodeURIComponent(urlPath));
    const code = existsSync(p) ? readFileSync(p, "utf8") : "";
    const dir = urlPath.slice(0, urlPath.lastIndexOf("/") + 1);
    const deps = [...code.matchAll(/(?:^|[;\s}])import\s*(?:[\w${},*\s]+from\s*)?["']([^"']+)["']/g)]
      .map((m) => m[1])
      .filter((s) => s.startsWith("./") || s.startsWith("/"))
      .map((s) => (s.startsWith("/") ? s : dir + s.slice(2)));
    importsCache.set(urlPath, deps);
  }
  for (const d of importsCache.get(urlPath)) withImports(d, seen);
  return seen;
}

const measured = { pageTypes: {}, files: {} };
const worst = {};
for (const f of files.filter((x) => x.endsWith(".html"))) {
  const path = rel(f).replace(/index\.html$/, "");
  const type = typeOf(path);
  if (!type) continue;
  const html = readFileSync(f);
  const root = parse(html.toString("utf8"));
  const m = { html: gz(html), css: 0, js: 0, images: 0 };
  const css = new Set(
    root
      .querySelectorAll('link[rel="stylesheet"], link[rel="preload"][as="style"]')
      .filter((l) => l.getAttribute("media") !== "print") // print.css: fetched at low priority, never render-blocking
      .map((l) => l.getAttribute("href"))
      .filter(own),
  );
  for (const h of css) m.css += gzOf(h);
  const js = new Set();
  for (const s of root.querySelectorAll("script[src]").map((x) => x.getAttribute("src")).filter(own)) withImports(s, js);
  for (const s of js) m.js += gzOf(s);
  const posters = root.querySelectorAll("video[poster]").map((v) => v.getAttribute("poster")).filter(own);
  for (const width of Object.values(VIEWPORTS)) {
    const imgs = new Set(posters);
    for (const img of root.querySelectorAll("img")) {
      const pick = imageFor(img, width);
      if (own(pick)) imgs.add(pick);
    }
    let sum = 0;
    for (const i of imgs) sum += bytes(i);
    m.images = Math.max(m.images, sum);
  }
  for (const k of Object.keys(m)) {
    if (!worst[type]?.[k] || m[k] > worst[type][k].value) (worst[type] ??= {})[k] = { value: m[k], page: path };
  }
}
for (const [type, ks] of Object.entries(worst)) measured.pageTypes[type] = Object.fromEntries(Object.entries(ks).map(([k, v]) => [k, v.value]));

const maxOf = (filter, size) => {
  let best = { value: 0, file: "" };
  for (const f of files.filter(filter)) {
    const v = size(f);
    if (v > best.value) best = { value: v, file: rel(f) };
  }
  return best;
};
const ext = (...e) => (f) => e.includes(extname(f).toLowerCase());
const fileMax = {
  cssGz: maxOf(ext(".css"), (f) => gz(readFileSync(f))),
  jsGz: maxOf(ext(".js", ".mjs"), (f) => gz(readFileSync(f))),
  font: maxOf(ext(".woff2", ".woff"), (f) => statSync(f).size),
  image: maxOf(ext(".avif", ".webp", ".jpg", ".jpeg", ".png", ".svg", ".gif"), (f) => statSync(f).size),
  video: maxOf(ext(".mp4", ".webm"), (f) => statSync(f).size),
};
for (const [k, v] of Object.entries(fileMax)) measured.files[k] = v.value;

/* ------------------------------------------------------------------ update or check */

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
if (update) {
  const limit = (n) => Math.ceil((n * (1 + HEADROOM)) / 1024) * 1024;
  const previous = existsSync(BUDGETS) ? JSON.parse(readFileSync(BUDGETS, "utf8")) : {};
  const out = {
    $comment:
      "Byte limits = measured values + 10% headroom, rounded up to 1 KB. Re-baseline on purpose with `npm run test:budget -- --update` and review the diff.",
    // Why each re-baseline happened (kept across updates; add a line when you re-baseline).
    notes: previous.notes ?? [],
    pageTypes: Object.fromEntries(Object.entries(measured.pageTypes).map(([t, ks]) => [t, Object.fromEntries(Object.entries(ks).map(([k, v]) => [k, limit(v)]))])),
    files: Object.fromEntries(Object.entries(measured.files).map(([k, v]) => [k, limit(v)])),
  };
  writeFileSync(BUDGETS, JSON.stringify(out, null, 2) + "\n");
  console.log(`budgets written to ${relative(ROOT, BUDGETS)}`);
  process.exit(0);
}

if (!existsSync(BUDGETS)) {
  console.error(`No budgets file: run \`node tests/static/check-budgets.mjs --update\` to create ${relative(ROOT, BUDGETS)}.`);
  process.exit(2);
}
const budgets = JSON.parse(readFileSync(BUDGETS, "utf8"));
const failures = [];
const rows = [];
for (const [type, ks] of Object.entries(measured.pageTypes)) {
  for (const [k, v] of Object.entries(ks)) {
    const limit = budgets.pageTypes?.[type]?.[k];
    if (limit === undefined) {
      failures.push(`${type}.${k}: no budget (new page type?) — measured ${kb(v)} on ${worst[type][k].page}`);
      continue;
    }
    rows.push([`${type} ${k}`, v, limit]);
    if (v > limit) failures.push(`${type}.${k}: ${kb(v)} > budget ${kb(limit)} (worst page ${worst[type][k].page})`);
  }
}
for (const [k, v] of Object.entries(measured.files)) {
  const limit = budgets.files?.[k];
  if (limit === undefined) {
    failures.push(`files.${k}: no budget`);
    continue;
  }
  rows.push([`largest file ${k}`, v, limit]);
  if (v > limit) failures.push(`files.${k}: ${kb(v)} > budget ${kb(limit)} (${fileMax[k].file})`);
}
const w = Math.max(...rows.map((r) => r[0].length));
for (const [name, v, limit] of rows) {
  const pct = limit ? `${Math.round((v / limit) * 100)}%` : "(none allowed)";
  console.log(`${name.padEnd(w)}  ${kb(v).padStart(10)} / ${kb(limit).padStart(10)}  ${pct}`);
}
if (failures.length) {
  console.error(`\n✗ ${failures.length} budget(s) exceeded:\n  ${failures.join("\n  ")}`);
  console.error("If the growth is intended, re-baseline with `npm run test:budget -- --update` and commit tests/static/budgets.json.");
  process.exit(1);
}
console.log(`\nbudgets passed (${rows.length} checks).`);
