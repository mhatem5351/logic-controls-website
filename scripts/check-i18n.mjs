// Fails the build if any locale is missing a key from the English files (the source of truth),
// has extra keys, a different array length, or an empty string / TODO marker — or uses a Latin letter
// that the Montserrat files the site ships don't have.
import { readFileSync, readdirSync, existsSync } from "node:fs";

const LOCALES = ["ar", "zh", "tr"];
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

let problems = 0, total = 0;
const report = (msg) => (problems++, console.error(`  ✗ ${msg}`));
const bad = (v) => v === "" || /\bTODO\b/.test(String(v));

for (const ns of namespaces) {
  const en = flatten(JSON.parse(readFileSync(new URL(`en/${ns}`, root), "utf8")));
  total += en.size;
  for (const [k, v] of en) if (bad(v)) report(`en/${ns}: ${k} is empty/TODO`);
  for (const l of LOCALES) {
    const file = new URL(`${l}/${ns}`, root);
    if (!existsSync(file)) { report(`${l}/${ns}: file missing`); continue; }
    const other = flatten(JSON.parse(readFileSync(file, "utf8")));
    for (const [k, v] of en) {
      if (!other.has(k)) report(`${l}/${ns}: missing ${k}`);
      else if (k.endsWith("[]") && other.get(k) !== v) report(`${l}/${ns}: ${k} has ${other.get(k)} items, en has ${v}`);
      else if (bad(other.get(k))) report(`${l}/${ns}: ${k} is empty/TODO`);
    }
    for (const k of other.keys()) if (!en.has(k)) report(`${l}/${ns}: extra key ${k}`);
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
      if (ch > "\u00FF" && ch < "\uFF00" && /\p{Script=Latin}/u.test(ch) && !FONT_HAS.has(ch))
        report(`${l}/${ns}: "${ch}" (U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}) is not in the Montserrat subsets`);
  }

if (problems) {
  console.error(`i18n check failed with ${problems} problem(s).`);
  process.exit(process.env.I18N_LENIENT ? 0 : 1);
}
console.log(`i18n check passed (${total} keys × ${LOCALES.length + 1} locales, ${namespaces.length} namespaces).`);
