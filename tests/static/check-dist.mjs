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
//  - sitemap ↔ dist drift (a sitemap URL without a page; an indexable page missing from the sitemap)
//  - leaked local inputs: client-data paths, raw Facebook / Telegram / screenshot file names
//  - secrets: Cloudflare / GitHub token prefixes, the TURNSTILE_SECRET name, and (when a local .env exists) the value
//    of any secret in it (reported by key name only)
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
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
    opts[name] = new Set(page.root.querySelectorAll(`select[name=${name}] option`).map((o) => o.getAttribute("value")).filter(Boolean));
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
const PUBLIC_KEYS = new Set(["TURNSTILE_SITE_KEY", "CF_WEB_ANALYTICS_TOKEN", "CF_WEB_ANALYTICS_SITE_TAG", "INDEXNOW_KEY", "CLOUDFLARE_ACCOUNT_ID", "R2_S3_ENDPOINT"]);
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
    `${scanned} text files scanned for leaks/secrets (${envSecrets.length} local secret values).`,
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
