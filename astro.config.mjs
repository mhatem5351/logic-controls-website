// @ts-check
import { defineConfig, fontProviders } from "astro/config";
import sitemap from "@astrojs/sitemap";
import cspInlineHashes from "./integrations/csp-inline-hashes.mjs";
import heroPreload from "./integrations/hero-preload.mjs";
import siteScripts from "./integrations/site-scripts.mjs";
import tailwindcss from "@tailwindcss/vite";
import { lastModFor } from "./scripts/content-dates.mjs";
// One locale list for the whole site (src/i18n/config.ts has no imports, so the config can load it directly).
import { LOCALES, LOCALE_META, DEFAULT_LOCALE } from "./src/i18n/config.ts";

/** fontsource's "latin" / "arabic" unicode-ranges (fonts below), so each file is only fetched for text that needs it. */
/** @type {[string, ...string[]]} */
const FONT_RANGE_LATIN = ["U+0000-00FF", "U+0131", "U+0152-0153", "U+02BB-02BC", "U+02C6", "U+02DA", "U+02DC", "U+0304", "U+0308", "U+0329", "U+2000-206F", "U+20AC", "U+2122", "U+2191", "U+2193", "U+2212", "U+2215", "U+FEFF", "U+FFFD"];
/** @type {[string, ...string[]]} */
const FONT_RANGE_ARABIC = ["U+0600-06FF", "U+0750-077F", "U+0870-088E", "U+0890-0891", "U+0897-08E1", "U+08E3-08FF", "U+200C-200E", "U+2010-2011", "U+204F", "U+2E41", "U+FB50-FDFF", "U+FE70-FE74", "U+FE76-FEFC"];

