// Performance budgets over the built site (dist/). Run after `npm run build`:
//   node tests/static/check-budgets.mjs            check against tests/static/budgets.json (fails on any regression)
//   node tests/static/check-budgets.mjs --update   re-baseline: current values + small headroom (commit the JSON)
//
// Per page type (worst page of the type, all four locales):
//   html        gzip size of the HTML document (inline CSS / JS / SVG included)
//   beforeMain  gzip size of the HTML before <main> (head + header + drawer): what a cold connection must receive
//               before the hero copy and image can start (a first TCP flight is ~14 KB)
//   elements    element count of the document (layout / style cost of every page view)
//   css         gzip size of the external stylesheets it loads for the screen (the media="print" sheet is not counted)
//   stylesheets render-blocking <link rel="stylesheet"> in <head> and in <body> (each one is a request the first paint
//               or the parser waits for)
//   modules     external <script type="module" src> in the HTML: requests the preload scanner starts at High
//               priority next to the CSS, fonts and LCP image (PERF2-01: one site module per page, src/scripts/site.ts)
//   js          gzip size of the external same-origin scripts it loads, plus the modules they import statically
//               (shared chunks count once; lazy import() chunks and Turnstile, a third party, are not counted)
//   images      bytes of the images it references, per viewport class, picked like a browser does: the <source> whose
//               `media` matches (incl. min-resolution), then the smallest srcset candidate covering `sizes` × the
//               device pixel ratio (AVIF when offered; a data: URI source costs 0), plus video posters. Classes:
//               a phone (412px at 2.625x, Lighthouse's) and a desktop (1440px at 1x); the page value is the larger.
//               Lazy images below the fold count too (an upper bound).
// Per file: the largest CSS / JS (gzip), font, image and video files.
// Hard checks (no budget, always enforced):
//   - every external module script is self-contained: no static same-origin import (a chained request);
//   - every page with a hero photo (phone band / desktop panel <picture>) preloads it from <head> with the same
//     imagesrcset (integrations/hero-preload.mjs);
//   - every page built from BaseLayout has the speculation rules (prefetch on hover / viewport);
//   - every file in public/media/ carries a version in its name (-v3…): /media/* is cached as immutable.
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, relative, sep, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "node-html-parser";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const DIST = process.env.DIST_DIR ?? join(ROOT, "dist");
const BUDGETS = fileURLToPath(new URL("./budgets.json", import.meta.url));
/** --update headroom per key: bytes +5 %, element counts +3 %, request counts exact. */
const HEADROOM = { bytes: 0.05, elements: 0.03, count: 0 };
const COUNT_KEYS = new Set(["modules", "stylesheets"]);
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

/* ------------------------------------------------------------------ image selection (srcset + sizes, like a browser) */

