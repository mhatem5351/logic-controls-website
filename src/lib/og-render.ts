/**
 * Draws the Open Graph cards listed in src/lib/og.ts (build time / dev only — never imported by pages).
 *
 * sharp (already a dependency) composites an SVG background, the logo and, for case studies, the cover photo; the text
 * is set by sharp's Pango text renderer, which does the Unicode bidi algorithm (Arabic RTL with Latin codes inside),
 * Arabic shaping and CJK line breaking. Fonts are the build-only files in src/assets/fonts/og/ (private family
 * names, so a system Montserrat can never be picked), loaded through a throw-away fontconfig file:
 * PANGOCAIRO_BACKEND=fc makes Pango use fontconfig on macOS too (its default there is CoreText, which ignores them).
 * A probe render checks that the bundled font is really used, and every string is checked against the font's
 * character list (`*.chars.txt`), so a missing glyph fails the build instead of shipping tofu.
 */
import sharp, { type OverlayOptions } from "sharp";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Locale } from "~/i18n";
import { LOCALE_META } from "~/i18n";
import { SITE } from "~/data/site";
import { ogSlug, type OgSpec } from "./og";
import { plain } from "./text";

const W = 1200;
const H = 630;
const PAD = 72;
const C = {
  navy950: "#040e27",
  navy900: "#061b45",
  navy100: "#deebfd",
  navy200: "#c1d6f6",
  navy300: "#96b6e8",
  royal300: "#95c6ff",
  royal400: "#5fa4fa",
  signal400: "#ffb02b",
};
const FONT_DIR = resolve(process.cwd(), "src/assets/fonts/og");
const REGEN = "python3 src/assets/fonts/og/build.py <dir with the source fonts> . (instructions at the top of that file)";

/* ------------------------------------------------------------------ fonts */

interface Face {
  family: string;
  file: string;
  chars: Set<string>;
  /** The font's own line height (hhea ascent + descent, in em): Pango's line_height factor multiplies it. */
  natural: number;
}
const face = (family: string, file: string, natural: number): Face => ({
  family,
  file: join(FONT_DIR, `${file}.ttf`),
  chars: new Set(readFileSync(join(FONT_DIR, `${file}.chars.txt`), "utf8")),
  natural,
});
let faces: Record<"latinDisplay" | "latinText" | "arabicDisplay" | "arabicText" | "han", Face> | undefined;
let ready: Promise<void> | undefined;

/** Characters that never need a glyph (layout controls). */
const IGNORABLE = /[\s­​-‏⁠⁦-⁩]/;

function fontsFor(locale: Locale) {
  const f = faces!;
  if (locale === "ar") return { display: f.arabicDisplay, text: f.arabicText };
  if (locale === "zh") return { display: f.han, text: f.han };
  return { display: f.latinDisplay, text: f.latinText };
}

async function setup() {
  faces = {
    latinDisplay: face("LCOG Latin Display", "latin-display", 1.219),
    latinText: face("LCOG Latin Text", "latin-text", 1.219),
    arabicDisplay: face("LCOG Arabic Display", "arabic-display", 1.219),
    arabicText: face("LCOG Arabic Text", "arabic-text", 1.219),
    han: face("LCOG Han Display", "han-display", 1.448),
  };
  const tmp = mkdtempSync(join(tmpdir(), "lc-og-"));
  const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  writeFileSync(
    join(tmp, "fonts.conf"),
    `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><dir>${xml(FONT_DIR)}</dir><cachedir>${xml(tmp)}</cachedir></fontconfig>`,
  );
  process.env.FONTCONFIG_FILE = join(tmp, "fonts.conf");
  process.env.PANGOCAIRO_BACKEND = "fc";
  // Also register every file explicitly (FcConfigAppFontAddFile), in case fontconfig was initialised earlier.
  for (const f of Object.values(faces)) await render("H", f, { size: 20 });
  // Probe: Montserrat ExtraBold Italic "Wg" at 100 px has a 173×89 px ink box; any other face would not.
  const probe = await render("Wg", faces.latinDisplay, { size: 100 });
  if (Math.abs(probe.width - 173) > 3 || Math.abs(probe.height - 89) > 3)
    throw new Error(
      `OG cards: Pango is not using the bundled fonts (probe ${probe.width}×${probe.height}, expected 173×89). ` +
        `Set PANGOCAIRO_BACKEND=fc and FONTCONFIG_FILE before anything else renders text with sharp.`,
    );
}

/* ------------------------------------------------------------------ text */

const markupEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

