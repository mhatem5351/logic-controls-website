/**
 * Plain-text message → safe HTML / display text, with the line-breaking and bidi rules of every locale.
 * The ONE text engine: import from "~/lib/text" (the old re-export shims in sections/main/rich.ts and catalog.ts are
 * gone, CODE2-22).
 *
 * Message strings are plain text (CONTENT.md; scripts/check-i18n.mjs rejects markup). What this adds on top of escaping:
 * - Atoms never wrap inside, in every locale: model codes ("S7-1200", "DVP-12SC", "4-20"), standards
 *   ("IEC 60204-1", "ISA-88"), numbers with units ("72.0 °C", "24 VDC"), multi-word names ("Schneider Electric",
 *   "WinCC Professional", "Logic Controls"), a brand with its model ("Siemens S7-1200", "Wecon HMI"), phone numbers
 *   ("+20 110 319 7233", "010 1234 5678") and e-mail addresses (which may break only right after "@").
 *   Only atoms are glued (never a phrase across "and" / "و" / commas), and none is longer than 20 characters (e-mail
 *   addresses: 40), so a no-wrap piece always fits a narrow card. A brand + model run longer than that keeps only its
 *   inner atoms ("Siemens | WinCC Professional").
 * - Arabic: Latin runs are isolated in <bdi dir="ltr"> so the bidi algorithm never reorders their parts; runs with
 *   ordinary (lower-case) words also get lang="en" so screen readers switch voice ("Siemens", "(Recipe)"), pure codes
 *   and acronyms ("PLC", "S7-1200") don't. A run that is one atom never wraps (global.css: `[dir=rtl] bdi`); a run of
 *   several tokens (`.lc-wrap`) wraps between tokens, keeping its atoms; a name made only of words ("Logic Controls")
 *   is `.lc-nws` like in Latin text (see atomHtml). A parenthesised Latin gloss "(Pressure switch)" is isolated
 *   together with its brackets, so a wrap can never invert them. Space-separated digit groups ("010 1234 5678") are
 *   isolated too: in an RTL paragraph the groups would otherwise be laid out right to left ("5678 1234 010").
 *   Isolate controls (LRI…PDI) already in the copy are dropped and replaced by these rules.
 *   A conjunction / preposition only glues FORWARD: "S7-1200⍽و⍽WinCC" is normalised to "S7-1200 و⍽WinCC", so two
 *   atoms are never fused into one unbreakable run (check-i18n also rejects the backward glue in the copy).
 * - Chinese: breaks only between words (Intl.Segmenter + merge rules, U+200B + `word-break: keep-all`; a merged run of
 *   more than 6 Han characters is halved, so no unbreakable piece is wider than a phone heading line), a number
 *   stays with the measure word after it ("50 多个项目" never breaks after "50"), a closing-punctuation cluster
 *   ("）、", "）；") never splits (WebKit's keep-all breaker would start a line with "、"), nor does "（" from the Latin
 *   word after it (WebKit would end a line with "（"), and "——" / "……" never start a line (they are kept on one line
 *   with the character before them: U+2014 is line-break class B2, which `keep-all` does not protect in Chromium).
 *   U+200B instead of <wbr>: no DOM node per break, and accessible names get no spurious spaces.
 * - Turkish: display text (heading(): headings, card titles, FAQ questions) gets soft hyphens (U+00AD) at Turkish
 *   syllable boundaries in words of 13+ letters, never less than 3 letters on either side of the break; global.css
 *   activates them in headings (`hyphens: manual`). Body text (html(), toHtml()) never carries soft hyphens: WebKit
 *   breaks at U+00AD even under `hyphens: none`, and they would pollute copied text.
 * - " — " / " · " separators stick to the word before them, so a line never starts with a dash or a dot.
 * - Links in copy: `{link:services/machine-retrofits|machine retrofit service}` (internal: locale prefix + trailing
 *   slash added) or `{link:ext:https://www.gafi.gov.eg/|GAFI}` (allow-listed official hosts only, src/lib/link-policy.mjs;
 *   new tab + hidden "opens in a new tab"). html(), toHtml(), heading() and rich() render them; plain() / cleanText()
 *   keep the label. See LINK_TOKEN_SOURCE.
 *
 * ── set:html contract (CODE-02, CODE2-03) ───────────────────────────────────────────────────────────────────────
 * html(), heading(), rich(), emphasize(), ltr(), markup`` and toHtml() return `SafeHtml`: escaped HTML, ready for
 * set:html. The brand is real at run time: the engine records every value it returns with markup or an entity, and
 * only a recorded value is ever passed through as HTML. Everything else is plain text and is escaped — even a string
 * that looks like HTML ("<2 bar>", "R&amp;D"). Nothing guesses from the content. A result without markup reads like
 * the plain text it came from and is rendered again by the next caller, with that caller's locale (CODE3-09).
 * - A component that renders a text prop with set:html calls `toHtml(locale, prop)` (body text) or
 *   `heading(locale, prop)` (headings, titles, short labels): plain text → rendered; SafeHtml → passed through
 *   (never double-escaped).
 * - Markup built in code goes through the `markup` tag: markup`<a href="${href}">${label}</a>` (literal parts are code;
 *   each value is escaped unless it is SafeHtml). rich() placeholders take SafeHtml values the same way.
 * - A prop that only accepts pre-rendered HTML is typed `SafeHtml` (a plain `string` then fails `astro check`).
 * plain() is for text-only contexts (attributes, <title>, aria-label); cleanText() for machine contexts (JSON-LD,
 * og:image:alt) — no typography controls at all.
 *
 * html()    → body HTML for set:html (paragraphs, leads, FAQ answers, summaries, chips…).
 * heading() → display HTML (headings, card titles, FAQ questions, TOC / tile labels): html() + Turkish soft hyphens.
 * plain()   → text-only contexts (attributes, <title>, breadcrumb labels): NBSP / WORD JOINER / LRI…PDI instead of tags.
 *             (U+2011 is avoided on purpose: neither Montserrat nor Alexandria has the glyph, so it would fall back.)
 */
import { getMessages, localePath, type Locale } from "~/i18n";
import { SITE } from "~/data/site";
import { EXTERNAL_HOSTS } from "./link-policy.mjs";

/* ------------------------------------------------------------------ SafeHtml (the set:html contract) */

