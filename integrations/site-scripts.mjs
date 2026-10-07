// @ts-check
/**
 * One client module per page instead of one <script type="module"> per component (PERF2-01).
 *
 * Astro turns every component's processed <script> into its own entry, rendered where the component is used: a page
 * with a header, hero, map, HMI and floating button loaded 4–9 separate module files, all found by the preload scanner
 * and fetched at High priority next to the CSS, fonts and LCP image, with chained imports (motion-pref) found only
 * after their importers arrived. On slow mobile links that cost 0.3–0.75 s of first paint and ~1 s of menu
 * interactivity (DOMContentLoaded waits for every module).
 *
 * This Vite plugin lets ONE entry (src/scripts/site.ts, loaded once by BaseLayout) take over component scripts,
 * without moving their code out of the components:
 *   import "~/components/Header.astro?lc-script";                  // bundled into the site module, runs at once
 *   near("[data-zones]", () => import("~/components/…/ZonesBlock.astro?lc-script"));   // own chunk, on demand
 * - `<file>.astro?lc-script` resolves to that component's processed <script> blocks, compiled by the same Astro
 *   compiler (so the code, its imports and their order are exactly what Astro would have bundled), each block a module
 *   of its own (`<file>.astro.lc-<i>.ts`) next to the component, so its relative imports resolve as before.
 * - The component's own script entries (`<file>.astro?astro&type=script&index=<i>&lang.ts`) of every component that
 *   site.ts imports this way become empty modules. Astro inlines an empty entry as "" and renders nothing for it, so
 *   the page gets no <script> for that component.
 * A component script that site.ts does not list keeps Astro's normal behaviour (its own module on the pages that use
 * it, or an inline module when it is small and imports nothing): nothing breaks when a new script appears; the build
 * lists it (warning, unless site.ts names it in an `lc-own: <file>.astro` comment) and tests/static/check-budgets.mjs
 * counts module scripts per page. Client environment only (dev and build); the server render is untouched.
 */
import { readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, resolve as resolvePath } from "node:path";

const QUERY = "?lc-script";
/** All script blocks of a component, as one module importing each block in order. */
const ALL = /^(.*\.astro)\.lc\.ts$/;
/** One processed <script> block (index i) of a component. */
const BLOCK = /^(.*\.astro)\.lc-(\d+)\.ts$/;
/** Astro's own entry for a component script. */
const ASTRO_SCRIPT = /^(.*\.astro)\?astro&type=script&index=(\d+)&lang\.ts/;
const SPECIFIER = /["']([^"'\s]+\.astro)\?lc-script["']/g;
/** `lc-own: <file>.astro` in an entry file: a component script left to Astro on purpose (no build warning). */
const OWN = /lc-own:\s*([^\s*]+\.astro)/g;

/**
 * @param {{ entries?: string[]; host?: string }} [options] `entries`: files (relative to the project root) whose
 *   `?lc-script` imports adopt components (default: src/scripts/site.ts); `host`: the component whose own <script> loads
 *   them (BaseLayout), left as it is.
 * @returns {import("vite").Plugin}
 */
