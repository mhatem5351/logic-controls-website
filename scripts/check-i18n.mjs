// Fails the build if any locale is missing a key from the English files (the source of truth),
// has extra keys, a different array length, an empty string / TODO marker, different {placeholders} than English,
// markup or HTML entities (messages are plain text; src/lib/text.ts escapes and types them), a no-break space that
// glues an Arabic conjunction BACKWARD onto a Latin code ("S7-1200⍽و⍽WinCC" → two atoms fused into one unbreakable
// run, which pushed /ar/foreign-manufacturers sideways on phones), a no-break chain of Latin words longer than the text
// engine's atom budget (20) — or uses a Latin letter that the Montserrat files the site ships don't have.
// When the data modules are present it also checks that every service / industry / project / zone slug has copy in
// every locale and that every technology named in src/data/projects.ts has a tech.json label.
// Link tokens in copy ({link:services/machine-retrofits|label}, {link:ext:https://…|label}; src/lib/text.ts): every
// internal target must be a real route, every external one an https URL on an allow-listed official host, no token may
// be malformed, and every locale of a key must link to the same targets as English.
// Warnings (never fail): a single Latin word of 19+ letters in a heading string (no hyphenation outside Turkish).
import { readFileSync, readdirSync, existsSync } from "node:fs";

/** Locales from src/i18n/config.ts (one list for the whole site); English is the reference. */
function configLocales() {
  const file = new URL("../src/i18n/config.ts", import.meta.url);
  const m = existsSync(file) && /export const LOCALES = \[([^\]]*)\]/.exec(readFileSync(file, "utf8"));
  const list = m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : ["en", "ar", "zh", "tr"];
  return list.filter((l) => l !== "en");
}
const LOCALES = configLocales();
const root = new URL("../src/i18n/messages/", import.meta.url);
const namespaces = readdirSync(new URL("en/", root)).filter((f) => f.endsWith(".json"));

function flatten(obj, prefix = "", out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (Array.isArray(v)) {
      out.set(`${key}[]`, v.length);
      v.forEach((item, i) => (item && typeof item === "object" ? flatten(item, `${key}[${i}]`, out) : out.set(`${key}[${i}]`, item)));
    } else if (v && typeof v === "object") flatten(v, key, out);
    else out.set(key, v);
  }
  return out;
}

let problems = 0, total = 0, warnings = 0;
const report = (msg) => (problems++, console.error(`  ✗ ${msg}`));
const warn = (msg) => (warnings++, console.warn(`  ! ${msg}`));
const bad = (v) => v === "" || /\bTODO\b/.test(String(v));
const placeholders = (v) => [...new Set(String(v).match(/\{\w+\}/g) ?? [])].sort().join(" ");

