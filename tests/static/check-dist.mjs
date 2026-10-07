// Static crawl of the built site (dist/), no server needed. Run after `npm run build`:  node tests/static/check-dist.mjs
//
// Fails on:
//  - internal links / assets that do not resolve to a file in dist/ (pages, srcset, posters, preloads, og:image…)
//  - #fragments that do not exist on the target page, aria-controls / aria-labelledby / aria-describedby / label[for]
//    pointing at a missing id
//  - links without the trailing slash (they cost a redirect), absolute links to our own domain, javascript: links
//  - a page linking to another locale outside the language switcher (switcher links carry hreflang / data-set-lang)
//  - contact-form preselection (?service= / ?industry= / ?location=) with a value the form's <select> does not have
//  - malformed tel: / mailto: / wa.me links
//  - /lab/ or /styleguide/ pages (or links to them) in the production build
//  - JSON-LD blocks that do not parse
//  - a srcset with width descriptors (`640w`) and no `sizes` (img / source; `imagesizes` on an image preload): the
//    browser then assumes 100vw and takes a file sized for the whole screen (PERF3-03: the logo's AVIF <source>)
//  - client scripts (CODE3-06): a module a built chunk imports (static, dynamic or Vite's preload list) that is not
//    in dist/, and an inline <script type="module"> other than the components site.ts leaves to Astro on purpose
//    (`lc-own:`), i.e. a component script that escaped the site module (integrations/site-scripts.mjs)
//  - CSP (CODE2-01): every page carries exactly one CSP <meta> right after <meta charset> (before any script, style or
//    link), its script-src has no 'unsafe-inline', and its hashes are exactly the page's inline scripts (computed here,
//    independently of integrations/csp-inline-hashes.mjs: CODE3-06); no inline event handlers (on…=) anywhere
//  - hero images (CODE3-06, independently of integrations/hero-preload.mjs): at six phone / tablet / desktop viewports
//    the file each <img fetchpriority="high"> of <main>'s first section takes is the file a <head> preload fetches, no
//    image preload fetches anything else, hero images are never lazy, and every home page and case study has one
//  - duplicate <title> / meta description among a locale's indexable pages (CS2-02: titles composed in code included)
//  - sitemap ↔ dist drift (a sitemap URL without a page; an indexable page missing from the sitemap), a sitemap URL
//    without <lastmod>, a case study whose Article lacks datePublished ≤ dateModified
//  - leaked local inputs: client-data paths, raw Facebook / Telegram / screenshot file names
//  - secrets: Cloudflare / GitHub token prefixes, the TURNSTILE_SECRET name, and (when a local .env exists) the value
//    of any secret in it (reported by key name only)
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { parse } from "node-html-parser";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const DIST = process.env.DIST_DIR ?? join(ROOT, "dist");
const SITE = "https://logic-controls.com";
const LOCALES = ["en", "ar", "zh", "tr"];

if (!existsSync(join(DIST, "sitemap-0.xml"))) {
  console.error("dist/ is missing or incomplete: run `npm run build` first.");
  process.exit(2);
}

const problems = [];
const seen = new Set();
const problem = (type, where, detail = "") => {
  const key = `${type}\0${where}\0${detail}`;
  if (seen.has(key)) return;
  seen.add(key);
  problems.push({ type, where, detail });
};

/* ------------------------------------------------------------------ files */

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
})(DIST);
const rel = (p) => "/" + relative(DIST, p).split(sep).join("/");
const fileSet = new Set(files.map(rel));
const htmlFiles = files.filter((f) => f.endsWith(".html"));
const TEXT_EXT = new Set([".html", ".css", ".js", ".mjs", ".json", ".xml", ".txt", ".webmanifest", ".svg", ".map", ""]);

