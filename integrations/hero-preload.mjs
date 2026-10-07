// @ts-check
/**
 * Adds <head> hints to the built pages, after the build.
 *
 * Hero image (PERF2-03). The hero photo is the LCP element: on phones the band (HeroBand.astro, `.lc-hero-band`), from
 * 1024px the panel (Hero.astro, `.lc-hero-media`). Both sit after the header and drawer markup (~80 KB of HTML), so
 * without a hint the request only starts once the parser gets there. For each of the two pictures this adds
 *   <link rel="preload" as="image" type="image/avif" imagesrcset imagesizes media fetchpriority="high">
 * copied from the picture's AVIF <source> — the same srcset, sizes and media, so the browser picks the same file and
 * reuses the response (a browser without AVIF skips it: `type`). No `href`: a browser that does not understand
 * `imagesrcset` downloads nothing rather than a wrong size. A preload the page already has (the home poster,
 * BaseLayout `preloadImage`) is not repeated. Pages whose hero has no photo (art, compact heroes) are left alone.
 *
 * Feature code a page needs at once (PERF3-06). src/scripts/site.ts loads the RFQ form's chunk with now(): the page
 * needs it at once (the form re-lays itself out as a stepper), but a dynamic import is only discovered when the site
 * module has run, one round trip after it. On pages with the form this adds
 *   <link rel="modulepreload" href="/_astro/RfqForm.astro.lc.<hash>.js"> (+ the modules it imports statically)
 * at the end of <head>, so the chunk downloads alongside the site module (the stylesheets are requested first: on a
 * slow phone link FCP stays where it was; the form is ready ~0.5–0.6 s sooner). The chunk name is read from the
 * page's site module (the import site.ts compiles to), its imports from the chunk itself; a module the page already
 * loads is not repeated.
 */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "node-html-parser";

const PICTURES = [".lc-hero-band picture", ".lc-hero-media picture"];
/** Chunks to modulepreload: `page` marks a page that needs it at once (the gate of its now() in site.ts), `chunk`
 *  matches its file name in the site module. */
export const NOW_CHUNKS = [{ page: "form[data-rfq]", chunk: /RfqForm\.astro\.lc\.[\w-]+\.js/ }];
const esc = (/** @type {string} */ s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/** Same-origin modules a built module imports statically (`import … from "./x.js"` / `import "./x.js"`), as /_astro/ paths. */
export function staticImports(/** @type {string} */ code, /** @type {string} */ dir = "/_astro/") {
  return [...code.matchAll(/(?:^|[;\s}])import\s*(?:[\w${},*\s]+from\s*)?["']([^"']+)["']/g)]
    .map((m) => /** @type {string} */ (m[1]))
    .filter((s) => s.startsWith("./") || s.startsWith("/"))
    .map((s) => (s.startsWith("/") ? s : dir + s.slice(2)));
}

/**
 * The page with <link rel="modulepreload"> tags for the NOW_CHUNKS it needs at the end of its <head>, or the page as
 * it was. `read(path)` returns a built file's text by its URL path ("/_astro/x.js"), or undefined.
 * @param {string} html
 * @param {(path: string) => Promise<string | undefined>} read
 */
export async function addModulePreloads(html, read) {
  const site = html.match(/<script type="module" src="(\/_astro\/[^"]+\.js)"><\/script>/);
  if (!site || site.index === undefined) return html;
  const doc = parse(html);
  const wanted = NOW_CHUNKS.filter((c) => doc.querySelector(c.page));
  if (!wanted.length) return html;
  const siteSrc = /** @type {string} */ (site[1]);
  const siteCode = (await read(siteSrc)) ?? "";
  /** Modules the page loads anyway: never preloaded twice. */
  const have = new Set([
    siteSrc,
    ...doc
      .querySelectorAll('script[type="module"][src], link[rel="modulepreload"]')
      .map((e) => e.getAttribute("src") ?? e.getAttribute("href")),
  ]);
  /** @type {string[]} */
  const out = [];
  const add = async (/** @type {string} */ path) => {
    if (have.has(path)) return;
    have.add(path);
    const code = await read(path);
    if (code === undefined) throw new Error(`hero-preload: ${path} (imported by the site module) is not in the build`);
    out.push(path);
    for (const dep of staticImports(code, path.slice(0, path.lastIndexOf("/") + 1))) await add(dep);
  };
  for (const c of wanted) {
    const name = siteCode.match(c.chunk)?.[0];
    if (!name) throw new Error(`hero-preload: no chunk matching ${c.chunk} in ${siteSrc} (renamed in src/scripts/site.ts?)`);
    await add(siteSrc.slice(0, siteSrc.lastIndexOf("/") + 1) + name);
  }
  const end = html.indexOf("</head>");
  if (!out.length || end < 0) return html;
  return html.slice(0, end) + out.map((p) => `<link rel="modulepreload" href="${esc(p)}">`).join("") + html.slice(end);
}

/** @returns {import("astro").AstroIntegration} */
export default function heroPreload() {
  return {
    name: "lc-hero-preload",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const files = (await readdir(root, { recursive: true })).filter((f) => f.endsWith(".html"));
        /** @type {Map<string, Promise<string | undefined>>} */
        const assets = new Map();
        const read = (/** @type {string} */ p) => {
          if (!assets.has(p))
            assets.set(
              p,
              readFile(join(root, decodeURIComponent(p)), "utf8").catch(() => undefined),
            );
          return /** @type {Promise<string | undefined>} */ (assets.get(p));
        };
        let pages = 0;
        let modulePages = 0;
        for (const f of files) {
          const path = join(root, f);
          const before = await readFile(path, "utf8");
          let html = before;
          if (html.includes("data-rfq")) {
            html = await addModulePreloads(html, read);
            if (html !== before) modulePages++;
          }
          if (html.includes("lc-hero-")) {
            const doc = parse(html);
            const links = [];
            for (const sel of PICTURES) {
              const source = doc.querySelector(sel)?.querySelector('source[type="image/avif"]');
              const srcset = source?.getAttribute("srcset");
              if (!source || !srcset || srcset.startsWith("data:")) continue;
              if (html.includes(`imagesrcset="${esc(srcset)}"`)) continue;
              const sizes = source.getAttribute("sizes");
              const media = source.getAttribute("media");
              links.push(
                `<link rel="preload" as="image" type="image/avif" imagesrcset="${esc(srcset)}"` +
                  (sizes ? ` imagesizes="${esc(sizes)}"` : "") +
                  (media ? ` media="${esc(media)}"` : "") +
                  ` fetchpriority="high">`,
              );
            }
            if (links.length) {
              // Next to the page's own preload hints (after the manifest link), well before the stylesheets.
              const at = html.match(/<link rel="manifest"[^>]*>/);
              if (!at || at.index === undefined) throw new Error(`hero-preload: no <link rel="manifest"> in ${f}`);
              const end = at.index + at[0].length;
              html = html.slice(0, end) + links.join("") + html.slice(end);
              pages++;
            }
          }
          if (html !== before) await writeFile(path, html);
        }
        logger.info(`hero image preloads added to ${pages} pages, feature chunk preloads to ${modulePages} pages`);
      },
    },
  };
}