/* ------------------------------------------------------------------ plain-text contract (per value, every locale) */
const MARKUP = /<\/?[a-z][^>]*>|&(?:[a-z]+|#\d+|#x[0-9a-f]+);/i;
const NBSP = "\u00A0";
/** Arabic conjunction / preposition glued backward onto a Latin code or number (src/lib/text.ts arGlue()). */
const AR_BACKWARD_GLUE = new RegExp(`[A-Za-z0-9)\\]%°″]${NBSP}(?:و|مع|في|من|ثم|أو|على|إلى|عن)(?=[ ${NBSP}]|$)|[A-Za-z][A-Za-z0-9\\-/]*${NBSP}و[\\u0621-\\u064A]`);
/** Text engine atom budget: a no-break chain of Latin words longer than this can overflow a ~300px card. */
const MAX_ATOM = 20;
const HEADING_KEY = /(?:^|\.)(?:title|h1|h2|heading|cardTitle|navTitle|name)(?:\[\d+\])?$/;
const LONG_WORD = 19;

/* ------------------------------------------------------------------ data (slugs; skipped without src/data) */
const dataFile = (name) => new URL(`../src/data/${name}`, import.meta.url);
const read = (name) => (existsSync(dataFile(name)) ? readFileSync(dataFile(name), "utf8") : undefined);
const constList = (src, name) => {
  const m = src && new RegExp(`export const ${name} = \\[([^\\]]*)\\]`).exec(src);
  return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
};
const projectsSrc = read("projects.ts");
const SLUGS = {
  services: constList(read("services.ts"), "SERVICE_SLUGS"),
  industries: constList(read("industries.ts"), "INDUSTRY_SLUGS"),
  projects: projectsSrc ? [...projectsSrc.matchAll(/\bslug: "([^"]+)"/g)].map((x) => x[1]) : [],
  zones: constList(read("zones.ts"), "ZONE_SLUGS"),
};

/* ------------------------------------------------------------------ link tokens */
/** Same pattern as LINK_TOKEN_SOURCE in src/lib/text.ts (tests/unit/check-i18n-guards.test.ts keeps them identical). */
const LINK_TOKEN_SOURCE = String.raw`\{link:(ext:https:\/\/[^\s|{}"'<>]+|[a-z0-9]+(?:[\/-][a-z0-9]+)*)\|([^{}|]+)\}`;
const linkTokens = (v) => [...String(v).matchAll(new RegExp(LINK_TOKEN_SOURCE, "g"))];
/** Pages a message may link to (locale-less paths). */
const ROUTES = new Set([
  ...["services", "industries", "projects", "foreign-manufacturers", "technologies", "about", "contact", "privacy"],
  ...SLUGS.services.map((s) => `services/${s}`),
  ...SLUGS.industries.map((s) => `industries/${s}`),
  ...SLUGS.projects.map((s) => `projects/${s}`),
]);
/** Official sources copy may link to (opened in a new tab). Add a host only for an official, authoritative source. */
const EXTERNAL_HOSTS = new Set(["www.gafi.gov.eg", "gafi.gov.eg", "sczone.eg", "www.sczone.eg"]);
function checkLinks(l, ns, k, v) {
  if (typeof v !== "string" || !v.includes("{link:")) return;
  const found = linkTokens(v);
  if (found.length !== v.split("{link:").length - 1)
    report(`${l}/${ns}: ${k} has a malformed link token (expected {link:path|label} or {link:ext:https://…|label})`);
  for (const [, target] of found) {
    if (target.startsWith("ext:")) {
      let url;
      try {
        url = new URL(target.slice(4));
      } catch {}
      if (!url || url.protocol !== "https:" || !EXTERNAL_HOSTS.has(url.hostname))
        report(`${l}/${ns}: ${k} links to "${target.slice(4)}", which is not an https URL on an allow-listed official host`);
    } else if (!ROUTES.has(target)) report(`${l}/${ns}: ${k} links to "${target}", which is not a page of the site`);
  }
}
const targetsOf = (v) => linkTokens(v).map((m) => m[1]).sort().join(" ");

function checkValue(l, ns, k, v) {
  if (typeof v !== "string") return;
  if (MARKUP.test(v)) report(`${l}/${ns}: ${k} contains markup or an HTML entity (messages are plain text): ${JSON.stringify(v.slice(0, 60))}`);
  if (l === "ar") {
    const m = AR_BACKWARD_GLUE.exec(v);
    if (m) report(`${l}/${ns}: ${k} glues "${m[0].replace(NBSP, "⍽")}" backward with a no-break space; use a normal space before the conjunction and ⍽ after it`);
  }
  for (const chain of v.split(/[ \t\n]+/))
    if (chain.includes(NBSP) && chain.length > MAX_ATOM && /[A-Za-z0-9][^\u00A0]*\u00A0[^\u00A0]*[A-Za-z]/.test(chain))
      report(`${l}/${ns}: ${k} has a ${chain.length}-character no-break run "${chain.replaceAll(NBSP, "⍽")}" (max ${MAX_ATOM}); let it break between its parts`);
  checkLinks(l, ns, k, v);
  if (l !== "tr" && HEADING_KEY.test(k))
    for (const w of v.match(/[\p{Script=Latin}]+/gu) ?? []) if (w.length >= LONG_WORD) warn(`${l}/${ns}: ${k} has a ${w.length}-letter word "${w}" in a heading (no hyphenation in this locale)`);
}

for (const ns of namespaces) {
  const en = flatten(JSON.parse(readFileSync(new URL(`en/${ns}`, root), "utf8")));
  total += en.size;
  for (const [k, v] of en) {
    if (bad(v)) report(`en/${ns}: ${k} is empty/TODO`);
    checkValue("en", ns, k, v);
  }
  for (const l of LOCALES) {
    const file = new URL(`${l}/${ns}`, root);
    if (!existsSync(file)) { report(`${l}/${ns}: file missing`); continue; }
    const other = flatten(JSON.parse(readFileSync(file, "utf8")));
    for (const [k, v] of en) {
      if (!other.has(k)) report(`${l}/${ns}: missing ${k}`);
      else if (k.endsWith("[]") && other.get(k) !== v) report(`${l}/${ns}: ${k} has ${other.get(k)} items, en has ${v}`);
      else if (bad(other.get(k))) report(`${l}/${ns}: ${k} is empty/TODO`);
      else if (typeof v === "string" && placeholders(v) !== placeholders(other.get(k)))
        report(`${l}/${ns}: ${k} has placeholders [${placeholders(other.get(k))}], en has [${placeholders(v)}]`);
      else if (typeof v === "string" && targetsOf(v) !== targetsOf(other.get(k)))
        report(`${l}/${ns}: ${k} links to [${targetsOf(other.get(k))}], en links to [${targetsOf(v)}]`);
    }
    for (const [k, v] of other) {
      if (!en.has(k)) report(`${l}/${ns}: extra key ${k}`);
      checkValue(l, ns, k, v);
    }
  }
}

// Montserrat ships as fontsource's "latin" subset plus ğ Ğ İ Ş ş ("LC Montserrat Ext", src/layouts/BaseLayout.astro);
// any other Latin letter would render in the fallback face. Re-cut that subset (command there) before adding one.
const FONT_HAS = new Set("ıŒœĞğİŞş");
for (const l of ["en", ...LOCALES])
  for (const ns of namespaces) {
    const file = new URL(`${l}/${ns}`, root);
    if (!existsSync(file)) continue;
    for (const ch of new Set(readFileSync(file, "utf8")))
      if (ch > "ÿ" && ch < "＀" && /\p{Script=Latin}/u.test(ch) && !FONT_HAS.has(ch))
        report(`${l}/${ns}: "${ch}" (U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}) is not in the Montserrat subsets`);
  }

/* ------------------------------------------------------------------ data → messages coverage (skipped without src/data) */
const messages = (l, ns) => {
  const file = new URL(`${l}/${ns}.json`, root);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : undefined;
};
const COVERAGE = [
  ["services", "items", SLUGS.services],
  ["industries", "items", SLUGS.industries],
  ["projects", "items", SLUGS.projects],
  ["common", "zones.items", SLUGS.zones],
];
for (const l of ["en", ...LOCALES])
  for (const [ns, path, slugs] of COVERAGE) {
    if (!slugs.length) continue;
    const items = path.split(".").reduce((o, p) => o?.[p], messages(l, ns));
    for (const s of slugs) if (!items?.[s]) report(`${l}/${ns}.json: ${path}.${s} is missing (src/data has the slug "${s}")`);
  }
if (projectsSrc) {
  const tech = messages("en", "tech")?.items ?? {};
  const products = messages("en", "technologies")?.brands?.productNames ?? {};
  const named = new Set([...projectsSrc.matchAll(/technologies: \[([^\]]*)\]/g)].flatMap((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1])));
  for (const t of named) if (!(t in tech) && !(t in products)) report(`en/tech.json: items has no label for "${t}" (src/data/projects.ts technologies)`);
}

if (problems) {
  console.error(`i18n check failed with ${problems} problem(s).`);
  process.exit(process.env.I18N_LENIENT ? 0 : 1);
}
console.log(`i18n check passed (${total} keys × ${LOCALES.length + 1} locales, ${namespaces.length} namespaces${warnings ? `, ${warnings} warning(s)` : ""}).`);
