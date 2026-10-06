/**
 * Plain-text message → safe HTML / display text, with the line-breaking and bidi rules of every locale.
 * The ONE place for these rules: rich.ts (main pages), catalog.ts (catalog pages), Card, Chips, FAQ… all delegate here.
 *
 * Message strings are plain text (CONTENT.md). What this adds on top of escaping:
 * - Atoms never wrap inside, in every locale: model codes ("S7-1200", "DVP-12SC", "4-20"), standards
 *   ("IEC 60204-1", "ISA-88"), numbers with units ("72.0 °C", "24 VDC") and multi-word names ("Schneider Electric",
 *   "WinCC Professional", "Logic Controls").
 *   Only atoms are glued (never a phrase across "and" / "و" / commas), and none is longer than 20 characters, so a
 *   no-wrap piece always fits a narrow card.
 * - Arabic: Latin runs are isolated in <bdi dir="ltr"> so the bidi algorithm never reorders their parts. A run that is
 *   one atom never wraps (global.css: `[dir=rtl] bdi`); a run of several tokens (`.lc-wrap`) wraps between tokens,
 *   keeping its atoms. A parenthesised Latin gloss "(Pressure switch)" is isolated together with its brackets, so a
 *   wrap can never invert them.
 * - Chinese: breaks only between words (Intl.Segmenter + merge rules, <wbr> + `word-break: keep-all`), a number
 *   stays with the measure word after it ("50 多个项目" never breaks after "50").
 *
 * html()  → HTML for set:html (headings, card titles/summaries, chips, FAQ…).
 * plain() → text-only contexts (attributes, <title>, breadcrumb labels): NBSP / WORD JOINER / LRI…PDI instead of tags.
 *           (U+2011 is avoided on purpose: neither Montserrat nor Alexandria has the glyph, so it would fall back.)
 */
import { getMessages, type Locale } from "~/i18n";
import { SITE } from "~/data/site";

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]!);

const NBSP = "\u00A0";
const WJ = "\u2060";
const LRI = "\u2066";
const PDI = "\u2069";
/** Isolate / joiner controls a caller may already have inserted (old keepCodes output); html() adds its own. */
const CONTROLS = /[\u2066-\u2069]/g;

/** A left-to-right island (phone numbers, emails, model codes) for use inside any sentence. Never wraps on RTL pages. */
export const ltr = (s: string) => `<bdi dir="ltr">${esc(s)}</bdi>`;

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
const ATOM_SRC = [
  // numbers with units: "72.0 °C", "4-20 mA", "0-50 Hz", "24 VDC", "15 s", "3000 L/h"
  `(?<![\\p{L}\\p{N}.])\\d+(?:[.,]\\d+)?(?:[-–]\\d+(?:[.,]\\d+)?)?${SP}?(?:°C|°F|VDC|VAC|kVA|kW|mA|Hz|ms|bar|L/h|mm|V|A|s|%)(?![\\p{L}\\p{N}])`,
  // multi-word names
  ...NAMES.map((n) => n.split(" ").map(reEsc).join(SP)),
  // "LS PLC", "LS XGB" (a two-letter brand never ends a line on its own)
  `\\bLS${SP}[A-Z][\\w-]*`,
  // standards: "IEC 60204-1", "ISA-88", "ISA-18.2", "21 CFR Part 11"
  `\\b(?:IEC|ISO|ISA|EN|UL|NFPA|DIN|NEMA)[ ${NBSP}-]?\\d[\\d.]*(?:-\\d+)*`,
  `\\b\\d+${SP}CFR${SP}Part${SP}\\d+`,
  // codes with hyphen / slash and a digit or an acronym: "S7-1200", "DVP-12SC", "HTST-01", "I/O", "SP/PV", "CIP-ready"
  `[${LAT}0-9]*\\d[${LAT}0-9]*(?:[-/\u2011][${LAT}0-9]+)+`,
  `[${LAT}0-9]+(?:[-/\u2011][${LAT}0-9]*\\d[${LAT}0-9]*)+`,
  `\\b[A-Z]{1,}(?:[-/\u2011][A-Za-z]+)+`,
].join("|");
const atomRe = () => new RegExp(ATOM_SRC, "gu");
/** Atoms longer than this are left breakable (a no-wrap run must always fit a ~300px card). */
const MAX_ATOM = 20;
/** An atom as HTML: a no-wrap span when it has a break opportunity to protect (space, hyphen, slash). */
const atomHtml = (a: string) => (a.length <= MAX_ATOM && /[\s\-/\u2011]/.test(a) ? `<span class="lc-nw">${esc(a)}</span>` : esc(a));

