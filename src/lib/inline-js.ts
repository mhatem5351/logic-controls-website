/**
 * Minify the body of an is:inline <script> at build time. Inline scripts skip Vite's bundling, so they ship as
 * written; the ones in every page's <head> sit in the first round trip, where each byte counts (budgets:
 * beforeMain). Plain esbuild minification (no bundling, no syntax lowering): the CSP integration hashes the result.
 */
import { transformSync } from "esbuild";

const cache = new Map<string, string>();

export function inlineJs(source: string): string {
  let out = cache.get(source);
  if (out === undefined) {
    out = transformSync(source, { loader: "js", minify: true, charset: "utf8", legalComments: "none" }).code.trim();
    cache.set(source, out);
  }
  return out;
}