/** Escaped HTML produced by this module (assignable to string; a plain string is not assignable to it). */
export type SafeHtml = string & { readonly __safeHtml: true };

/**
 * Every string with markup or an entity this module has returned as HTML. toHtml() / heading() / rich() / markup`` /
 * emphasize() treat a value as HTML only when it is in this set; any other string is plain text and gets escaped.
 * A result without either ("Profinet", "PLC" from html("en", …)) is not recorded: it reads exactly like the plain text
 * it came from, so it is plain text wherever it goes next and gets the locale rules of the caller that renders it —
 * heading("ar", "Profinet") isolates it in <bdi dir="ltr" lang="en"> whatever another locale's page rendered first
 * (CODE3-09: a string-only registry made that depend on the build's page order). Strings are deduplicated and the set
 * only ever holds rendered site copy, so it stays small (a few thousand entries per locale).
 */
const ISSUED = new Set<string>();
const MARKUP = /[<&]/;
const safe = (s: string): SafeHtml => {
  if (MARKUP.test(s)) ISSUED.add(s);
  return s as SafeHtml;
};
/**
 * Must this value be passed through as HTML: engine output (html(), heading(), rich(), emphasize(), ltr(), markup``,
 * toHtml()) that carries markup or an entity? Escaping a value without either changes nothing, so it is plain text.
 */
export const isSafeHtml = (value: unknown): value is SafeHtml => typeof value === "string" && ISSUED.has(value);

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]!);

/** A value interpolated into markup: SafeHtml as is, arrays joined, nothing for null / undefined / false, else escaped. */
const piece = (v: unknown): string =>
  v == null || v === false ? "" : Array.isArray(v) ? v.map(piece).join("") : isSafeHtml(v) ? v : esc(String(v));

/**
 * Markup written in code, with values: markup`<a href="${href}" class="link">${label}</a>`. The literal parts are
 * trusted (they are source code, never content); every value is escaped unless it is SafeHtml from this module
 * (arrays are joined; null / undefined / false render nothing). Use it wherever code assembles HTML around engine
 * output (rich() placeholders, a link around ltr(), a <b> around a number), so the result stays SafeHtml.
 */
export function markup(strings: TemplateStringsArray, ...values: unknown[]): SafeHtml {
  let out = strings[0] ?? "";
  values.forEach((v, i) => (out += piece(v) + (strings[i + 1] ?? "")));
  return safe(out);
}

const NBSP = "\u00A0";
const WJ = "\u2060";
const LRI = "\u2066";
const PDI = "\u2069";
const ZWSP = "\u200B";
const SHY = "\u00AD";
/** Isolate controls a caller may already have inserted (old keepCodes output); html() adds its own. */
const CONTROLS = /[\u2066-\u2069]/g;

/* ------------------------------------------------------------------ atoms (never wrap inside) */

/** Multi-word product / brand names (exact spelling; spaces may already be NBSP). */
const NAMES = [
  SITE.name,
  ...SITE.brands,
  "WinCC Professional",
  "WinCC Advanced",
  "WinCC Unified",
  "SIMATIC HMI",
  "TIA Portal",
  "S7-200 SMART",
  "MEAN WELL",
  "EPLAN Electric P8",
  "Modbus TCP",
  "Modbus RTU",
]
  .filter((n) => n.includes(" "))
  .sort((a, b) => b.length - a.length);
const SP = `[ ${NBSP}]`;
/** Latin letters incl. Turkish (codes never swallow Han or Arabic letters next to them). */
const LAT = "A-Za-z\\u00C0-\\u024F";
const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const sp = (n: string) => n.split(" ").map(reEsc).join(SP);

/** Units after a number ("72.0 °C", "24 VDC"…). (The HMI's runtime strings use their own, shorter list in
 *  src/scripts/motion/hmi-bidi.ts: the client bundle never imports this module.) */
export const UNITS = ["°C", "°F", "VDC", "VAC", "kVA", "kW", "mA", "Hz", "ms", "bar", "L/h", "mm", "V", "A", "s", "%"] as const;

/** A platform brand followed by its model ("Siemens S7-1200", "Wecon HMI", "LS Electric M100 VFD"). */
const BRANDS = ["Schneider Electric", "LS Electric", "Siemens", "Delta", "Wecon", "Yaskawa", "VEICHI", "MCGS"];
const MODEL = [`S7-\\d+(?:${SP}SMART)?`, `SIMATIC${SP}HMI`, `WinCC(?:${SP}(?:Professional|Advanced|Unified))?`, "DVP(?:-[A-Z0-9]+)?", "LX3V", "XGB", "M100", "Altivar", "C60N", "EM", "PLCs?", "HMIs?", "VFDs?"];
const BRAND_MODEL_SRC = `\\b(?:${BRANDS.map(sp).join("|")})${SP}(?:${MODEL.join("|")})(?:${SP}(?:PLCs?|HMIs?|VFDs?|SCADA))?(?![\\p{L}\\p{N}\\-/])`;