/** Escape + keep atoms on one line (Latin-script text: en, tr, and Latin runs elsewhere). */
function latinHtml(text: string): string {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(atomRe())) {
    const at = m.index ?? 0;
    out += esc(text.slice(last, at)) + atomHtml(m[0]);
    last = at + m[0].length;
  }
  return out + esc(text.slice(last));
}

/** Text-only equivalent: NBSP for spaces and a WORD JOINER after hyphens/slashes inside atoms. */
function latinPlain(text: string): string {
  return text.replace(atomRe(), (m) => (m.length > MAX_ATOM ? m : m.replace(/ /g, NBSP).replace(/\u2011/g, "-").replace(/([-/])/g, `$1${WJ}`)));
}

/* ------------------------------------------------------------------ Arabic (RTL) */

/** Runs of Latin letters/digits with the punctuation that lives inside codes ("S7-200 SMART", "0-10 V", "21 CFR Part 11"). */
const LATIN_RUN_SRC = `[A-Za-z0-9][A-Za-z0-9 ${NBSP}.\\-\u2011–/+·°&'″%×${WJ}]*[A-Za-z0-9+°%″]|[A-Za-z]`;
/** A parenthesised gloss without Arabic letters: "(Pressure switch)", "(CIP)", "(I/O)". */
const PAREN_SRC = `\\([^()\\u0600-\\u06FF\\n]*\\)`;
const NEEDS_ISOLATION = /[A-Za-z]|\d[-–/\u2011]\d/;
/** Is the whole run one atom or one word ("S7-1200", "Schneider Electric", "IEC 60204-1", "PLC")? */
const isAtomic = (run: string) => run.length <= MAX_ATOM && (!/\s/.test(run) || [...run.matchAll(atomRe())].some((m) => m[0] === run));

/**
 * One Latin run → <bdi dir="ltr">. Only atomic runs stay on one line (global.css: `[dir=rtl] bdi`); a run of
 * several tokens ("Siemens S7-1200 PLC", "Testing & Commissioning", "Siemens · Delta") is `.lc-wrap`: it may wrap
 * between its tokens, never inside an atom. Brackets of a gloss go inside the isolate, so a wrap cannot invert them.
 */
function arIsolate(run: string, open = "", close = ""): string {
  return isAtomic(run) ? `<bdi dir="ltr">${esc(open + run + close)}</bdi>` : `<bdi dir="ltr" class="lc-wrap">${esc(open)}${latinHtml(run)}${esc(close)}</bdi>`;
}

function arHtml(text: string): string {
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
    if (!/[A-Za-z]/.test(run) && !NEEDS_ISOLATION.test(run)) return run;
    return LRI + latinPlain(run) + PDI;
  });
}

/* ------------------------------------------------------------------ Chinese (word-aware line breaking) */

