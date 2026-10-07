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
 *
 * Fails closed (CODE2-01): the build throws when a page has inline scripts but no CSP <meta> to complete, when a page
 * carries more than one, when the <meta> has no script-src directive, when script-src would allow 'unsafe-inline', or
 * when a rewritten page does not list a hash for every inline script it contains. A page without inline scripts and
 * without a <meta> (none today) is only counted. tests/static/check-dist.mjs re-checks the contract on dist/ with its
 * own HTML parser and hashing (CODE3-06), so a scanner bug here cannot pass both checks.
 */
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const META = /<meta http-equiv="content-security-policy" content="([^"]*)"\s*\/?>/gi;
const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

/** A whole attribute name (`src`, not `data-src`): `\b` alone would also match after the `-` of a data-*-src. */
const SRC_ATTR = /(?:^|\s)src\s*=/i;
const JSON_LD = /(?:^|\s)type\s*=\s*["']?application\/ld\+json/i;

/**
 * sha256 CSP sources of the page's executable inline scripts (no src, not JSON-LD, not empty). The body is hashed as
 * the browser sees it: the HTML parser turns CR LF and a lone CR into LF before the script's text is hashed.
 */
export function inlineScriptHashes(/** @type {string} */ html) {
  const hashes = new Set();
  for (const [, attrs, body] of html.matchAll(SCRIPT)) {
    if (SRC_ATTR.test(attrs) || JSON_LD.test(attrs) || !body) continue;
    hashes.add(`'sha256-${createHash("sha256").update(body.replace(/\r\n?/g, "\n")).digest("base64")}'`);
  }
  return hashes;
}

/** The directive list of a policy string: Map(name → sources). */
export function parsePolicy(/** @type {string} */ content) {
  const map = new Map();
  for (const part of content.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) map.set(name.toLowerCase(), sources);
  }
  return map;
}

/** Rewrites one page; returns the new HTML (or null when the page has no CSP meta and no inline script). */
export function completePage(/** @type {string} */ html, /** @type {string} */ file) {
  const metas = [...html.matchAll(META)];
  const hashes = inlineScriptHashes(html);
  if (metas.length === 0) {
    if (hashes.size) throw new Error(`csp: ${file} has ${hashes.size} inline script(s) but no CSP <meta> to list them in`);
    return null;
  }
  if (metas.length > 1) throw new Error(`csp: ${file} has ${metas.length} CSP <meta> elements (expected one)`);
  const [tag, content] = /** @type {[string, string]} */ ([metas[0][0], metas[0][1]]);
  const directives = content
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean);
  const at = directives.findIndex((d) => /^script-src\s/i.test(d) || d.toLowerCase() === "script-src");
  if (at < 0) throw new Error(`csp: ${file} CSP <meta> has no script-src directive`);
  const sources = directives[at]
    .split(/\s+/)
    .slice(1)
    .filter((x) => !x.startsWith("'sha"));
  if (sources.includes("'unsafe-inline'")) throw new Error(`csp: ${file} script-src allows 'unsafe-inline'`);
  directives[at] = ["script-src", ...sources, ...hashes].join(" ");
  const meta = `<meta http-equiv="content-security-policy" content="${directives.join("; ")};">`;
  const out = html.replace(tag, "").replace(/<meta charset="utf-8">/i, (c) => c + meta);
  if (!out.includes(meta)) throw new Error(`csp: no <meta charset> in ${file}`);
  // Self-check: every inline script of the final page is listed (catches a serialisation change of the tag above).
  const listed = new Set(parsePolicy([...out.matchAll(META)][0]?.[1] ?? "").get("script-src") ?? []);
  for (const h of inlineScriptHashes(out)) if (!listed.has(h)) throw new Error(`csp: ${file} inline script ${h} is not in script-src`);
  return out;
}

/** @returns {import("astro").AstroIntegration} */
export default function cspInlineHashes() {
  return {
    name: "lc-csp-inline-hashes",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const files = (await readdir(root, { recursive: true })).filter((f) => f.endsWith(".html"));
        let pages = 0;
        let scripts = 0;
        let bare = 0;
        for (const f of files) {
          const path = join(root, f);
          const html = await readFile(path, "utf8");
          const out = completePage(html, f);
          if (out === null) {
            bare++;
            continue;
          }
          scripts += inlineScriptHashes(out).size;
          await writeFile(path, out);
          pages++;
        }
        logger.info(
          `inline script hashes: ${pages} pages, ${scripts} hashes${bare ? `; ${bare} page(s) without CSP meta and without inline scripts` : ""}`,
        );
      },
    },
  };
}
