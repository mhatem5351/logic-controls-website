// @ts-check
/**
 * Completes Astro's CSP <meta> (astro.config.mjs → security.csp) for a static build.
 *
 * Astro hashes the scripts it processes (bundled modules and the small ones it inlines), the same site-wide list on
 * every page, but not `is:inline` scripts (the head boot script, the 404 language picker, the analytics loader,
 * HeroArt's slot mover, ProjectBrowser's filter, HmiDemo's stylesheet guard). After the build this sets each page's
 * script-src hashes to exactly the inline scripts that page contains (module or classic; external files are covered
 * by 'self' and the listed hosts), and moves the <meta> to the top of <head> (right after <meta charset>) so it
 * governs the boot script too. JSON-LD blocks are data, never executed, and need no hash. Only scripts written by the
 * build get a hash, so an injected script still cannot run: script-src carries no 'unsafe-inline'.
 */
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const META = /<meta http-equiv="content-security-policy" content="([^"]*)">/;
const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;

/** @returns {import("astro").AstroIntegration} */
export default function cspInlineHashes() {
  return {
    name: "lc-csp-inline-hashes",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const files = (await readdir(root, { recursive: true })).filter((f) => f.endsWith(".html"));
        let pages = 0;
        for (const f of files) {
          const path = join(root, f);
          let html = await readFile(path, "utf8");
          const m = html.match(META);
          if (!m) continue;
          const hashes = new Set();
          for (const [, attrs, body] of html.matchAll(SCRIPT)) {
            if (/\bsrc=/.test(attrs) || /type="application\/ld\+json"/.test(attrs) || !body) continue;
            hashes.add(`'sha256-${createHash("sha256").update(body).digest("base64")}'`);
          }
          const content = m[1].replace(/script-src ([^;]*);/, (_all, /** @type {string} */ list) => {
            const sources = list.trim().split(/\s+/).filter((x) => !x.startsWith("'sha"));
            return `script-src ${[...sources, ...hashes].join(" ")};`;
          });
          const meta = `<meta http-equiv="content-security-policy" content="${content}">`;
          html = html.replace(m[0], "").replace(/<meta charset="utf-8">/i, (c) => c + meta);
          if (!html.includes(meta)) throw new Error(`csp: no <meta charset> in ${f}`);
          await writeFile(path, html);
          pages++;
        }
        logger.info(`inline script hashes added to ${pages} pages`);
      },
    },
  };
}