const ATOM_SRC = [
  // e-mail addresses: one piece (they may exceed MAX_ATOM, see atomHtml)
  `(?<email>[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+)`,
  // phone numbers: "+20 110 319 7233", "+20 10 1234 5678", "011 0319 7233", "010 1234 5678"
  `(?<phone>(?<![\\p{L}\\p{N}])(?:\\+\\d{1,3}(?:${SP}\\d{1,4}){2,4}|0\\d{2,3}(?:${SP}\\d{3,4}){2})(?![\\p{L}\\p{N}]))`,
  // brand + model (only kept whole when it is short enough, see atomsOf)
  `(?<bm>${BRAND_MODEL_SRC})`,
  // numbers with units: "72.0 °C", "4-20 mA", "0-50 Hz", "24 VDC", "15 s", "3000 L/h"
  `(?<![\\p{L}\\p{N}.])\\d+(?:[.,]\\d+)?(?:[-–]\\d+(?:[.,]\\d+)?)?${SP}?(?:${UNITS.map(reEsc).join("|")})(?![\\p{L}\\p{N}])`,
  // a number with an inch / foot (double / single prime) mark, written without a space: "10.1″", "7″", "3′"
  `(?<![\\p{L}\\p{N}.])\\d+(?:[.,]\\d+)?[″′](?![\\p{L}\\p{N}])`,
  // multi-word names
  `(?<name>${NAMES.map(sp).join("|")})`,
  // "LS PLC", "LS XGB" (a two-letter brand never ends a line on its own)
  `\\bLS${SP}[A-Z][\\w-]*`,
  // standards: "IEC 60204-1", "ISA-88", "ISA-18.2", "21 CFR Part 11"
  `\\b(?:IEC|ISO|ISA|EN|UL|NFPA|DIN|NEMA)[ ${NBSP}-]?\\d[\\d.]*(?:-\\d+)*`,
  `\\b\\d+${SP}CFR${SP}Part${SP}\\d+`,
  // codes with hyphen / slash and a digit or an acronym: "S7-1200", "DVP-12SC", "HTST-01", "I/O", "SP/PV", "CIP-ready"
  `[${LAT}0-9]*\\d[${LAT}0-9]*(?:[-/\u2011][${LAT}0-9]+)+`,
  `[${LAT}0-9]+(?:[-/\u2011][${LAT}0-9]*\\d[${LAT}0-9]*)+`,
  `\\b[A-Z]{1,}(?:[-/\u2011][A-Za-z]+)+`,
];
const atomRe = () => new RegExp(ATOM_SRC.join("|"), "gu");
/** Same atoms without brand + model (used inside a brand + model run that is too long to keep whole). */
const innerAtomRe = () => new RegExp(ATOM_SRC.filter((s) => !s.startsWith("(?<bm>")).join("|"), "gu");
/** Atoms longer than this are left breakable (a no-wrap run must always fit a ~300px card). */
const MAX_ATOM = 20;
const MAX_EMAIL = 40;

interface Atom {
  text: string;
  at: number;
  kind: "email" | "phone" | "name" | "atom";
}
/** The atoms of a Latin-script string, in order (a too-long brand + model run yields its inner atoms instead). */
function atomsOf(text: string): Atom[] {
  const out: Atom[] = [];
  for (const m of text.matchAll(atomRe())) {
    const at = m.index ?? 0;
    const g = m.groups ?? {};
    if (g.bm && m[0].length > MAX_ATOM) {
      for (const n of m[0].matchAll(innerAtomRe())) out.push({ text: n[0], at: at + (n.index ?? 0), kind: n.groups?.name ? "name" : "atom" });
    } else out.push({ text: m[0], at, kind: g.email ? "email" : g.phone ? "phone" : g.name ? "name" : "atom" });
  }
  return out;
}
/** The string as one atom, or undefined when it is not exactly one atom. */
const soleAtom = (s: string): Atom | undefined => {
  const a = atomsOf(s);
  return a.length === 1 && a[0]!.text === s ? a[0] : undefined;
};
/** A multi-word name made only of words ("Logic Controls", "Schneider Electric", "WinCC Professional"). */
const isWordName = (a: Atom) => a.kind === "name" && /^[\p{L} \u00A0]+$/u.test(a.text);

/**
 * An atom as HTML: a no-wrap span when it has a break opportunity to protect (space, hyphen, slash). A multi-word
 * name made only of words ("Logic Controls", "Schneider Electric", "WinCC Professional") is also `.lc-nws`: in
 * headings it moves to the next line as one unit and wraps inside only when it is wider than the whole line (zoom /
 * user text spacing at 320px; global.css). Codes, brand + model ("Siemens S7-1200", "LS XGB") and numbers never do.
 */
function atomHtml(a: Atom): string {
  const max = a.kind === "email" ? MAX_EMAIL : MAX_ATOM;
  if (a.text.length > max || !/[\s\-/.\u2011]/.test(a.text)) return esc(a.text);
  // e-mail: may break only right after "@" (a 320px button cannot fit the whole address); <wbr> adds no character,
  // so a copied address stays valid
  if (a.kind === "email") {
    const at = a.text.indexOf("@") + 1;
    return `<span class="lc-nw">${esc(a.text.slice(0, at))}</span><wbr><span class="lc-nw">${esc(a.text.slice(at))}</span>`;
  }
  return `<span class="${isWordName(a) ? "lc-nw lc-nws" : "lc-nw"}">${esc(a.text)}</span>`;
}

/* ------------------------------------------------------------------ Turkish soft hyphens (display text only) */

const TR_VOWEL = /[aeıioöuüâîûAEIİOÖUÜÂÎÛ]/;
/** Words this long get soft hyphens (shorter ones always fit a heading line at phone width). */
const TR_MIN_WORD = 13;
/** Fewest letters left on either side of a break: a 2-letter stub ("ta-", "iş-") reads as a stutter in a heading. */
const TR_MIN_PART = 3;
/**
 * Turkish syllable rule (TDK): between two vowels, a single consonant starts the next syllable ("o-to-ma-tik"),
 * of two or more consonants only the last one does ("kont-rol", "Türk-çe"); two vowels in a row split ("sa-at").
 * No break leaves fewer than 3 letters before or after it ("tara-yıcınızdan", never "ta-rayıcınızdan").
 */
export function trHyphenate(word: string): string {
  if (word.length < TR_MIN_WORD || word.includes(SHY) || /[A-ZÇĞİÖŞÜ]/.test(word.slice(1))) return word;
  const cuts: number[] = [];
  let prev = -1;
  for (let i = 0; i < word.length; i++) {
    if (!TR_VOWEL.test(word[i]!)) continue;
    if (prev >= 0) cuts.push(i - prev - 1 === 0 ? i : i - 1);
    prev = i;
  }
  let out = "";
  let last = 0;
  for (const c of cuts) {
    if (c < TR_MIN_PART || word.length - c < TR_MIN_PART) continue;
    out += word.slice(last, c) + SHY;
    last = c;
  }
  return out + word.slice(last);
}
const TR_WORD = new RegExp(`[A-Za-zÇĞİÖŞÜçğıöşüâîû]{${TR_MIN_WORD},}`, "g");
const trWords = (s: string) => s.replace(TR_WORD, trHyphenate);

/**
 * English display text: a soft hyphen in the few long words the browsers cannot hyphenate in card and tile titles.
 * Chromium builds without an English dictionary and WebKit under the titles' limits (global.css: 5 letters before,
 * 6 after) find no break in "troubleshooting", and a narrow tile then fell back to an emergency break before the
 * comma: "Troubleshooting / , maintenance" (VI4-01, 640 px). The value is where the break goes.
 */