interface TextOpts {
  size: number;
  /** Wrap width in px (default: no wrapping). */
  width?: number;
  color?: string;
  /** Line height in em (of the font size). */
  lineHeight?: number;
  /** Letter spacing in em. */
  tracking?: number;
  rtl?: boolean;
}
interface Rendered {
  data: Buffer;
  width: number;
  height: number;
}

/** Text → RGBA image cropped to its ink box (sharp/libvips crops to the ink). Arabic: right-aligned RTL paragraph. */
async function render(text: string, f: Face, o: TextOpts): Promise<Rendered> {
  const attrs = [
    `foreground="${o.color ?? "#ffffff"}"`,
    o.lineHeight ? `line_height="${(o.lineHeight / f.natural).toFixed(3)}"` : "",
    o.tracking ? `letter_spacing="${Math.round(o.tracking * o.size * 1024)}"` : "",
  ].join(" ");
  // RLM: the paragraph is RTL even when it starts with a Latin word. Pango swaps left/right alignment for RTL
  // paragraphs (auto-dir), so "left" lays an Arabic paragraph out flush right.
  const body = (o.rtl ? "‏" : "") + markupEsc(text);
  const { data, info } = await sharp({
    text: {
      text: `<span ${attrs}>${body}</span>`,
      font: `${f.family} ${o.size}`,
      fontfile: f.file,
      width: Math.round(o.width ?? 4000),
      align: "left",
      rgba: true,
      dpi: 72,
      wrap: "word",
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function assertCovered(slug: string, text: string, f: Face) {
  for (const ch of text)
    if (!IGNORABLE.test(ch) && !f.chars.has(ch))
      throw new Error(
        `OG card ${slug}: "${ch}" (U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}) is not in ${f.family}. Regenerate the fonts: ${REGEN}`,
      );
}

const HAN = /[\u3400-\u9FFF\uF900-\uFAFF]/;
/** Single-character "words" that may stand alone in a line break (same list as src/lib/text.ts). */
const FUNCTION_ZH = new Set("的了和与及或在为并等对从向把被由将以于而但也就都是有让给中您我你其每各".split(""));
const LRI = "\u2066";
const PDI = "\u2069";

/**
 * Card text (same line-breaking intent as src/lib/text.ts html(), in plain text for Pango). It starts from the
 * engine's plain() (I18N2-16): atoms ("Siemens S7-1200", "4-20 mA", "WinCC Professional") come back glued with NBSP
 * and WORD JOINERs, which Pango honours, so a brand never parts from its model on a shared card. Other display
 * controls are dropped (soft hyphens, U+200B, the engine's bidi isolates: this function adds its own). Arabic: "X و Y"
 * may break before "و" (never after), every Latin run is a left-to-right isolate and a parenthesised Latin gloss stays
 * on one line, so a wrap can never invert its brackets; Chinese: words stay whole (Pango would break between any two
 * Han characters).
 */
function cardText(locale: Locale, s: string): string {
  let t = plain(locale, s).replace(/[\u00AD\u200B\u2066-\u2069]/g, "");
  if (locale === "ar") {
    t = t.replace(/\u00A0(و|مع|في|من|ثم|أو)\u00A0/g, " $1\u00A0");
    t = t.replace(/\([^()\u0600-\u06FF\n]*[A-Za-z][^()\u0600-\u06FF\n]*\)|[A-Za-z0-9][A-Za-z0-9 \u00A0\u2060.\-–/+·°&'%×]*[A-Za-z0-9+°%]|[A-Za-z]/g, (run) =>
      run.startsWith("(") && run.length <= 32 ? LRI + run.replace(/ /g, "\u00A0") + PDI : /[A-Za-z]/.test(run) ? LRI + run + PDI : run,
    );
  }
  if (locale === "zh") {
    const words: string[] = [];
    for (const { segment } of new Intl.Segmenter("zh", { granularity: "word" }).segment(t)) {
      const prev = words[words.length - 1];
      const glue = prev && segment.length === 1 && HAN.test(segment) && !FUNCTION_ZH.has(segment) && HAN.test(prev.slice(-1)) && !(prev.length === 1 && FUNCTION_ZH.has(prev));
      if (glue) words[words.length - 1] = prev + segment;
      else words.push(segment);
    }
    // WORD JOINER between the characters of a word: Pango then breaks only between words.
    t = words.map((w) => (HAN.test(w) ? [...w].join("\u2060") : w)).join("");
  }
  return t;
}

/** Ink height of one line and the step between two lines for a face at a size (for counting wrapped lines). */
const metricsCache = new Map<string, { one: number; step: number }>();
async function lineMetrics(f: Face, size: number, lineHeight: number, rtl: boolean) {
  const k = `${f.family}|${size}|${lineHeight}`;
  let m = metricsCache.get(k);
  if (!m) {
    const probe = f === faces!.han ? "Hg国" : f === faces!.arabicDisplay || f === faces!.arabicText ? "Hgأجل" : "Hg";
    const one = await render(probe, f, { size, lineHeight, rtl });
    const two = await render(`${probe}\n${probe}`, f, { size, lineHeight, rtl });
    m = { one: one.height, step: two.height - one.height };
    metricsCache.set(k, m);
  }
  return m;
}

/** Largest size (≤ max) at which `text` fits `width` in ≤ `maxLines` lines, then the narrowest width that keeps
 *  the same number of lines (balanced lines, no one-word last line). */
async function fitTitle(slug: string, text: string, f: Face, width: number, max: number, min: number, lineHeight: number, rtl: boolean, maxHeight = Infinity) {
  assertCovered(slug, text, f);
  const maxLines = 3;
  const tryAt = async (size: number) => {
    const { one, step } = await lineMetrics(f, size, lineHeight, rtl);
    const r = await render(text, f, { size, width, lineHeight, rtl });
    const n = 1 + Math.max(0, Math.round((r.height - one) / step));
    return { r, n, ok: r.width <= width && n <= maxLines && r.height <= maxHeight };
  };
  // Binary search for the largest size that fits (fit is monotonic in the size).
  let best = await tryAt(max);
  let size = max;
  if (!best.ok) {
    let lo = min;
    let hi = max - 1;
    best = await tryAt(min);
    size = min;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const t = await tryAt(mid);
      if (t.ok) {
        best = t;
        size = mid;
        lo = mid;
      } else hi = mid - 1;
    }
  }
  let out = best.r;
  const lines = best.n;
  if (lines > 1) {
    const { one, step } = await lineMetrics(f, size, lineHeight, rtl);
    let lo = Math.round(width * 0.5);
    let hi = width;
    let bal = out;
    while (hi - lo > 12) {
      const mid = Math.round((lo + hi) / 2);
      const r = await render(text, f, { size, width: mid, lineHeight, rtl });
      const n = 1 + Math.max(0, Math.round((r.height - one) / step));
      if (n === lines && r.width <= mid) {
        bal = r;
        hi = mid;
      } else lo = mid;
    }
    out = bal;
  }
  return out;
}

/* ------------------------------------------------------------------ pieces */

function background(kind: OgSpec["kind"], rtl: boolean): Buffer {
  let grid = "";
  for (let x = 0; x <= W; x += 24) grid += `<line x1="${x}.5" y1="0" x2="${x}.5" y2="${H}" stroke="#96b6e8" stroke-opacity="${x % 120 === 0 ? 0.08 : 0.035}"/>`;
  for (let y = 0; y <= H; y += 24) grid += `<line x1="0" y1="${y}.5" x2="${W}" y2="${y}.5" stroke="#96b6e8" stroke-opacity="${y % 120 === 0 ? 0.08 : 0.035}"/>`;
  const traces =
    kind === "photo"
      ? ""
      : `<g transform="${rtl ? `translate(${W},0) scale(-1,1)` : ""}">
    <g fill="none" stroke="${C.royal400}" stroke-opacity="0.32" stroke-width="2">
      <path d="M1200 150 H1060 L1000 210 V330"/><circle cx="1000" cy="341" r="10"/>
      <path d="M1200 190 H1090 L1040 240 V400"/><circle cx="1040" cy="411" r="10"/>
      <path d="M1200 230 H1120 L1080 270 V300"/><circle cx="1080" cy="311" r="10"/>
    </g>
    <circle cx="1040" cy="411" r="4" fill="${C.signal400}"/></g>`;
  const glowX = rtl ? 0.28 : 0.72;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs><radialGradient id="g" cx="${glowX}" cy="0.35" r="0.75"><stop offset="0" stop-color="#0d2552"/><stop offset="1" stop-color="${C.navy950}"/></radialGradient></defs>
  <rect width="100%" height="100%" fill="url(#g)"/>${grid}${traces}
</svg>`);
}

/** The slanted amber bar used as the eyebrow / footer marker (the logo's ~10° italic). */
const bar = (w: number, h: number) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w + 2}" height="${h}"><polygon points="${h * 0.18 + 1},0 ${w + 1},0 ${w - h * 0.18 + 1},${h} 1,${h}" fill="${C.signal400}"/></svg>`);

async function photoLayer(spec: OgSpec, rtl: boolean): Promise<OverlayOptions[]> {
  const meta = spec.photo as (ImageMetadataLike & { fsPath?: string }) | undefined;
  const file = meta?.fsPath;
  if (!file) throw new Error(`OG card ${ogSlug(spec)}: the cover image has no source path (fsPath)`);
  const pw = 560;
  const px = rtl ? 0 : W - pw;
  const photo = await sharp(file).rotate().resize({ width: pw, height: H, fit: "cover", position: sharp.strategy.attention }).modulate({ saturation: 0.92 }).toBuffer();
  // Blend the photo's inner edge into the navy panel and tint it slightly towards the brand navy.
  const fade = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${H}">
    <defs><linearGradient id="f" x1="${rtl ? 1 : 0}" x2="${rtl ? 0 : 1}" y1="0" y2="0">
      <stop offset="0" stop-color="${C.navy950}" stop-opacity="1"/><stop offset="0.28" stop-color="${C.navy950}" stop-opacity="0.35"/><stop offset="1" stop-color="${C.navy950}" stop-opacity="0.08"/>
    </linearGradient></defs><rect width="100%" height="100%" fill="url(#f)"/>
    <rect x="${rtl ? pw - 3 : 0}" width="3" height="100%" fill="${C.signal400}" fill-opacity="0.9"/></svg>`);
  return [
    { input: photo, left: px, top: 0 },
    { input: fade, left: px, top: 0 },
  ];
}
interface ImageMetadataLike {
  src: string;
  width: number;
  height: number;
}

let logoCache: Map<number, Rendered> | undefined;
async function logo(width: number): Promise<Rendered> {
  logoCache ??= new Map();
  let l = logoCache.get(width);
  if (!l) {
    const { data, info } = await sharp(resolve(process.cwd(), "src/assets/brand/logo-dark.png")).resize({ width }).png().toBuffer({ resolveWithObject: true });
    l = { data, width: info.width, height: info.height };
    logoCache.set(width, l);
  }
  return l;
}

/* ------------------------------------------------------------------ card */

const upper = (locale: Locale, s: string) => (locale === "en" ? s.toUpperCase() : locale === "tr" ? s.toLocaleUpperCase("tr") : s);

/** Fit "a · b · c" into `width`, dropping items from the end. */
async function chipLine(slug: string, items: string[], f: Face, size: number, width: number, rtl: boolean): Promise<Rendered | undefined> {
  const list = [...new Set(items.map((s) => s.trim()).filter(Boolean))];
  for (let n = list.length; n > 0; n--) {
    const text = list.slice(0, n).join("  ·  ");
    assertCovered(slug, text, f);
    const r = await render(text, f, { size, color: C.navy200, rtl });
    if (r.width <= width) return r;
  }
  return undefined;
}

/** Render one card. PNG for flat cards, JPEG for case studies (photo). */
export async function renderOgCard(spec: OgSpec): Promise<{ body: Buffer; type: string }> {
  ready ??= setup();
  await ready;
  const slug = ogSlug(spec);
  const { locale } = spec;
  const rtl = LOCALE_META[locale].dir === "rtl";
  const fonts = fontsFor(locale);
  const latinText = faces!.latinText;
  const layers: OverlayOptions[] = [];
  /** x of a block of width w at the inline start / end of the text column [x0, x1]. */
  const at = (w: number, x0: number, x1: number) => (rtl ? x1 - w : x0);

  if (spec.kind === "photo") layers.push(...(await photoLayer(spec, rtl)));

  // Footer: amber bar + domain, at the inline start.
  const url = await render(new URL(SITE.url).hostname, latinText, { size: 22, color: C.navy300, tracking: 0.04 });
  const footY = H - 56 - url.height;
  const colX0 = rtl ? (spec.kind === "photo" ? 560 + 56 : PAD) : PAD;
  const colX1 = rtl ? W - PAD : spec.kind === "photo" ? W - 560 - 56 : W - PAD;
  const barW = 44;
  layers.push({ input: bar(barW, 8), left: rtl ? colX1 - barW : colX0, top: footY + Math.round(url.height / 2) - 4 });
  layers.push({ input: url.data, left: rtl ? colX1 - barW - 18 - url.width : colX0 + barW + 18, top: footY });

  if (spec.kind === "default") {
    const lg = await logo(560);
    const tagF = fonts.display;
    const tagText = cardText(locale, spec.title);
    const tag = await fitTitle(slug, tagText, tagF, 960, locale === "ar" ? 44 : 40, 28, locale === "ar" ? 1.6 : locale === "zh" ? 1.45 : 1.25, rtl);
    const gap = 36;
    const top = Math.round((footY - 40 - (lg.height + gap + tag.height)) / 2) + 20;
    layers.push({ input: lg.data, left: at(lg.width, PAD - 12, W - PAD + 12), top });
    layers.push({ input: tag.data, left: at(tag.width, PAD, W - PAD), top: top + lg.height + gap });
  } else {
    const lg = await logo(200);
    layers.push({ input: lg.data, left: at(lg.width, colX0 - 6, colX1 + 6), top: 48 });

    const textW = colX1 - colX0 - (spec.kind === "page" ? 170 : 0);
    const x0 = rtl && spec.kind === "page" ? colX0 + 170 : colX0;
    const x1 = rtl ? colX1 : colX0 + textW;

    // Eyebrow
    let eyebrow: Rendered | undefined;
    if (spec.eyebrow) {
      const text = upper(locale, cardText(locale, spec.eyebrow));
      assertCovered(slug, text, fonts.text);
      // One line: shrink a long eyebrow before letting it wrap.
      for (let size = locale === "ar" ? 26 : locale === "zh" ? 24 : 21; ; size -= 1) {
        eyebrow = await render(text, fonts.text, {
          size,
          color: C.royal300,
          tracking: locale === "en" || locale === "tr" ? 0.14 : 0,
          rtl,
          width: size <= 16 ? textW - 44 : undefined,
        });
        if (eyebrow.width <= textW - 44 || size <= 16) break;
      }
    }
    // Chips
    const chips = spec.chips?.length
      ? await chipLine(slug, spec.chips.map((c) => cardText(locale, c)), fonts.text, locale === "ar" ? 25 : 23, textW, rtl)
      : undefined;
    // Title: as large as fits 3 lines and the space left between the logo and the footer.
    const gapE = 26;
    const gapC = 30;
    const areaTop = 48 + lg.height + 36;
    const areaBottom = footY - 44;
    const room = areaBottom - areaTop - (eyebrow ? eyebrow.height + gapE : 0) - (chips ? chips.height + gapC : 0);
    const display = spec.kind === "photo" ? { max: locale === "zh" ? 50 : 54, min: 30 } : { max: locale === "zh" ? 62 : 66, min: 34 };
    const lh = locale === "ar" ? 1.5 : locale === "zh" ? 1.34 : 1.12;
    const title = await fitTitle(slug, cardText(locale, spec.title), fonts.display, textW, locale === "ar" ? display.max - 4 : display.max, display.min, lh, rtl, room);
    const blockH = (eyebrow ? eyebrow.height + gapE : 0) + title.height + (chips ? gapC + chips.height : 0);
    let y = Math.max(areaTop, Math.round(areaTop + (areaBottom - areaTop - blockH) / 2));
    if (eyebrow) {
      const bw = 30;
      layers.push({ input: bar(bw, 7), left: rtl ? x1 - bw : x0, top: y + Math.round(eyebrow.height / 2) - 3 });
      layers.push({ input: eyebrow.data, left: rtl ? x1 - bw - 14 - eyebrow.width : x0 + bw + 14, top: y });
      y += eyebrow.height + gapE;
    }
    layers.push({ input: title.data, left: at(title.width, x0, x1), top: y });
    y += title.height;
    if (chips) layers.push({ input: chips.data, left: at(chips.width, x0, x1), top: y + gapC });
  }

  const img = sharp(background(spec.kind, rtl)).composite(layers);
  if (spec.kind === "photo") return { body: await img.jpeg({ quality: 82, mozjpeg: true, chromaSubsampling: "4:4:4" }).toBuffer(), type: "image/jpeg" };
  return { body: await img.png({ palette: true, quality: 92, compressionLevel: 9, effort: 8 }).toBuffer(), type: "image/png" };
}

/** CS-29: the full horizontal logo centred on a 512×512 white square (Organization.logo in structured data). */
export async function renderSquareLogo(): Promise<Buffer> {
  const lg = await sharp(resolve(process.cwd(), "src/assets/brand/logo.png")).resize({ width: 448 }).toBuffer({ resolveWithObject: true });
  return sharp({ create: { width: 512, height: 512, channels: 4, background: "#ffffff" } })
    .composite([{ input: lg.data, left: Math.round((512 - lg.info.width) / 2), top: Math.round((512 - lg.info.height) / 2) }])
    .flatten({ background: "#ffffff" })
    .png({ compressionLevel: 9 })
    .toBuffer();
}