export default function siteScripts({ entries = ["src/scripts/site.ts"], host = "src/layouts/BaseLayout.astro" } = {}) {
  let root = process.cwd();
  /** @typedef {Array<{ type: string; code?: string; src?: string }>} Scripts */
  /** @type {((source: string, options: { filename: string }) => { scripts: Scripts }) | undefined} */
  let astroCompile;
  /** @type {Map<string, { mtime: number; scripts: Scripts }>} */
  const compiled = new Map();
  /** @type {{ key: string; files: Set<string>; own: Set<string> }} */
  let adopted = { key: "", files: new Set(), own: new Set() };
  /** Component scripts Astro bundled on its own (not adopted): reported once per build. */
  const unadopted = new Set();

  const mtime = (/** @type {string} */ f) => {
    try {
      return statSync(f).mtimeMs;
    } catch {
      return 0;
    }
  };

  /** Components the entry files adopt / leave to Astro on purpose (re-read whenever an entry file changes). */
  const scan = () => {
    const abs = entries.map((e) => (isAbsolute(e) ? e : join(root, e)));
    const key = abs.map((f) => `${f}:${mtime(f)}`).join("|");
    if (key === adopted.key) return adopted;
    const files = new Set();
    const own = new Set();
    for (const f of abs) {
      if (!mtime(f)) continue;
      const src = readFileSync(f, "utf8");
      const path = (/** @type {string} */ spec) => (spec.startsWith("~/") ? join(root, "src", spec.slice(2)) : resolvePath(dirname(f), spec));
      for (const [, spec] of src.matchAll(SPECIFIER)) files.add(path(spec));
      for (const [, spec] of src.matchAll(OWN)) own.add(path(spec));
    }
    adopted = { key, files, own };
    return adopted;
  };

  /** The component's processed scripts, as Astro's compiler extracts them (cached by mtime).
   *  @param {string} file
   *  @returns {Promise<Scripts>} */
  const scriptsOf = async (file) => {
    const m = mtime(file);
    const hit = compiled.get(file);
    if (hit && hit.mtime === m) return hit.scripts;
    // Astro's own compiler (a dependency of astro): resolved from astro's location, not from the project.
    const req = createRequire(createRequire(join(root, "package.json")).resolve("astro/package.json"));
    const compile = (astroCompile ??= (await import(req.resolve("@astrojs/compiler-rs"))).transform);
    const scripts = compile(readFileSync(file, "utf8"), { filename: file }).scripts;
    compiled.set(file, { mtime: m, scripts });
    return scripts;
  };

  return {
    name: "lc-site-scripts",
    enforce: "pre",
    applyToEnvironment: (env) => env.name === "client",
    configResolved(config) {
      root = config.root;
    },
    async resolveId(id, importer, options) {
      if (id.endsWith(QUERY)) {
        // Vite's dev dependency scanner reads files from disk itself: these modules are ours, nothing to pre-bundle.
        if (/** @type {{ scan?: boolean }} */ (options)?.scan) return { id, external: true };
        const r = await this.resolve(id.slice(0, -QUERY.length), importer, { skipSelf: true });
        if (!r) return null;
        return `${r.id}.lc.ts`;
      }
      if (ALL.test(id) || BLOCK.test(id)) return id;
      return null;
    },
    async load(id) {
      const all = id.match(ALL);
      if (all) {
        const file = /** @type {string} */ (all[1]);
        this.addWatchFile(file);
        const scripts = await scriptsOf(file);
        return scripts.map((_, i) => `import ${JSON.stringify(`${file}.lc-${i}.ts`)};`).join("\n") || "export {};";
      }
      const block = id.match(BLOCK);
      if (block) {
        const file = /** @type {string} */ (block[1]);
        this.addWatchFile(file);
        const s = (await scriptsOf(file))[Number(block[2])];
        if (!s) return "export {};";
        // External <script src="./x.ts">: import it (resolved next to the component, like Astro does).
        return { code: s.type === "external" ? `import ${JSON.stringify(s.src)};` : (s.code ?? ""), moduleType: "ts" };
      }
      return null;
    },
    transform(_code, id) {
      const m = id.match(ASTRO_SCRIPT);
      if (!m) return null;
      const file = /** @type {string} */ (m[1]);
      const { files, own } = scan();
      if (!files.has(file)) {
        if (this.environment?.mode === "build" && file !== join(root, host) && !own.has(file)) unadopted.add(file);
        return null;
      }
      return { code: "", map: null };
    },
    buildEnd() {
      if (unadopted.size) {
        const list = [...unadopted].map((f) => f.replace(root, "").replace(/^\//, ""));
        this.warn(`component scripts bundled on their own (not in ${entries.join(", ")}): ${list.join(", ")}`);
      }
    },
  };
}