/** Viewport classes: Lighthouse's phone (Moto G Power) and desktop. */
const VIEWPORTS = { narrow: { width: 412, dpr: 2.625 }, wide: { width: 1440, dpr: 1 } };
const REM = 16;
/** Does a media query list match the viewport? width / resolution features; unknown features count as matching. */
function mediaMatches(media, vp) {
  if (!media) return true;
  return media.split(",").some((q) =>
    q.split(/\band\b/).every((part) => {
      const w = part.match(/\(\s*(min|max)-width\s*:\s*([\d.]+)(px|rem|em)\s*\)/);
      if (w) {
        const px = parseFloat(w[2]) * (w[3] === "px" ? 1 : REM);
        return w[1] === "min" ? vp.width >= px : vp.width <= px;
      }
      const r = part.match(/\(\s*(min|max)-resolution\s*:\s*([\d.]+)dppx\s*\)/);
      if (r) return r[1] === "min" ? vp.dpr >= parseFloat(r[2]) : vp.dpr <= parseFloat(r[2]);
      return true;
    }),
  );
}
/** CSS length (px, rem, em, vw, calc() / min() / max() with + - * /) → px at the viewport. */
function lengthPx(expr, vp) {
  const js = expr
    .replace(/calc\(/g, "(")
    .replace(/\b(min|max)\(/g, "Math.$1(")
    .replace(/([\d.]+)px/g, "$1")
    .replace(/([\d.]+)r?em/g, (_, n) => String(parseFloat(n) * REM))
    .replace(/([\d.]+)vw/g, (_, n) => String((parseFloat(n) * vp.width) / 100));
  if (!/^(?:[\d.\s()+\-*/,]|Math\.min|Math\.max)+$/.test(js)) return vp.width; // unknown unit: full width (upper bound)
  return Function(`"use strict"; return (${js});`)();
}
/** The slot width `sizes` gives at the viewport (first matching entry; none → 100vw). */
function sizesPx(sizes, vp) {
  if (!sizes) return vp.width;
  for (const entry of sizes.split(/,(?![^(]*\))/).map((s) => s.trim())) {
    // The length is the entry's last term: a calc() / min() / max() or a plain length; any text before it is the media.
    const m = entry.match(/((?:calc|min|max)\(.*\)|[\d.]+(?:px|r?em|vw))$/);
    if (!m) return vp.width;
    const media = entry.slice(0, m.index).trim();
    if (!media || mediaMatches(media, vp)) return lengthPx(m[1], vp);
  }
  return vp.width;
}
/** The srcset candidate a browser picks: smallest width ≥ slot × DPR (else the largest); x / no descriptor: first. */
function pick(srcset, sizes, vp) {
  const c = srcset
    .split(/,(?=\s*(?:\/|https?:|data:))/)
    .map((s) => s.trim().split(/\s+/))
    .filter(([u]) => u && !u.startsWith("data:"));
  if (!c.length) return null;
  if (!c.every(([, d]) => d?.endsWith("w"))) return c[0][0];
  const need = sizesPx(sizes, vp) * vp.dpr;
  c.sort((a, b) => parseFloat(a[1]) - parseFloat(b[1]));
  return (c.find(([, d]) => parseFloat(d) >= need) ?? c.at(-1))[0];
}
/** The URL a viewport class downloads for an <img> (null: nothing, e.g. a 1x1 data: placeholder source). */
function imageFor(img, vp) {
  const pic = img.parentNode?.tagName === "PICTURE" ? img.parentNode : null;
  const sizesOf = (el) => el.getAttribute("sizes") ?? img.getAttribute("sizes");
  if (pic) {
    const source = pic.querySelectorAll("source[srcset]").find((s) => mediaMatches(s.getAttribute("media"), vp));
    if (source) {
      const srcset = source.getAttribute("srcset");
      return srcset.trim().startsWith("data:") ? null : pick(srcset, sizesOf(source), vp);
    }
  }
  return img.getAttribute("srcset") ? pick(img.getAttribute("srcset"), sizesOf(img), vp) : img.getAttribute("src");
}

/* ------------------------------------------------------------------ scripts */

/** Same-origin modules a script imports statically (`import … from "./x.js"` / `import "./x.js"`), direct only. */
const importsCache = new Map();
function staticImports(urlPath) {
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
  return importsCache.get(urlPath);
}
function withImports(urlPath, seen = new Set()) {
  if (seen.has(urlPath)) return seen;
  seen.add(urlPath);
  for (const d of staticImports(urlPath)) withImports(d, seen);
  return seen;
}

/* ------------------------------------------------------------------ measure */

const measured = { pageTypes: {}, files: {} };
const worst = {};
const hard = new Set();
for (const f of files.filter((x) => x.endsWith(".html"))) {
  const path = rel(f).replace(/index\.html$/, "");
  const type = typeOf(path);
  if (!type) continue;
  const html = readFileSync(f);
  const text = html.toString("utf8");
  const root = parse(text);
  const head = root.querySelector("head");
  const main = text.indexOf("<main");
  const m = {
    html: gz(html),
    beforeMain: main > 0 ? gz(Buffer.from(text.slice(0, main))) : 0,
    elements: root.querySelectorAll("*").length,
    css: 0,
    stylesheets: 0,
    modules: 0,
    js: 0,
    images: 0,
  };
  const sheets = root.querySelectorAll('link[rel="stylesheet"]').filter((l) => l.getAttribute("media") !== "print"); // print.css: low priority, never render-blocking
  m.stylesheets = sheets.length;
  const css = new Set(
    [...sheets, ...root.querySelectorAll('link[rel="preload"][as="style"]')].map((l) => l.getAttribute("href")).filter(own),
  );
  for (const h of css) m.css += gzOf(h);
  const modules = root
    .querySelectorAll('script[type="module"][src]')
    .map((x) => x.getAttribute("src"))
    .filter(own);
  m.modules = modules.length;
  for (const s of modules) {
    const deps = staticImports(s);
    if (deps.length) hard.add(`chained module request: ${s} imports ${deps.join(", ")} (${path})`);
  }
  const js = new Set();
  for (const s of root
    .querySelectorAll("script[src]")
    .map((x) => x.getAttribute("src"))
    .filter(own))
    withImports(s, js);
  for (const s of js) m.js += gzOf(s);
  const posters = root
    .querySelectorAll("video[poster]")
    .map((v) => v.getAttribute("poster"))
    .filter(own);
  for (const vp of Object.values(VIEWPORTS)) {
    const imgs = new Set(posters);
    for (const img of root.querySelectorAll("img")) {
      const p = imageFor(img, vp);
      if (own(p)) imgs.add(p);
    }
    let sum = 0;
    for (const i of imgs) sum += bytes(i);
    m.images = Math.max(m.images, sum);
  }
  // Hero photo preloads (phone band, desktop panel): same imagesrcset as the picture's AVIF source, in <head>.
  const preloads = new Set((head?.querySelectorAll('link[rel="preload"][as="image"]') ?? []).map((l) => l.getAttribute("imagesrcset")));
  for (const sel of [".lc-hero-band picture", ".lc-hero-media picture"]) {
    const srcset = root.querySelector(sel)?.querySelector('source[type="image/avif"]')?.getAttribute("srcset");
    if (srcset && !srcset.startsWith("data:") && !preloads.has(srcset))
      hard.add(`no <head> preload for the hero image (${sel}) on ${path}`);
  }
  if (root.querySelector("main#main") && !root.querySelector('script[type="speculationrules"]'))
    hard.add(`no speculation rules on ${path}`);
  for (const k of Object.keys(m)) {
    if (!worst[type]?.[k] || m[k] > worst[type][k].value) (worst[type] ??= {})[k] = { value: m[k], page: path };
  }
}
for (const [type, ks] of Object.entries(worst))
  measured.pageTypes[type] = Object.fromEntries(Object.entries(ks).map(([k, v]) => [k, v.value]));

// /media/* is served as immutable for a year (public/_headers): a file must change its name when its content changes.
const media = join(ROOT, "public", "media");
if (existsSync(media))
  for (const name of readdirSync(media)) if (!/-v\d+/.test(name)) hard.add(`unversioned file public/media/${name} (/media/* is immutable)`);

const maxOf = (filter, size) => {
  let best = { value: 0, file: "" };
  for (const f of files.filter(filter)) {
    const v = size(f);
    if (v > best.value) best = { value: v, file: rel(f) };
  }
  return best;
};
const ext =
  (...e) =>
  (f) =>
    e.includes(extname(f).toLowerCase());
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
const fmt = (k, n) => (COUNT_KEYS.has(k) || k === "elements" ? String(n) : kb(n));
if (update) {
  const limit = (k, n) =>
    COUNT_KEYS.has(k)
      ? n
      : k === "elements"
        ? Math.ceil((n * (1 + HEADROOM.elements)) / 10) * 10
        : Math.ceil((n * (1 + HEADROOM.bytes)) / 512) * 512;
  const previous = existsSync(BUDGETS) ? JSON.parse(readFileSync(BUDGETS, "utf8")) : {};
  const out = {
    $comment:
      "Limits = measured values + headroom: bytes +5 % (rounded up to 0.5 KB), element counts +3 %, request counts (modules, stylesheets) exact. Re-baseline on purpose with `npm run test:budget -- --update` and review the diff.",
    // Why each re-baseline happened (kept across updates; add a line when you re-baseline).
    notes: previous.notes ?? [],
    pageTypes: Object.fromEntries(
      Object.entries(measured.pageTypes).map(([t, ks]) => [t, Object.fromEntries(Object.entries(ks).map(([k, v]) => [k, limit(k, v)]))]),
    ),
    files: Object.fromEntries(Object.entries(measured.files).map(([k, v]) => [k, limit(k, v)])),
  };
  writeFileSync(BUDGETS, JSON.stringify(out, null, 2) + "\n");
  console.log(`budgets written to ${relative(ROOT, BUDGETS)}`);
  if (hard.size)
    console.error(`\nnote: ${hard.size} hard check(s) fail (not budgets, fix them):\n  ${[...hard].slice(0, 20).join("\n  ")}`);
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
      failures.push(`${type}.${k}: no budget (new page type or key?) — measured ${fmt(k, v)} on ${worst[type][k].page}`);
      continue;
    }
    rows.push([`${type} ${k}`, v, limit, k]);
    if (v > limit) failures.push(`${type}.${k}: ${fmt(k, v)} > budget ${fmt(k, limit)} (worst page ${worst[type][k].page})`);
  }
}
for (const [k, v] of Object.entries(measured.files)) {
  const limit = budgets.files?.[k];
  if (limit === undefined) {
    failures.push(`files.${k}: no budget`);
    continue;
  }
  rows.push([`largest file ${k}`, v, limit, k]);
  if (v > limit) failures.push(`files.${k}: ${kb(v)} > budget ${kb(limit)} (${fileMax[k].file})`);
}
const w = Math.max(...rows.map((r) => r[0].length));
for (const [name, v, limit, k] of rows) {
  const pct = limit ? `${Math.round((v / limit) * 100)}%` : "(none allowed)";
  console.log(`${name.padEnd(w)}  ${fmt(k, v).padStart(10)} / ${fmt(k, limit).padStart(10)}  ${pct}`);
}
for (const h of hard) failures.push(h);
if (failures.length) {
  console.error(`\n✗ ${failures.length} check(s) failed:\n  ${failures.slice(0, 60).join("\n  ")}`);
  console.error(
    "If a budget's growth is intended, re-baseline with `npm run test:budget -- --update` and commit tests/static/budgets.json.",
  );
  process.exit(1);
}
console.log(`\nbudgets passed (${rows.length} checks + hero preloads, module chains, speculation rules, media versions).`);