/** URL path → dist file, following Workers static-assets "auto-trailing-slash" rules. */
function resolvePath(pathname) {
  let p;
  try {
    p = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (p.endsWith("/")) return fileSet.has(p + "index.html") ? p + "index.html" : null;
  if (fileSet.has(p)) return p;
  return null;
}
const pagePath = (file) => rel(file).replace(/index\.html$/, "");

/* ------------------------------------------------------------------ parse every page once */

const pages = new Map(); // url path → { root, ids, file }
for (const f of htmlFiles) {
  const root = parse(readFileSync(f, "utf8"), { comment: false });
  const ids = new Set(root.querySelectorAll("[id]").map((e) => e.getAttribute("id")));
  pages.set(pagePath(f), { root, ids, file: f });
}
/** Option values of the contact form selects, per locale. */
const formOptions = new Map();
for (const l of LOCALES) {
  const page = pages.get(`/${l}/contact/`);
  if (!page) {
    problem("missing-page", `/${l}/contact/`);
    continue;
  }
  const opts = {};
  for (const name of ["service", "industry", "location"]) {
    opts[name] = new Set(
      page.root
        .querySelectorAll(`select[name=${name}] option`)
        .map((o) => o.getAttribute("value"))
        .filter(Boolean),
    );
  }
  formOptions.set(l, opts);
}

/* ------------------------------------------------------------------ links, assets, anchors, idrefs */

let linkCount = 0;
let assetCount = 0;
for (const [path, { root, ids }] of pages) {
  const loc = path.split("/")[1];
  const pageLocale = LOCALES.includes(loc) ? loc : null;

  for (const a of root.querySelectorAll("a[href], area[href]")) {
    const href = a.getAttribute("href").trim();
    linkCount++;
    if (!href) {
      problem("empty-href", path, a.toString().slice(0, 100));
      continue;
    }
    if (href.startsWith("tel:")) {
      if (!/^tel:\+\d{8,15}$/.test(href)) problem("tel-format", path, href);
      continue;
    }
    if (href.startsWith("mailto:")) {
      if (!/^mailto:[^@\s]+@[^@\s?]+\.[a-z]{2,}(\?.*)?$/i.test(href)) problem("mailto-format", path, href);
      continue;
    }
    if (/^https?:\/\/(wa\.me|api\.whatsapp\.com)/.test(href)) {
      if (!/^https:\/\/wa\.me\/\d{10,15}(\?text=\S*)?$/.test(href)) problem("whatsapp-format", path, href);
      continue;
    }
    if (/^javascript:/i.test(href)) {
      problem("javascript-href", path, href);
      continue;
    }
    if (href.startsWith(SITE)) problem("absolute-internal-link", path, href);
    let url;
    try {
      url = new URL(href, SITE + path);
    } catch {
      problem("bad-url", path, href);
      continue;
    }
    if (url.origin !== SITE) continue; // external
    const target = url.pathname;
    if (/\/(lab|styleguide)\//.test(target)) problem("link-to-internal-page", path, href);
    // same-page fragment
    if (target === path && url.hash && !href.startsWith("/")) {
      const id = decodeURIComponent(url.hash.slice(1));
      if (id && !ids.has(id)) problem("broken-anchor", path, href);
      continue;
    }
    const file = resolvePath(target);
    if (!file) {
      const fixed = !target.endsWith("/") && !extname(target) && resolvePath(target + "/");
      problem(fixed ? "missing-trailing-slash" : "broken-link", path, href);
      continue;
    }
    if (url.hash.length > 1) {
      const t = pages.get(target);
      const id = decodeURIComponent(url.hash.slice(1));
      if (t && !t.ids.has(id)) problem("broken-anchor", path, href);
    }
    // mixed-locale links (outside the language switcher / 404 language blocks)
    const tLoc = target.split("/")[1];
    const switcher = a.getAttribute("hreflang") || a.getAttribute("data-set-lang") || a.getAttribute("lang");
    if (pageLocale && LOCALES.includes(tLoc) && tLoc !== pageLocale && !switcher) problem("mixed-locale-link", path, href);
    // contact-form preselection must name an existing option
    if (/^\/[a-z]{2}\/contact\/$/.test(target) && url.search) {
      const opts = formOptions.get(tLoc);
      for (const [k, v] of url.searchParams) {
        if (opts?.[k] && !opts[k].has(v)) problem("unknown-form-preselection", path, `${href} (${k}=${v} is not an option)`);
      }
    }
  }

  // idrefs
  for (const el of root.querySelectorAll("[aria-controls],[aria-labelledby],[aria-describedby],label[for]")) {
    for (const attr of ["aria-controls", "aria-labelledby", "aria-describedby", "for"]) {
      const v = el.getAttribute(attr);
      if (!v) continue;
      for (const id of v.split(/\s+/)) if (id && !ids.has(id)) problem("idref-missing", path, `${attr}="${id}"`);
    }
  }

  // assets: img/source srcset, video poster/src, link href (preload, icon, stylesheet, manifest), script src, svg use
  const refs = new Set();
  for (const el of root.querySelectorAll("img, source, video, audio, track, link[href], script[src], image, use, object, embed, iframe")) {
    const isLinkAlt = el.tagName === "LINK" && /^(canonical|alternate)$/.test(el.getAttribute("rel") ?? "");
    for (const attr of ["src", "poster", "href", "srcset", "imagesrcset", "xlink:href", "data"]) {
      if (isLinkAlt && attr === "href") continue;
      const v = el.getAttribute(attr);
      if (!v) continue;
      // a data: URI candidate (e.g. the 1×1 placeholder source of a <picture>) contains a comma: never split it
      const parts = attr.includes("srcset") ? (v.trim().startsWith("data:") ? [] : v.split(",").map((s) => s.trim().split(/\s+/)[0])) : [v];
      for (const p of parts) if (p && !p.startsWith("data:") && !p.startsWith("#")) refs.add(p);
    }
  }
  for (const m of root.toString().matchAll(/url\((['"]?)(\/[^'")]+)\1\)/g)) refs.add(m[2]);
  for (const sel of ['meta[property="og:image"]', 'meta[name="twitter:image"]']) {
    const v = root.querySelector(sel)?.getAttribute("content");
    if (v) refs.add(v);
  }
  for (const r of refs) {
    let url;
    try {
      url = new URL(r, SITE + path);
    } catch {
      problem("bad-asset-url", path, r);
      continue;
    }
    if (url.origin !== SITE) continue;
    assetCount++;
    if (!resolvePath(url.pathname)) problem("broken-asset", path, r);
  }

  // structured data must parse (a broken JSON-LD block is silently ignored by search engines)
  for (const s of root.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      JSON.parse(s.text);
    } catch (e) {
      problem("json-ld-parse", path, e.message);
    }
  }

  // canonical / hreflang targets exist
  for (const l of root.querySelectorAll('link[rel="canonical"], link[rel="alternate"][hreflang]')) {
    const href = l.getAttribute("href");
    if (!href?.startsWith(SITE)) {
      problem("non-absolute-canonical", path, href);
      continue;
    }
    if (!resolvePath(new URL(href).pathname)) problem("canonical-or-hreflang-404", path, href);
  }

  // width descriptors need sizes (without it the browser assumes 100vw)
  for (const el of root.querySelectorAll("img[srcset], source[srcset], link[imagesrcset]")) {
    const link = el.tagName === "LINK";
    const set = el.getAttribute(link ? "imagesrcset" : "srcset") ?? "";
    if (set.trim().startsWith("data:") || !/\s\d+w\s*(,|$)/.test(set)) continue;
    if (!(el.getAttribute(link ? "imagesizes" : "sizes") ?? "").trim())
      problem("srcset-without-sizes", path, `<${el.tagName.toLowerCase()}> ${set.split(",")[0].trim().split(/\s+/)[0]}`);
  }
}

/* ------------------------------------------------------------------ client scripts: chunks and inline modules */

// Every module a built chunk imports must be in dist/: static imports (`from"./x.js"`, `import"./x.js"`), dynamic ones
// (`import("./x.js")`) and Vite's preload list (`"_astro/x.js"` in __vite__mapDeps, relative to the site root).
let chunkRefs = 0;
for (const f of files.filter((x) => /\/_astro\/[^/]+\.m?js$/.test(rel(x)))) {
  const r = rel(f);
  const js = readFileSync(f, "utf8");
  const specs = [
    ...[...js.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["'`](\.{1,2}\/[^"'`]+)["'`]/g)].map((m) => new URL(m[1], SITE + r).pathname),
    ...[...js.matchAll(/["'`](_astro\/[^"'`]+\.m?js)["'`]/g)].map((m) => "/" + m[1]),
  ];
  for (const spec of new Set(specs)) {
    chunkRefs++;
    if (!fileSet.has(spec)) problem("missing-chunk", r, spec);
  }
}
// Inline module scripts: only the components site.ts names with `lc-own:`, each recognised by a selector its code
// looks for (a new lc-own component adds its marker here).
const OWN_INLINE = { "VideoPlayer.astro": ".lc-video-overlay" };
const ownInline = [...readFileSync(join(ROOT, "src/scripts/site.ts"), "utf8").matchAll(/lc-own:\s*(\S+\.astro)/g)].map((m) =>
  m[1].split("/").pop(),
);
for (const name of ownInline)
  if (!OWN_INLINE[name]) problem("lc-own-without-marker", "tests/static/check-dist.mjs", `OWN_INLINE has no marker for ${name}`);
const markers = ownInline.map((n) => OWN_INLINE[n]).filter(Boolean);
let inlineModules = 0;
for (const [path, { root }] of pages) {
  for (const s of root.querySelectorAll("script")) {
    if (s.hasAttribute("src") || (s.getAttribute("type") ?? "").trim().toLowerCase() !== "module") continue;
    inlineModules++;
    if (!markers.some((m) => s.rawText.includes(m))) problem("stray-inline-module-script", path, s.rawText.trim().slice(0, 100));
  }
}

/* ------------------------------------------------------------------ CSP: the meta policy covers every inline script */

// Independent of integrations/csp-inline-hashes.mjs (CODE3-06), which writes the hashes: the scripts come from the
// parsed DOM (an element's own `src` attribute, not a regex over the tag), the policy from the <meta> element, and the
// hash is computed here with node:crypto over the raw text with CR LF / CR turned into LF, as the HTML parser does
// before the browser hashes a script. A scanner bug in the integration therefore cannot pass both checks.
const policyOf = (content) =>
  new Map(
    content
      .split(";")
      .map((d) => d.trim().split(/\s+/))
      .filter(([name]) => name)
      .map(([name, ...sources]) => [name.toLowerCase(), sources]),
  );
const inlineScriptSources = (root) =>
  new Set(
    root
      .querySelectorAll("script")
      .filter((s) => !s.hasAttribute("src") && (s.getAttribute("type") ?? "").trim().toLowerCase() !== "application/ld+json" && s.rawText)
      .map((s) => `'sha256-${createHash("sha256").update(s.rawText.replace(/\r\n?/g, "\n"), "utf8").digest("base64")}'`),
  );
let cspPages = 0;
let cspHashes = 0;
for (const { root, file } of pages.values()) {
  const where = rel(file);
  const metas = root
    .querySelectorAll("meta[http-equiv]")
    .filter((m) => m.getAttribute("http-equiv").trim().toLowerCase() === "content-security-policy");
  if (metas.length !== 1) {
    problem("csp-meta-count", where, `${metas.length} CSP <meta> elements`);
    continue;
  }
  cspPages++;
  const html = readFileSync(file, "utf8");
  const head = html.slice(0, html.search(/<meta\s+http-equiv\s*=\s*["']?content-security-policy/i));
  if (/<(script|link|style|base)\b/i.test(head) || !/<meta charset="utf-8">$/i.test(head.trimEnd()))
    problem("csp-meta-position", where, "not directly after <meta charset>");
  const scriptSrc = policyOf(metas[0].getAttribute("content") ?? "").get("script-src");
  if (!scriptSrc) {
    problem("csp-no-script-src", where);
    continue;
  }
  if (scriptSrc.includes("'unsafe-inline'")) problem("csp-unsafe-inline", where);
  const inline = inlineScriptSources(root);
  for (const h of inline) {
    cspHashes++;
    if (!scriptSrc.includes(h)) problem("csp-unhashed-inline-script", where, h);
  }
  // The integration lists exactly the page's own scripts: a hash with no script behind it means the two disagree.
  for (const h of scriptSrc) if (/^'sha(256|384|512)-/.test(h) && !inline.has(h)) problem("csp-hash-without-script", where, h);
  for (const m of html.matchAll(/<[a-z][^>]*?\s(on[a-z]+)\s*=/gi)) problem("inline-event-handler", where, m[1]);
}

/* ------------------------------------------------------------------ hero image preloads */

// Independent of integrations/hero-preload.mjs and of its class selectors (CODE3-06). The hero images are the
// <img fetchpriority="high"> in the first section of <main>; at each viewport below, the file the browser takes for
// such an image (its <picture>'s first <source> whose media and type match, srcset × sizes × DPR) must be the file a
// <head> preload fetches at that viewport, and every image preload must fetch the hero's file. Floor: every home page
// and every case study has a hero image, eager, so a markup change cannot quietly remove the hint from all pages.
const HERO_VIEWPORTS = [
  { width: 360, dpr: 3 },
  { width: 412, dpr: 2.625 },
  { width: 768, dpr: 2 },
  { width: 1024, dpr: 1 },
  { width: 1440, dpr: 1 },
  { width: 1920, dpr: 2 },
];
const REM = 16;
const toPx = (n, unit, vp) => n * (unit === "px" ? 1 : unit === "vw" ? vp.width / 100 : REM);
/** A media query list at a viewport: min/max-width (px, rem, em) and min/max-resolution (dppx, x); other features match. */
function heroMedia(media, vp) {
  if (!media?.trim()) return true;
  return media.split(",").some((q) =>
    q.split(/\band\b/).every((part) => {
      const w = /\(\s*(min|max)-width\s*:\s*([\d.]+)(px|rem|em)\s*\)/.exec(part);
      if (w) return w[1] === "min" ? vp.width >= toPx(+w[2], w[3], vp) : vp.width <= toPx(+w[2], w[3], vp);
      const r = /\(\s*(min|max)-resolution\s*:\s*([\d.]+)(dppx|x)\s*\)/.exec(part);
      if (r) return r[1] === "min" ? vp.dpr >= +r[2] : vp.dpr <= +r[2];
      return true;
    }),
  );
}
/** A `sizes` length (px / rem / em / vw, calc / min / max) in px at the viewport. */
function heroLength(expr, vp) {
  const js = expr
    .replace(/calc\(/g, "(")
    .replace(/\b(min|max)\(/g, "Math.$1(")
    .replace(/([\d.]+)(px|rem|em|vw)/g, (_, n, u) => String(toPx(+n, u, vp)));
  if (!/^(?:[\d.\s()+\-*/,]|Math\.min|Math\.max)+$/.test(js)) throw new Error(`unsupported sizes length: ${expr}`);
  return Function(`"use strict"; return (${js});`)();
}
function heroSlot(sizes, vp) {
  for (const entry of (sizes ?? "")
    .split(/,(?![^(]*\))/)
    .map((x) => x.trim())
    .filter(Boolean)) {
    const m = /((?:calc|min|max)\(.*\)|[\d.]+(?:px|r?em|vw))$/.exec(entry);
    if (!m) break;
    const media = entry.slice(0, m.index).trim();
    if (!media || heroMedia(media, vp)) return heroLength(m[1], vp);
  }
  return vp.width;
}
/** The srcset candidate for the slot: the smallest width ≥ slot × DPR, else the largest (x / no descriptors: the first). */
function heroPick(srcset, sizes, vp) {
  const c = srcset
    .split(/,(?=\s*(?:\/|https?:|data:))/)
    .map((x) => x.trim().split(/\s+/))
    .filter(([u]) => u);
  if (!c.length || c[0][0].startsWith("data:")) return null;
  if (!c.every(([, d]) => d?.endsWith("w"))) return c[0][0];
  const need = heroSlot(sizes, vp) * vp.dpr;
  c.sort((a, b) => parseFloat(a[1]) - parseFloat(b[1]));
  return (c.find(([, d]) => parseFloat(d) >= need) ?? c.at(-1))[0];
}
/** The file an <img> takes at the viewport (AVIF supported, like every browser the preloads target); null: none. */
function heroFile(img, vp) {
  const pic = img.parentNode?.tagName === "PICTURE" ? img.parentNode : null;
  for (const source of pic?.querySelectorAll("source[srcset]") ?? []) {
    const type = source.getAttribute("type");
    if (type && !/^image\/(avif|webp|jpeg|png)$/.test(type)) continue;
    if (heroMedia(source.getAttribute("media"), vp))
      return heroPick(source.getAttribute("srcset"), source.getAttribute("sizes") ?? img.getAttribute("sizes"), vp);
  }
  return img.getAttribute("srcset")
    ? heroPick(img.getAttribute("srcset"), img.getAttribute("sizes"), vp)
    : (img.getAttribute("src") ?? null);
}
let heroPages = 0;
for (const [path, { root }] of pages) {
  const main = root.querySelector("main");
  const first = main?.childNodes.find((n) => n.nodeType === 1);
  const heroes = first?.querySelectorAll("img[fetchpriority=high]") ?? [];
  const needsHero = /^\/[a-z]{2}\/(?:projects\/[^/]+\/)?$/.test(path);
  if (needsHero && !heroes.length) problem("hero-image-missing", path, "no <img fetchpriority=high> in the first section of <main>");
  const preloads = root.querySelectorAll('head link[rel="preload"][as="image"]');
  if (!heroes.length && !preloads.length) continue;
  heroPages++;
  for (const img of heroes) if (img.getAttribute("loading") === "lazy") problem("hero-image-lazy", path, img.getAttribute("src") ?? "");
  for (const vp of HERO_VIEWPORTS) {
    const at = `${vp.width}px @${vp.dpr}x`;
    const want = new Set(heroes.map((img) => heroFile(img, vp)).filter(Boolean));
    const got = new Set();
    for (const l of preloads) {
      if (!heroMedia(l.getAttribute("media"), vp)) continue;
      const file = l.getAttribute("imagesrcset")
        ? heroPick(l.getAttribute("imagesrcset"), l.getAttribute("imagesizes"), vp)
        : l.getAttribute("href");
      if (file) got.add(file);
    }
    for (const f of want)
      if (!got.has(f))
        problem(
          "hero-preload-mismatch",
          path,
          `${at}: the hero image takes ${f}, no <head> preload fetches it (preloads: ${[...got].join(", ") || "none"})`,
        );
    for (const f of got)
      if (!want.has(f)) problem("hero-preload-wasted", path, `${at}: a <head> preload fetches ${f}, which no hero image uses`);
  }
}

/* ------------------------------------------------------------------ unique titles / descriptions per locale */

const titles = new Map();
const descriptions = new Map();
for (const [p, { root }] of pages) {
  const loc = p.split("/")[1];
  const noindex = /noindex/.test(root.querySelector('meta[name="robots"]')?.getAttribute("content") ?? "");
  if (!LOCALES.includes(loc) || noindex || /\/(art|lab|styleguide)\//.test(p)) continue;
  const title = root.querySelector("title")?.text.trim() ?? "";
  const desc = root.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() ?? "";
  if (!title) problem("missing-title", p);
  if (!desc) problem("missing-description", p);
  for (const [map, value, type] of [
    [titles, title, "duplicate-title"],
    [descriptions, desc, "duplicate-description"],
  ]) {
    if (!value) continue;
    const key = `${loc}\0${value}`;
    if (map.has(key)) problem(type, p, `same as ${map.get(key)}: ${value.slice(0, 80)}`);
    else map.set(key, p);
  }
}

/* ------------------------------------------------------------------ internal pages must not ship */

for (const p of fileSet) if (/\/(lab|styleguide)\//.test(p)) problem("internal-page-in-dist", p);

/* ------------------------------------------------------------------ sitemap ↔ dist */

const sitemap = readFileSync(join(DIST, "sitemap-0.xml"), "utf8");
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
for (const p of locs) if (!pages.has(p)) problem("sitemap-url-without-page", p);
for (const [p, { root }] of pages) {
  const noindex = /noindex/.test(root.querySelector('meta[name="robots"]')?.getAttribute("content") ?? "");
  if (p === "/" || p === "/404.html" || noindex) continue;
  if (!locs.includes(p)) problem("page-missing-from-sitemap", p);
}
// Page dates (CODE2-36): every sitemap URL carries <lastmod> (src/data/content-dates.json, no git needed), and every
// case study's Article has datePublished ≤ dateModified.
for (const m of sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
  const loc = /<loc>([^<]+)<\/loc>/.exec(m[1])?.[1] ?? "?";
  const lastmod = /<lastmod>([^<]+)<\/lastmod>/.exec(m[1])?.[1];
  if (!lastmod || Number.isNaN(Date.parse(lastmod))) problem("sitemap-lastmod", new URL(loc).pathname, lastmod ?? "missing");
}
for (const [p, { root }] of pages) {
  if (!/^\/[a-z]{2}\/projects\/[^/]+\/$/.test(p)) continue;
  const nodes = root.querySelectorAll('script[type="application/ld+json"]').flatMap((s) => {
    try {
      const o = JSON.parse(s.text);
      return o["@graph"] ?? [o];
    } catch {
      return [];
    }
  });
  const article = nodes.find((n) => n["@type"] === "Article");
  if (!article) {
    problem("case-study-article", p, "no Article node");
    continue;
  }
  const { datePublished: pub, dateModified: mod } = article;
  if (!pub || !mod || Number.isNaN(Date.parse(pub)) || Number.isNaN(Date.parse(mod))) problem("case-study-dates", p, `${pub} / ${mod}`);
  else if (Date.parse(pub) > Date.parse(mod)) problem("case-study-dates", p, `published ${pub} after modified ${mod}`);
}
const robots = readFileSync(join(DIST, "robots.txt"), "utf8");
const smRef = /Sitemap:\s*(\S+)/.exec(robots)?.[1];
if (!smRef || !resolvePath(new URL(smRef).pathname)) problem("robots-sitemap", "/robots.txt", smRef ?? "no Sitemap line");

/* ------------------------------------------------------------------ leaks and secrets */

const LEAK_PATTERNS = [
  ["client-data path", /client-data/],
  ["raw Facebook file name", /\b\d{6,}_\d{10,}_\d{10,}_[no]\.(?:jpe?g|png|mp4|webp)\b/],
  ["Telegram export file name", /telegram-cloud-(?:photo|document)/],
  ["macOS screenshot file name", /Pasted \d{4}-\d{2}-\d{2}|Screenshot \d{4}-\d{2}-\d{2}/],
];
const SECRET_PATTERNS = [
  ["Cloudflare user token (cfut_)", /cfut_[A-Za-z0-9_-]{8,}/],
  ["Cloudflare account token (cfat_)", /cfat_[A-Za-z0-9_-]{8,}/],
  ["GitHub token (ghp_/gho_/ghs_/github_pat_)", /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/],
  ["TURNSTILE_SECRET name", /TURNSTILE_SECRET/],
  ["Turnstile secret key (0x4…)", /0x4AAAAAA[A-Za-z0-9_-]{20,}/],
  ["private key block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];
// Values from a local .env (never printed). Public-by-design keys are skipped.
const PUBLIC_KEYS = new Set([
  "TURNSTILE_SITE_KEY",
  "CF_WEB_ANALYTICS_TOKEN",
  "CF_WEB_ANALYTICS_SITE_TAG",
  "INDEXNOW_KEY",
  "CLOUDFLARE_ACCOUNT_ID",
  "R2_S3_ENDPOINT",
]);
const envSecrets = [];
for (const envFile of [".env", ".dev.vars"]) {
  const p = join(ROOT, envFile);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/.exec(line);
    if (!m || PUBLIC_KEYS.has(m[1]) || m[2].length < 12) continue;
    if (/^1x0{20,}/.test(m[2])) continue; // Cloudflare's public Turnstile test secret
    envSecrets.push([`${envFile} ${m[1]}`, m[2]]);
  }
}

let scanned = 0;
for (const f of files) {
  const r = rel(f);
  for (const [what, re] of LEAK_PATTERNS) if (re.test(r)) problem("leaked-file-name", r, what);
  if (!TEXT_EXT.has(extname(f))) continue;
  const text = readFileSync(f, "utf8");
  scanned++;
  for (const [what, re] of LEAK_PATTERNS) if (re.test(text)) problem("leaked-local-input", r, what);
  for (const [what, re] of SECRET_PATTERNS) if (re.test(text)) problem("secret", r, what);
  for (const [name, value] of envSecrets) if (text.includes(value)) problem("secret", r, `value of ${name}`);
}

/* ------------------------------------------------------------------ report */

const byType = {};
for (const p of problems) byType[p.type] = (byType[p.type] ?? 0) + 1;
console.log(
  `dist check: ${pages.size} pages, ${linkCount} links, ${assetCount} asset refs, ${locs.length} sitemap URLs, ` +
    `${scanned} text files scanned for leaks/secrets (${envSecrets.length} local secret values), ` +
    `CSP meta on ${cspPages} pages covering ${cspHashes} inline scripts, hero image preloads on ${heroPages} pages, ` +
    `${chunkRefs} chunk imports, ${inlineModules} inline module scripts (lc-own).`,
);
if (problems.length) {
  for (const type of Object.keys(byType)) {
    console.error(`\n✗ ${type} (${byType[type]})`);
    for (const p of problems.filter((x) => x.type === type).slice(0, 15)) console.error(`  ${p.where}  ${p.detail}`);
  }
  console.error(`\ndist check failed with ${problems.length} problem(s).`);
  process.exit(1);
}
console.log("dist check passed.");
