/**
 * Plain-text → safe HTML helpers for the main pages.
 *
 * Message strings are plain text (CONTENT.md). Components that render with `set:html` (Hero, SectionHeading,
 * CtaBand title, FAQ answers) must receive escaped HTML. On Arabic pages, Latin runs (model codes, protocols,
 * brand names: "S7-1200", "IEC 60204-1", "4-20 mA") are wrapped in <bdi dir="ltr"> so the bidi algorithm never
 * reorders them, and {placeholders} can be replaced by HTML (links, LTR phone numbers).
 */
import type { Locale } from "~/i18n";

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]!);

/** A left-to-right island (phone numbers, emails, model codes) for use inside any sentence. */
export const ltr = (s: string) => `<bdi dir="ltr">${esc(s)}</bdi>`;

/** Runs of Latin letters/digits with the punctuation that lives inside codes ("S7-200 SMART", "0-10 V", "21 CFR Part 11"). */
const LATIN_RUN = /[A-Za-z0-9][A-Za-z0-9 .\-–/+·°&'″%]*[A-Za-z0-9+°%″]|[A-Za-z]/g;
const NEEDS_ISOLATION = /[A-Za-z]|\d[-–/]\d/;

/** Escape plain text; on RTL pages also isolate Latin runs; on Chinese pages keep words together when wrapping. */
export function html(locale: Locale, text: string): string {
  if (locale === "zh") return zhWrap(text);
  if (locale !== "ar") return esc(text);
  let out = "";
  let last = 0;
  for (const m of text.matchAll(LATIN_RUN)) {
    const run = m[0];
    const at = m.index ?? 0;
    if (!NEEDS_ISOLATION.test(run)) continue;
    out += esc(text.slice(last, at)) + `<bdi dir="ltr">${esc(run)}</bdi>`;
    last = at + run.length;
  }
  return out + esc(text.slice(last));
}

/* ---------- Chinese line breaking ----------
 * Browsers may break Han text between any two characters, which splits words like 编程 or 自动化 across lines
 * in large headings. We segment at build time (Intl.Segmenter + a few merge rules), allow breaks only between
 * words (<wbr>) and switch the run to `word-break: keep-all` (Tailwind `break-keep`). */
const HAN = /[\u3400-\u9FFF\uF900-\uFAFF]/;
const CLOSING = /^[、，。：；！？）」』】》%,.:;!?)]+$/;
const OPENING = /^[（「『【《(]+$/;
const FUNCTION_ZH = new Set("的了和与及或在为并等对从向把被由将以于而但也就都是有让给中您我你其每各".split(""));
let segmenter: Intl.Segmenter | undefined;

function zhWords(text: string): string[] {
  segmenter ??= new Intl.Segmenter("zh", { granularity: "word" });
  const out: string[] = [];
  let open = "";
  for (const { segment } of segmenter.segment(text)) {
    if (OPENING.test(segment)) {
      open += segment;
      continue;
    }
    const s = open + segment;
    open = "";
    const prev = out[out.length - 1];
    const prevLast = prev?.slice(-1) ?? "";
    const glueToPrev =
      prev !== undefined &&
      (CLOSING.test(segment) ||
        (segment.length === 1 && HAN.test(segment) && !FUNCTION_ZH.has(segment) && HAN.test(prevLast) && !(prev.length === 1 && FUNCTION_ZH.has(prev))));
    if (glueToPrev) out[out.length - 1] = prev + s;
    else out.push(s);
  }
  if (open) out.push(open);
  return out;
}

function zhWrap(text: string): string {
  if (!HAN.test(text)) return esc(text);
  return `<span class="break-keep">${zhWords(text).map(esc).join("<wbr>")}</span>`;
}

/**
 * Replace {placeholders} in a plain-text template with HTML snippets; the text around them is escaped
 * (and bidi-isolated on Arabic pages). Unknown placeholders are left visible.
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
 * Wrap the first occurrence of `phrase` (plain text) in <em> inside an HTML string produced by html()
 * (tolerates the <wbr> word-break hints inserted on Chinese pages).
 */
export function emphasize(htmlString: string, phrase: string | undefined): string {
  if (!phrase) return htmlString;
  const pattern = [...esc(phrase)].map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("(?:<wbr>)?");
  return htmlString.replace(new RegExp(pattern), (m) => `<em>${m}</em>`);
}

/** Western-digit number formatting in every locale (CONTENT.md: never Arabic-Indic digits). */
export const num = (n: number) => String(n);

/** Label/value separator: full-width colon in Chinese. */
export const colon = (locale: Locale) => (locale === "zh" ? "：" : ": ");