const EN_BREAKS: Record<string, number> = { troubleshooting: 7 };
const EN_WORD = new RegExp(`\\b(?:${Object.keys(EN_BREAKS).join("|")})\\b`, "gi");
const enWords = (s: string) =>
  s.replace(EN_WORD, (w) => {
    const at = EN_BREAKS[w.toLowerCase()];
    return w.slice(0, at) + SHY + w.slice(at);
  });
/** Display-text soft hyphens per locale (heading()). */
const SHY_WORDS: Partial<Record<Locale, (s: string) => string>> = { tr: trWords, en: enWords };

/**
 * Soft hyphens added to rendered HTML (heading() on an html() result, Turkish and English): text between tags only,
 * never inside an atom (`.lc-nw`: codes and names) or the hidden new-tab hint. Entities are never words, so they are safe.
 */
function hyphenateHtml(h: string, words: (s: string) => string): string {
  const skip: boolean[] = [];
  return h
    .split(/(<[^>]*>)/)
    .map((part) => {
      if (part.startsWith("</span")) skip.pop();
      else if (part.startsWith("<span")) skip.push(/class="(?:lc-nw|sr-only)/.test(part));
      else if (!part.startsWith("<") && !skip.includes(true)) return words(part);
      return part;
    })
    .join("");
}

/** Escape + keep atoms on one line (Latin-script text: en, tr, and Latin runs elsewhere). */
function latinHtml(text: string, words?: (s: string) => string): string {
  const seg = (s: string) => esc(words ? words(s) : s);
  let out = "";
  let last = 0;
  for (const a of atomsOf(text)) {
    if (a.at < last) continue;
    out += seg(text.slice(last, a.at)) + atomHtml(a);
    last = a.at + a.text.length;
  }
  return out + seg(text.slice(last));
}

/** Text-only equivalent: NBSP for spaces and a WORD JOINER after hyphens/slashes inside atoms. */
function latinPlain(text: string): string {
  let out = "";
  let last = 0;
  for (const a of atomsOf(text)) {
    if (a.at < last) continue;
    const max = a.kind === "email" ? MAX_EMAIL : MAX_ATOM;
    const glued = a.text.length > max ? a.text : a.text.replace(/ /g, NBSP).replace(/\u2011/g, "-").replace(/([-/])/g, `$1${WJ}`);
    out += text.slice(last, a.at) + glued;
    last = a.at + a.text.length;
  }
  return out + text.slice(last);
}

/* ------------------------------------------------------------------ Arabic (RTL) */

/** Runs of Latin letters/digits with the punctuation that lives inside codes ("S7-200 SMART", "0-10 V", "21 CFR Part 11"). */
const LATIN_RUN_SRC = `\\+?[A-Za-z0-9][A-Za-z0-9 ${NBSP}.\\-\u2011–/+·°&'″%×@${WJ}]*[A-Za-z0-9+°%″]|[A-Za-z]`;
/** A parenthesised gloss without Arabic letters: "(Pressure switch)", "(CIP)", "(I/O)". */
const PAREN_SRC = `\\([^()\\u0600-\\u06FF\\n]*\\)`;
/**
 * Runs that need an LTR isolate: anything with a Latin letter, a digit range / code ("4-20", "1/2"), a "+" number, or
 * space-separated digit groups ("010 1234 5678", "+20 10 1234 5678"): after Arabic letters such digits are Arabic
 * numbers (UBA W2) and the spaces between them take the RTL direction, so the groups would read right to left.
 * A number with an inch / prime mark ("10.1″") too: in RTL the mark would otherwise be drawn before the number.
 * A single number ("50", "2026") reads correctly in RTL and stays in the Arabic flow.
 */
const NEEDS_ISOLATION = /[A-Za-z]|\d[-–/\u2011]\d|^\+\d|^\d+(?:[ \u00A0]\d+)+$|\d[″′]/;
/** Is the whole run one atom or one word ("S7-1200", "Schneider Electric", "IEC 60204-1", "PLC")? */
const isAtomic = (run: string) => run.length <= MAX_ATOM && (!/\s/.test(run) || !!soleAtom(run));
/** Runs with an ordinary word (a lower-case letter) are English for screen readers; codes and acronyms are not. */
const langOf = (run: string) => (/[a-z]/.test(run) ? ` lang="en"` : "");

/**
 * "S7-1200⍽و⍽WinCC" → "S7-1200 و⍽WinCC": a conjunction / preposition after a Latin run glues forward only.
 * A lone "و" (written apart only before a Latin name, a code or a number: "PLC و HMI و SCADA") never ends a line: it
 * glues to what follows (VI4-04: a body line ended "…أنظمة PLC و HMI و"). In display text (`display`: heading()) the
 * negation "لا" also keeps the word it negates: "مهندسون، لا⍽تجّار معدات", never "Engineers, not" with the claim on the
 * next line.
 */
const AR_LINK = "و|مع|في|من|ثم|أو|على|إلى|عن";
const AR_LONE_WAW = /(?<=^|[\s(])و (?=\S)/g;
const AR_NEGATION = /(?<=^|[\s،؛(])لا (?=[\u0621-\u064A])/g;
function arGlue(t: string, display = false): string {
  const out = t
    .replace(new RegExp(`([A-Za-z0-9)\\]%°″])${NBSP}(?=(?:${AR_LINK})(?:[ ${NBSP}]|$))`, "g"), "$1 ")
    .replace(new RegExp(`([A-Za-z][A-Za-z0-9\\-/]*)${NBSP}(?=و[\\u0621-\\u064A])`, "g"), "$1 ")
    .replace(AR_LONE_WAW, `و${NBSP}`);
  return display ? out.replace(AR_NEGATION, `لا${NBSP}`) : out;
}

/**
 * One Latin run → <bdi dir="ltr">. Only atomic runs stay on one line (global.css: `[dir=rtl] bdi`); a run of
 * several tokens ("Siemens S7-1200 PLC", "Testing & Commissioning", "Siemens · Delta") is `.lc-wrap`: it may wrap
 * between its tokens, never inside an atom. A name made only of words ("Logic Controls") is `.lc-nws`, so a narrow
 * heading can still wrap it at its space (A11Y2-23; same rule as atomHtml). Brackets of a gloss go inside the
 * isolate, so a wrap cannot invert them.
 */
function arIsolate(run: string, open = "", close = ""): string {
  const lang = langOf(run);
  if (!isAtomic(run)) return `<bdi dir="ltr"${lang} class="lc-wrap">${esc(open)}${latinHtml(run)}${esc(close)}</bdi>`;
  const atom = soleAtom(run);
  const nws = atom && isWordName(atom) ? ` class="lc-nws"` : "";
  return `<bdi dir="ltr"${lang}${nws}>${esc(open + run + close)}</bdi>`;
}

/**
 * "و⍽<bdi class="lc-nws">SIMATIC HMI</bdi>": a conjunction / preposition glued forward to a word-only name. In a
 * heading the name is an inline-block (global.css PK5), and Chromium breaks before an inline-block even after a no-break
 * space, so a card title ended a line with a lone "و" (I18N3-03 scan). The pair goes in one no-wrap span; the name still
 * wraps inside when it alone is wider than the line.
 */
const AR_LINK_NWS = new RegExp(`(^|[\\s>])((?:${AR_LINK})${NBSP})(<bdi [^>]*class="lc-nws"[^>]*>[^<]*</bdi>)`, "g");

function arHtml(text: string): string {
  return arRuns(text).replace(AR_LINK_NWS, `$1<span class="lc-nw">$2$3</span>`);
}

function arRuns(text: string): string {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(new RegExp(`${PAREN_SRC}|${LATIN_RUN_SRC}`, "g"))) {
    const run = m[0];
    const at = m.index ?? 0;
    const paren = run.startsWith("(");
    if (paren && !/[A-Za-z]/.test(run)) {
      // "(2025)", "(4-20)": brackets stay in the Arabic flow, the inside is handled like any other text
      out += esc(text.slice(last, at)) + "(" + arHtml(run.slice(1, -1)) + ")";
    } else if (!paren && !NEEDS_ISOLATION.test(run)) {
      continue;
    } else {
      out += esc(text.slice(last, at)) + (paren ? arIsolate(run.slice(1, -1), "(", ")") : arIsolate(run));
    }
    last = at + run.length;
  }
  return out + esc(text.slice(last));
}

function arPlain(text: string): string {
  return text.replace(new RegExp(`${PAREN_SRC}|${LATIN_RUN_SRC}`, "g"), (run) => {
    if (!NEEDS_ISOLATION.test(run)) return run;
    return LRI + latinPlain(run) + PDI;
  });
}

/* ------------------------------------------------------------------ Chinese (word-aware line breaking) */

const HAN = /[\u3400-\u9FFF\uF900-\uFAFF]/;
/** Tokens that never start a line: closing punctuation, "——" and "……" (CLREQ). */
const CLOSING = /^[、，。：；！？）」』】》”’%,.:;!?)—…]+$/;
const OPENING = /^[（「『【《“‘(]+$/;
/** A full-width closing mark followed by more closing punctuation: kept on one line (WebKit would split "）、"). */
const CLOSING_CLUSTER = /([^\s<>;&\u200B\u00A0])?([）」』】》”][、，。：；！？）」』】》”’%,.:;!?]+)/g;
/**
 * A dash / ellipsis run ("——", "……"): kept on one line with the character before it. "—" is line-break class B2, and
 * Chromium's `keep-all` still allows a break before it (I18N2-06: the footer pitch started a line with "——" at
 * 360/390px). After markup or an entity (no plain character to hold on to), a WORD JOINER prohibits the break.
 */
const DASH_RUN = /([^\s<>;&\u200B\u00A0\u2060—…])?([—…]+)/g;
/** A token ending in full-width punctuation: a break after it is always allowed. */
const FULLWIDTH_END = /[、，。：；！？）」』】》”…—]$/;
const FUNCTION_ZH = new Set("的了和与及或在为并等对从向把被由将以于而但也就都是有让给中您我你其每各".split(""));
/** A quantity that must stay with the measure word / noun after it: "50", "50+", "4.5", "15%". */
const QUANTITY = /(?:^|[^\p{L}\p{N}\-.\u2011])\d+(?:[.,]\d+)?\+?%?$/u;
let segmenter: Intl.Segmenter | undefined;
/**
 * Chinese words kept whole although Intl.Segmenter splits them (WebKit then breaks "新 | 十月城"): the place names of
 * the zone map and addresses (common.json zones.items, I18N2-08), and machine terms it does not know, which it splits
 * into single characters that zhTokens() would merge into one long run: with them a compound breaks between its words
 * ("四头 | 洗发水 | 灌装机：", I18N3-03). Longest first.
 */
const ZH_WORDS = ["十月六日城", "新十月城", "洗发水", "灌装", "包衣", "蒸煮", "旋盖", "贴标"];
const ZH_WORDS_RE = new RegExp(ZH_WORDS.sort((a, b) => b.length - a.length).join("|"), "g");

interface Tok {
  raw: string;
  html: string;
  kind: "han" | "latin" | "space";
}

/**
 * Word tokens for a Chinese string. Atoms are single tokens; consecutive Latin pieces merge ("S7", "-", "1200");
 * single Han characters merge into the previous word (Intl.Segmenter splits rare terms into characters);
 * punctuation sticks to its word; a quantity sticks to the next Han word.
 */
function zhTokens(text: string): Tok[] {
  segmenter ??= new Intl.Segmenter("zh", { granularity: "word" });
  const pieces: Tok[] = [];
  let last = 0;
  const segment = (s: string) => {
    for (const { segment } of segmenter!.segment(s)) {
      const kind = /^\s+$/.test(segment) ? "space" : HAN.test(segment) ? "han" : "latin";
      pieces.push({ raw: segment, html: esc(segment), kind });
    }
  };
  /* Fixed Chinese words (place names the segmenter splits) are one token each. */
  const pushText = (s: string) => {
    let from = 0;
    for (const m of s.matchAll(ZH_WORDS_RE)) {
      const at = m.index ?? 0;
      if (at > from) segment(s.slice(from, at));
      pieces.push({ raw: m[0], html: esc(m[0]), kind: "han" });
      from = at + m[0].length;
    }
    if (from < s.length) segment(s.slice(from));
  };
  for (const a of atomsOf(text)) {
    if (a.at < last) continue;
    if (a.at > last) pushText(text.slice(last, a.at));
    pieces.push({ raw: a.text, html: atomHtml(a), kind: "latin" });
    last = a.at + a.text.length;
  }
  if (last < text.length) pushText(text.slice(last));

  const out: Tok[] = [];
  let open = "";
  for (const p of pieces) {
    if (p.kind !== "space" && OPENING.test(p.raw)) {
      open += p.raw;
      continue;
    }
    const tok: Tok = { ...p, html: esc(open) + p.html, raw: open + p.raw };
    open = "";
    const prev = out[out.length - 1];
    if (prev && tok.kind !== "space" && prev.kind !== "space") {
      const prevLast = prev.raw.slice(-1);
      const glue =
        CLOSING.test(tok.raw) ||
        // consecutive Latin pieces stay together, but never across full-width punctuation: after "、" / "，" / "）"
        // a line may always break (WebKit's keep-all breaker offers no other opportunity there)
        (tok.kind === "latin" && prev.kind === "latin" && !FULLWIDTH_END.test(prev.raw)) ||
        (tok.kind === "han" && tok.raw.length === 1 && !FUNCTION_ZH.has(tok.raw) && HAN.test(prevLast) && !(prev.raw.length === 1 && FUNCTION_ZH.has(prev.raw))) ||
        (tok.kind === "han" && prev.kind === "latin" && QUANTITY.test(prev.raw));
      if (glue) {
        prev.raw += tok.raw;
        prev.html += tok.html;
        prev.kind = tok.kind === "han" || prev.kind === "han" ? "han" : "latin";
        continue;
      }
    }
    // "50 多个项目": the space after a quantity becomes a no-break space, glued to the next word
    if (tok.kind === "han" && prev?.kind === "space" && prev.raw === " ") {
      const before = out[out.length - 2];
      if (before && before.kind === "latin" && QUANTITY.test(before.raw)) {
        out.pop();
        before.raw += NBSP + tok.raw;
        before.html += "&nbsp;" + tok.html;
        before.kind = "han";
        continue;
      }
    }
    out.push(tok);
  }
  if (open) out.push({ raw: open, html: esc(open), kind: "latin" });
  return out;
}

/**
 * A full-width opening mark is kept on one line with what follows it — the first Latin word or the next character
 * (WebKit's keep-all breaker would otherwise end a line with "（" / "《"); before an atom span the mark moves inside it.
 */
const OPENING_LATIN = /([（「『【《“‘]+)([A-Za-z0-9][A-Za-z0-9.+-]*|[^\s<>&;\u200B\u00A0（「『【《“‘])/g;
const OPENING_ATOM = /([（「『【《“‘]+)<span class="(lc-nw(?: lc-nws)?)">/g;

/**
 * Longest run of Han characters kept unbreakable. A longer run (single characters of an unknown compound, merged by
 * zhTokens()) is wider than a 320px heading line at display sizes (9 × 34px > 288px), and the browser's emergency
 * break then cuts it anywhere, even before "：" (I18N3-03). CLREQ allows a break between any two Han characters, so
 * such a run gets break opportunities that halve it until no piece is longer than this; punctuation stays glued to
 * the character before it.
 */
const ZH_MAX_RUN = 6;
const ZH_LONG_RUN = new RegExp(`[\\u3400-\\u9FFF\\uF900-\\uFAFF]{${ZH_MAX_RUN + 1},}`, "g");
const halveRun = (run: string): string => {
  if (run.length <= ZH_MAX_RUN) return run;
  const mid = Math.ceil(run.length / 2);
  return halveRun(run.slice(0, mid)) + ZWSP + halveRun(run.slice(mid));
};

/** Chinese text → word tokens joined by U+200B (no wrapper). */
function zhInner(text: string): string {
  const toks = zhTokens(text);
  let html = "";
  toks.forEach((t, i) => {
    const prev = toks[i - 1];
    if (prev && prev.kind !== "space" && t.kind !== "space") html += ZWSP;
    html += t.html
      .replace(OPENING_LATIN, `<span class="lc-nw">$1$2</span>`)
      .replace(OPENING_ATOM, `<span class="$2">$1`)
      .replace(CLOSING_CLUSTER, (_, c = "", p) => `<span class="lc-nw">${c}${p}</span>`)
      .replace(DASH_RUN, (m, c: string | undefined, d: string, at: number) =>
        // nothing before the run (start of the text): leave it; after markup / an entity: a WORD JOINER holds it
        c ? `<span class="lc-nw">${c}${d}</span>` : at === 0 ? m : `${WJ}${d}`,
      )
      // Han runs never occur inside a tag or an entity, so this only ever splits text
      .replace(ZH_LONG_RUN, halveRun);
  });
  return html;
}

/** Han or full-width (CJK) punctuation: the text needs the Chinese rules. */
const CJK = /[\u3000-\u303F\u3400-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF“”‘’]/;

function zhHtml(text: string): string {
  if (!CJK.test(text)) return latinHtml(text);
  return `<span class="break-keep">${zhInner(text)}</span>`;
}

/** Word list (for callers that build their own markup, or an aria-label without break hints: zhWords(s).join("")). */
export const zhWords = (text: string) => zhTokens(text).filter((t) => t.kind !== "space").map((t) => t.raw);

function zhPlain(text: string): string {
  return latinPlain(text).replace(/(^|[^\p{L}\p{N}\-.\u2011\u2060])(\d+(?:[.,]\d+)?\+?%?) (?=[\u3400-\u9FFF])/gu, `$1$2${NBSP}`);
}

/* ------------------------------------------------------------------ public API */

/** "A · B · C" lists and "word — word": the dot / dash sticks to the word before it, so a line never starts with it. */
const glueSeparators = (t: string) => t.replace(/ ([·—–])(?= )/g, `${NBSP}$1`);
/** Typography controls a previous html()/plain() pass (or a caller) inserted; every pass starts from clean text. */
const normalize = (text: string) => glueSeparators(text.replace(CONTROLS, "").replace(/\u2011/g, "-").replace(/[\u2060\u200B]/g, ""));

/* ------------------------------------------------------------------ link tokens */

/**
 * A link inside a plain-text message: `{link:<target>|<label>}`.
 * - Internal target: a site path made of a-z, 0-9, "-" and "/" ("services/machine-retrofits", "about"); rendered as
 *   <a href="/<locale>/services/machine-retrofits/"> (the locale prefix and trailing slash are added here).
 * - External target: `ext:https://…` on an allow-listed official host (src/lib/link-policy.mjs, also enforced by
 *   check-i18n); rendered with target="_blank" rel="noopener noreferrer" and a visually hidden "(opens in a new tab)"
 *   (ui.a11y.newTab).
 * The label is plain text and gets the locale's rules like any other text. plain() and cleanText() keep only the
 * label (titles, meta, JSON-LD, attributes). A token that does not match exactly (another scheme, http:, another host,
 * upper case, quotes, an empty label…) is not a link: it stays visible as escaped text.
 * scripts/check-i18n.mjs uses the same pattern (a unit test keeps the two identical) and checks that every internal
 * target is a real route and that every locale of a key has the same targets.
 */
export const LINK_TOKEN_SOURCE = String.raw`\{link:(ext:https:\/\/[^\s|{}"'<>]+|[a-z0-9]+(?:[\/-][a-z0-9]+)*)\|([^{}|]+)\}`;
const linkRe = () => new RegExp(LINK_TOKEN_SOURCE, "g");
const ALLOWED_HOSTS = new Set<string>(EXTERNAL_HOSTS);

interface LinkSeg {
  text: string;
  link?: { href: string; external: boolean };
}
/** The href of a token target, or undefined when it is not a valid link (the token then stays text). */
function linkHref(locale: Locale | undefined, target: string): LinkSeg["link"] {
  if (!target.startsWith("ext:")) return { href: localePath(locale ?? "en", target), external: false };
  try {
    const url = new URL(target.slice(4));
    return url.protocol === "https:" && ALLOWED_HOSTS.has(url.hostname) ? { href: url.href, external: true } : undefined;
  } catch {
    return undefined;
  }
}
/** Text split around its valid link tokens (labels become link segments). */
function linkSegments(locale: Locale | undefined, text: string): LinkSeg[] {
  const out: LinkSeg[] = [];
  let last = 0;
  for (const m of text.matchAll(linkRe())) {
    const link = linkHref(locale, m[1]!);
    if (!link) continue;
    const at = m.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at) });
    out.push({ text: m[2]!, link });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
/** Message text with every valid link token replaced by its label (what text-only contexts show). */
export const linkLabels = (text: string) =>
  text.includes("{link:") ? linkSegments(undefined, text).map((s) => s.text).join("") : text;

function wrapLink(locale: Locale | undefined, seg: LinkSeg, inner: string): string {
  if (!seg.link) return inner;
  const href = esc(seg.link.href);
  if (!seg.link.external) return `<a href="${href}">${inner}</a>`;
  const p = punct(locale);
  const hint = getMessages(locale ?? "en").ui.a11y.newTab;
  return `<a href="${href}" target="_blank" rel="noopener noreferrer">${inner}<span class="sr-only">${esc(p.open + hint + p.close)}</span></a>`;
}

/** One run of text (no link tokens) → HTML with the locale's rules. */
function render(locale: Locale | undefined, text: string, hyphenate: boolean): string {
  const t = normalize(text);
  if (locale === "ar") return arHtml(arGlue(t, hyphenate));
  if (locale === "zh") return zhHtml(t);
  return latinHtml(t, hyphenate && locale ? SHY_WORDS[locale] : undefined);
}

/** Chinese: a line may break at a link edge between two words, never before closing / after opening punctuation. */
const ZH_NO_BREAK_BEFORE = /^[、，。：；！？）」』】》”’%,.:;!?)—…]/;
const ZH_NO_BREAK_AFTER = /[（「『【《“‘(]$/;

export interface HtmlOptions {
  /** Display text (headings, titles): Turkish words of 13+ letters and a few long English ones get soft hyphens, an
   *  Arabic negation keeps its word. Prefer heading(). */
  hyphenate?: boolean;
}

/** Plain text → escaped HTML with the locale's line-breaking / bidi rules (for set:html). Renders link tokens. */
export function html(locale: Locale | undefined, text: string, options: HtmlOptions = {}): SafeHtml {
  const hyphenate = options.hyphenate === true;
  const segs = text.includes("{link:") ? linkSegments(locale, text) : [];
  if (!segs.some((s) => s.link)) return safe(render(locale, text, hyphenate));
  if (locale !== "zh") return safe(segs.map((s) => wrapLink(locale, s, render(locale, s.text, hyphenate))).join(""));
  // Chinese: one keep-all wrapper around the whole sentence; word breaks (U+200B) at the link edges
  let out = "";
  let prev = "";
  let han = false;
  for (const s of segs) {
    const t = normalize(s.text);
    const isHan = CJK.test(t);
    han ||= isHan;
    const edge = (HAN.test(prev.slice(-1)) || HAN.test(t[0] ?? "")) && /\S$/.test(prev) && /^\S/.test(t);
    if (edge && !ZH_NO_BREAK_BEFORE.test(t) && !ZH_NO_BREAK_AFTER.test(prev)) out += ZWSP;
    out += wrapLink(locale, s, isHan ? zhInner(t) : latinHtml(t));
    prev = t;
  }
  return safe(han ? `<span class="break-keep">${out}</span>` : out);
}

/** Plain text → display text for text-only contexts (attributes, <title>, breadcrumb labels). Idempotent. */
export function plain(locale: Locale | undefined, text: string): string {
  const t = normalize(linkLabels(text).replace(/\u00AD/g, ""));
  if (locale === "ar") return arPlain(arGlue(t));
  if (locale === "zh") return zhPlain(t);
  return latinPlain(t);
}

/** Markup or an entity (only used to flag a likely migration miss in toHtml(); never to decide escaping). */
const LOOKS_LIKE_HTML = /<\/?[a-z][^>]*>|&(?:[a-z]+|#\d+|#x[0-9a-f]+);/i;
const flagged = new Set<string>();
/** Unit tests feed hostile strings on purpose: no warnings there. */
const IN_TESTS = !!(globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.VITEST;
function flagUnrendered(value: string): void {
  if (!LOOKS_LIKE_HTML.test(value) || flagged.has(value) || IN_TESTS) return;
  flagged.add(value);
  console.warn(`[text] toHtml(): escaping a string that looks like HTML but was not produced by src/lib/text.ts (build it with markup\`\` or html()): ${JSON.stringify(value.slice(0, 80))}`);
}

/**
 * The set:html contract for body text (paragraphs, leads, answers, summaries, help text): plain text →
 * html(locale, text); SafeHtml from this module passes through unchanged (never double-escaped); any other string is
 * escaped as plain text, however much it looks like HTML. Empty / missing → "".
 */
export function toHtml(locale: Locale | undefined, value: string | SafeHtml | null | undefined): SafeHtml {
  if (!value) return safe("");
  if (isSafeHtml(value)) return value;
  flagUnrendered(value);
  return html(locale, value);
}

/**
 * The set:html contract for display text (headings, card titles, FAQ questions, TOC / tile labels): like toHtml(),
 * and on Turkish pages long words get soft hyphens (U+00AD) at syllable boundaries — added to plain text as it is
 * rendered, or to the text of an html() / emphasize() result. global.css activates them in headings only.
 */
export function heading(locale: Locale | undefined, value: string | SafeHtml | null | undefined): SafeHtml {
  if (!value) return safe("");
  if (!isSafeHtml(value)) {
    flagUnrendered(value);
    return html(locale, value, { hyphenate: true });
  }
  const words = locale && SHY_WORDS[locale];
  return words ? safe(hyphenateHtml(value, words)) : value;
}

/**
 * Text for machine contexts (JSON-LD names, og:image:alt, meta that must match the visible text): link tokens reduced
 * to their labels, tags removed, entities decoded, no typography controls (NBSP → space; WJ, ZWSP, soft hyphen, bidi isolates/marks removed).
 */
export function cleanText(s: string): string {
  const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };
  return linkLabels(s)
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e: string) => ENT[e]!)
    .replace(/[\u00AD\u200B\u200E\u200F\u2060\u2066-\u2069]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A left-to-right island (phone numbers, emails, model codes) for use inside any sentence. Never wraps on RTL pages. */
export const ltr = (s: string): SafeHtml => safe(`<bdi dir="ltr">${latinHtml(s)}</bdi>`);

/**
 * Replace {placeholders} in a plain-text template with HTML snippets; the text around them goes through html().
 * Values must be SafeHtml (html(), ltr(), markup``…); any other string is escaped. Unknown placeholders stay visible.
 */
export function rich(locale: Locale, template: string, vars: Record<string, SafeHtml>): SafeHtml {
  return safe(
    template
      .split(/(\{\w+\})/)
      .map((part) => {
        const key = /^\{(\w+)\}$/.exec(part)?.[1];
        if (key) return Object.hasOwn(vars, key) ? piece(vars[key]) : esc(part);
        return html(locale, part);
      })
      .join(""),
  );
}

/**
 * Wrap the first occurrence of `phrase` (plain text) in <em> inside an HTML string produced by html().
 * Tolerates the markup html() inserts (U+200B / <wbr>, nowrap spans, <bdi>, no-break spaces, soft hyphens); when the
 * match crosses element boundaries each text piece gets its own <em>, so the result always nests correctly.
 * A string that is not SafeHtml is treated as plain text (escaped first).
 */
export function emphasize(htmlString: SafeHtml | string, phrase: string | undefined): SafeHtml {
  const base = isSafeHtml(htmlString) ? htmlString : esc(htmlString);
  if (!phrase) return safe(base);
  const pattern = [...phrase]
    .map((ch) => (/\s/.test(ch) ? "(?: |\u00A0|&nbsp;)" : reEsc(esc(ch))))
    .join("(?:<[^>]+>|\u200B|\u00AD|\u2060)*");
  return safe(
    base.replace(new RegExp(pattern), (m) => {
      if (!/<(?!wbr>)[^>]+>/.test(m)) return `<em>${m}</em>`;
      return m
        .split(/(<[^>]+>)/)
        .map((part) => (!part || part.startsWith("<") ? part : `<em>${part}</em>`))
        .join("");
    }),
  );
}

/** Per-locale punctuation (one place for it: full-width forms in Chinese, the Arabic comma). */
export function punct(locale: Locale | undefined) {
  if (locale === "zh") return { colon: "：", comma: "，", listSep: "、", open: "（", close: "）" } as const;
  if (locale === "ar") return { colon: ": ", comma: "، ", listSep: "، ", open: " (", close: ")" } as const;
  return { colon: ": ", comma: ", ", listSep: ", ", open: " (", close: ")" } as const;
}

/** Western-digit number formatting in every locale (CONTENT.md: never Arabic-Indic digits). */
export const num = (n: number) => String(n);

/** Label/value separator: full-width colon in Chinese. */
export const colon = (locale: Locale) => punct(locale).colon;

/* ------------------------------------------------------------------ technical codes / technology names */

/** Words that are brand / product names (kept in Latin, never case-transformed). */
const BRAND_WORDS = new Set(
  [...NAMES, ...SITE.brands, "Yaskawa", "VEICHI", "SIMATIC", "WinCC", "EPLAN", "MCGS", "Altivar", "Modicon", "Modbus", "PROFINET", "Profinet", "PROFIBUS", "Wecon", "TIA"].flatMap(
    (n) => n.split(" "),
  ),
);
/** One word of a technical code: acronyms (PLC, PLCs, SCADA), tokens with digits (S7-1200, 24, ×3), units. */
const CODE_WORD = /^(?:[A-Z][A-Z0-9\-/+.&]*[A-Z0-9]s?|[A-Z]|[\p{L}]*\d[\p{L}\p{N}\-/+.]*|×\d+|[\d.,]+|mA|VDC|VAC|kW|kVA|Hz|°C|ms|\/|·|&|\+)$/u;

/**
 * Is this a technical code / brand name ("PLC", "24 VDC", "LS XGB", "Siemens S7-1200 PLC", "Yaskawa VFDs")?
 * Codes keep the Latin HMI look and LTR order on every page; ordinary words ("Motion control", "Dolum makinesi")
 * are not codes, so they keep the page language (Turkish casing, Arabic font).
 */
export function isCode(s: string): boolean {
  const words = s.trim().split(/\s+/);
  return words.length > 0 && words.every((w) => BRAND_WORDS.has(w) || CODE_WORD.test(w));
}

/**
 * Localised name of a technology string from src/data/projects.ts ("Yaskawa VFDs", "Motion control"):
 * messages/<locale>/tech.json `items`, then technologies.brands.productNames, else the English string.
 */
export function techLabel(locale: Locale | undefined, s: string): string {
  if (!locale) return s;
  const t = getMessages(locale);
  const tech = (t.tech as { items?: Record<string, string> } | undefined)?.items;
  const products = (t.technologies?.brands as { productNames?: Record<string, string> } | undefined)?.productNames;
  return tech?.[s] ?? products?.[s] ?? s;
}