export default defineConfig({
  site: "https://logic-controls.com",
  trailingSlash: "always",
  build: { format: "directory" },
  i18n: {
    locales: [...LOCALES],
    defaultLocale: DEFAULT_LOCALE,
    routing: { prefixDefaultLocale: true, redirectToDefaultLocale: false },
  },
  integrations: [
    // Completes the CSP <meta> below with the hashes of each page's inline scripts (incl. is:inline) after the build.
    cspInlineHashes(),
    // <head> preloads for each page's hero photo (phone band + desktop panel), copied from the built <picture> (PERF2-03).
    heroPreload(),
    sitemap({
      i18n: { defaultLocale: DEFAULT_LOCALE, locales: Object.fromEntries(LOCALES.map((l) => [l, LOCALE_META[l].hreflang])) },
      // /en/art/<kind>/: illustration fragments for lazy art slots (src/pages/[lang]/art/[kind].astro), not pages for people.
      filter: (page) =>
        !page.includes("/thanks/") && !page.includes("/styleguide/") && !page.includes("/lab/") && !page.includes("/art/") && page !== "https://logic-controls.com/",
      // <lastmod>: when the page's OWN content last changed (its copy subtree + data record + photos), from the committed
      // src/data/content-dates.json (scripts/content-dates.mjs; no git history needed, so shallow CI clones are fine).
      // x-default: the same target every page declares in its <head> (Seo.astro): the English page, the root for home.
      // No changefreq / priority (search engines ignore them).
      serialize(item) {
        const lastmod = lastModFor(item.url);
        const [locale, ...rest] = new URL(item.url).pathname.split("/").filter(Boolean);
        const xDefault = rest.length ? item.url.replace(`/${locale}/`, `/${DEFAULT_LOCALE}/`) : new URL("/", item.url).href;
        const links = item.links?.length ? [...item.links, { url: xDefault, lang: "x-default" }] : item.links;
        return { ...item, ...(links ? { links } : {}), ...(lastmod ? { lastmod } : {}) };
      },
    }),
  ],
  // Self-hosted variable fonts (src/assets/fonts/), cut from fontsource's files
  // (https://cdn.jsdelivr.net/fontsource/fonts/{montserrat,alexandria}:vf@latest/<subset>-wght-<style>.woff2) down to the
  // weights the CSS uses, so less font is on the critical path:
  //   Montserrat upright: latin, wght 100–900 as published (a 400–800 cut is larger, the defaults move; kept hinted for
  //     16px body text on Windows). Italic: latin, wght 700–800 only (italic is used only by the 700/800 display type),
  //     unhinted (headings / large sizes) — 25 KB instead of 40 KB. An italic below 700 would render at 700.
  //   Alexandria: arabic + latin, wght 400–800 (no 100–300 / 900 anywhere) — 23 + 22 KB instead of 31 + 30 KB.
  // Same outlines, metrics and advance widths at every used weight (checked with fonttools), so the metric-matched
  // fallbacks stay exact. Recipe (fonttools 4.66):
  //   fonttools varLib.instancer <in>.woff2 wght=700:800 -o tmp.ttf
  //   pyftsubset tmp.ttf --unicodes='*' --layout-features='*' --name-IDs='*' --notdef-outline [--no-hinting] \
  //     --flavor=woff2 --output-file=src/assets/fonts/<name>.woff2
  // Fallbacks: metric-matched local faces defined in src/styles/global.css ("metric-matched font fallbacks"), one size
  // per weight band and script, so the font swap does not re-wrap text (CLS). Astro's generated fallback is turned off:
  // it used a single size for every weight and Latin metrics for Arabic. No generic family at the end of
  // --font-latin: stacks that use it add their own (`--font-sans`, the zh stack), so a script stack listed after
  // Montserrat (PingFang SC, Microsoft YaHei…) is reached before `system-ui` / `sans-serif` (I18N-12).
  // Montserrat: "latin" only. Turkish needs just ğ Ğ İ Ş ş beyond it (ı is in "latin"); those come from
  // "LC Montserrat Ext", a ~5 KB subset of fontsource's latin-ext files (src/layouts/BaseLayout.astro), instead of the
  // 72 + 76 KB latin-ext files, which were on Turkish pages' critical path.
  fonts: [
    {
      provider: fontProviders.local(),
      name: "Montserrat",
      cssVariable: "--font-latin",
      fallbacks: ["LC Montserrat Ext", "LC Montserrat Fallback"],
      optimizedFallbacks: false,
      options: {
        variants: [
          { src: ["./src/assets/fonts/montserrat-latin-normal.woff2"], weight: "100 900", style: "normal", unicodeRange: FONT_RANGE_LATIN },
          { src: ["./src/assets/fonts/montserrat-latin-italic.woff2"], weight: "700 800", style: "italic", unicodeRange: FONT_RANGE_LATIN },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: "Alexandria",
      cssVariable: "--font-arabic",
      fallbacks: ["LC Alexandria Fallback", "Segoe UI", "Tahoma", "sans-serif"],
      optimizedFallbacks: false,
      options: {
        variants: [
          { src: ["./src/assets/fonts/alexandria-arabic.woff2"], weight: "400 800", style: "normal", unicodeRange: FONT_RANGE_ARABIC },
          { src: ["./src/assets/fonts/alexandria-latin.woff2"], weight: "400 800", style: "normal", unicodeRange: FONT_RANGE_LATIN },
        ],
      },
    },
  ],
  image: { layout: "constrained", responsiveStyles: true },
  // No Markdown pages: Shiki's code highlighting (inline styles) is never used, and off it stops the CSP warning.
  markdown: { syntaxHighlight: false },
  // Content-Security-Policy <meta> on every page: script-src without 'unsafe-inline' (hashes of the page's inline
  // scripts, see integrations/csp-inline-hashes.mjs); styles keep 'unsafe-inline' (style="" attributes and the art
  // fragments' <style>). The rest of the policy (frame-ancestors, connect-src, …) stays in public/_headers; browsers
  // enforce both. Not applied by `astro dev`.
  security: {
    csp: {
      scriptDirective: { resources: ["'self'", "https://challenges.cloudflare.com", "https://static.cloudflareinsights.com"] },
      styleDirective: { resources: ["'self'", "'unsafe-inline'"] },
    },
  },
  vite: {
    // CSS stays split per page (Astro's default: the global sheet + a small chunk on the pages that need one). Folding
    // everything into one site-wide sheet (build.cssCodeSplit: false) was measured at +90–210 ms first paint on slow
    // 4G for every page (a bigger render-blocking file), and inlining the page chunks was no better (PERF2-04).
    plugins: [
      // One client module per page: src/scripts/site.ts takes over the component <script>s it lists (PERF2-01).
      siteScripts(),
      // Production CSS: Tailwind does not scan the dev-only pages (styleguide, lab: never built for production), so
      // utilities only they use stay out of the shipped stylesheet (~2.7 KB raw). `astro dev` still scans them.
      {
        name: "lc-prod-css-sources",
        apply: "build",
        enforce: "pre",
        transform(code, id) {
          if (!id.endsWith("/src/styles/global.css")) return;
          const anchor = '@source not "../../worker";';
          // Fail closed (CODE2-01): a renamed anchor would silently ship the dev-only utilities.
          if (!code.includes(anchor)) throw new Error(`lc-prod-css-sources: anchor ${anchor} not found in src/styles/global.css`);
          return code.replace(anchor, `${anchor}\n@source not "../pages/[lang]/lab";\n@source not "../pages/[lang]/styleguide.astro";`);
        },
      },
      tailwindcss(),
    ],
  },
});