const HAN = /[\u3400-\u9FFF\uF900-\uFAFF]/;
const CLOSING = /^[、，。：；！？）」』】》%,.:;!?)]+$/;
const OPENING = /^[（「『【《(]+$/;
const FUNCTION_ZH = new Set("的了和与及或在为并等对从向把被由将以于而但也就都是有让给中您我你其每各".split(""));
/** A quantity that must stay with the measure word / noun after it: "50", "50+", "4.5", "15%". */
const QUANTITY = /(?:^|[^\p{L}\p{N}\-.\u2011])\d+(?:[.,]\d+)?\+?%?$/u;
let segmenter: Intl.Segmenter | undefined;

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
  const pushText = (s: string) => {
    for (const { segment } of segmenter!.segment(s)) {
      const kind = /^\s+$/.test(segment) ? "space" : HAN.test(segment) ? "han" : "latin";
      pieces.push({ raw: segment, html: esc(segment), kind });
    }
  };
  for (const m of text.matchAll(atomRe())) {
    const at = m.index ?? 0;
    if (at > last) pushText(text.slice(last, at));
    pieces.push({ raw: m[0], html: atomHtml(m[0]), kind: "latin" });
    last = at + m[0].length;
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
        (tok.kind === "latin" && prev.kind === "latin") ||
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

function zhHtml(text: string): string {
  if (!HAN.test(text)) return latinHtml(text);
  const toks = zhTokens(text);
  let html = "";
  toks.forEach((t, i) => {
    const prev = toks[i - 1];
    if (prev && prev.kind !== "space" && t.kind !== "space") html += "<wbr>";
    html += t.html;
  });
  return `<span class="break-keep">${html}</span>`;
}

/** Word list (kept for callers that build their own markup). */
export const zhWords = (text: string) => zhTokens(text).filter((t) => t.kind !== "space").map((t) => t.raw);

function zhPlain(text: string): string {
  return latinPlain(text).replace(/(^|[^\p{L}\p{N}\-.\u2011\u2060])(\d+(?:[.,]\d+)?\+?%?) (?=[\u3400-\u9FFF])/gu, `$1$2${NBSP}`);
}

/* ------------------------------------------------------------------ public API */

/** "A · B · C" lists: the dot sticks to the item before it, so a line never starts with "·". */
const glueSeparators = (t: string) => t.replace(/ ·(?= )/g, `${NBSP}·`);

/** Plain text → escaped HTML with the locale's line-breaking / bidi rules (for set:html). */
export function html(locale: Locale | undefined, text: string): string {
  const t = glueSeparators(text.replace(CONTROLS, "").replace(/\u2011/g, "-"));
  if (locale === "ar") return arHtml(t);
  if (locale === "zh") return zhHtml(t);
  return latinHtml(t);
}

/** Plain text → display text for text-only contexts (attributes, <title>, breadcrumb labels). Idempotent. */
export function plain(locale: Locale | undefined, text: string): string {
  const t = glueSeparators(text.replace(CONTROLS, "").replace(/\u2011/g, "-").replace(/\u2060/g, ""));
  if (locale === "ar") return arPlain(t);
  if (locale === "zh") return zhPlain(t);
  return latinPlain(t);
}

/**
 * Replace {placeholders} in a plain-text template with HTML snippets; the text around them goes through html().
 * Unknown placeholders are left visible.
 */
export function rich(locale: Locale, template: string, vars: Record<string, string>): string {
  return template
    .split(/(\{\w+\})/)
    .map((part) => {
      const key = /^\{(\w+)\}$/.exec(part)?.[1];
      if (key) return vars[key] ?? esc(part);
      return html(locale, part);
    })
    .join("");
}

/**
 * Wrap the first occurrence of `phrase` (plain text) in <em> inside an HTML string produced by html().
 * Tolerates the markup html() inserts (<wbr>, nowrap spans, <bdi>, no-break spaces); when the match crosses
 * element boundaries each text piece gets its own <em>, so the result always nests correctly.
 */
export function emphasize(htmlString: string, phrase: string | undefined): string {
  if (!phrase) return htmlString;
  const pattern = [...phrase]
    .map((ch) => (/\s/.test(ch) ? "(?: |\u00A0|&nbsp;)" : reEsc(esc(ch))))
    .join("(?:<[^>]+>)*");
  return htmlString.replace(new RegExp(pattern), (m) => {
    if (!/<(?!wbr>)[^>]+>/.test(m)) return `<em>${m}</em>`;
    return m
      .split(/(<[^>]+>)/)
      .map((part) => (!part || part.startsWith("<") ? part : `<em>${part}</em>`))
      .join("");
  });
}

/** Western-digit number formatting in every locale (CONTENT.md: never Arabic-Indic digits). */
export const num = (n: number) => String(n);

/** Label/value separator: full-width colon in Chinese. */
export const colon = (locale: Locale) => (locale === "zh" ? "：" : ": ");

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
 * Codes keep the Latin HMI look and LTR order on every page; ordinary words ("Motor control", "Dolum makinesi")
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
