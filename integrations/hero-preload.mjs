// @ts-check
/**
 * Preloads every page's hero image from <head> (PERF2-03), after the build.
 *
 * The hero photo is the LCP element: on phones the band (HeroBand.astro, `.lc-hero-band`), from 1024px the panel
 * (Hero.astro, `.lc-hero-media`). Both sit after the header and drawer markup (~80 KB of HTML), so without a hint
 * the request only starts once the parser gets there. For each of the two pictures this adds
 *   <link rel="preload" as="image" type="image/avif" imagesrcset imagesizes media fetchpriority="high">
 * copied from the picture's AVIF <source> — the same srcset, sizes and media, so the browser picks the same file and
 * reuses the response (a browser without AVIF skips it: `type`). No `href`: a browser that does not understand
 * `imagesrcset` downloads nothing rather than a wrong size. A preload the page already has (the home poster,
 * BaseLayout `preloadImage`) is not repeated. Pages whose hero has no photo (art, compact heroes) are left alone.
 */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "node-html-parser";

const PICTURES = [".lc-hero-band picture", ".lc-hero-media picture"];
const esc = (/** @type {string} */ s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/** @returns {import("astro").AstroIntegration} */
export default function heroPreload() {
  return {
    name: "lc-hero-preload",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const files = (await readdir(root, { recursive: true })).filter((f) => f.endsWith(".html"));
        let pages = 0;
        for (const f of files) {
          const path = join(root, f);
          let html = await readFile(path, "utf8");
          if (!html.includes("lc-hero-")) continue;
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
          if (!links.length) continue;
          // Next to the page's own preload hints (after the manifest link), well before the stylesheets.
          const at = html.match(/<link rel="manifest"[^>]*>/);
          if (!at || at.index === undefined) throw new Error(`hero-preload: no <link rel="manifest"> in ${f}`);
          const end = at.index + at[0].length;
          html = html.slice(0, end) + links.join("") + html.slice(end);
          await writeFile(path, html);
          pages++;
        }
        logger.info(`hero image preloads added to ${pages} pages`);
      },
    },
  };
}
