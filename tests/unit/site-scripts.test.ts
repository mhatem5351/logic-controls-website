/**
 * The one-module-per-page script setup (integrations/site-scripts.mjs + src/scripts/site.ts, CODE3-03):
 *  - only real imports adopt a component: a commented-out `?lc-script` import must not empty the component's script
 *    with nothing importing its code;
 *  - every on-demand gate in site.ts (now / near / idle) matches its component: the gate's hooks are in the
 *    component's markup and its script looks for them, and every on-demand component is behind a gate. A renamed
 *    attribute (data-zones → data-zone-map) would otherwise silently stop a chunk from ever loading.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseSync } from "vite";
import { describe, expect, it } from "vitest";
import { adoptedSpecifiers } from "../../integrations/site-scripts.mjs";

const ROOT = join(import.meta.dirname, "../..");
const SITE = join(ROOT, "src/scripts/site.ts");
const read = (f: string) => readFileSync(f, "utf8");

describe("adoptedSpecifiers(): what an entry adopts", () => {
  it("takes static and dynamic ?lc-script imports, nothing else", () => {
    const src = `
      import { now } from "./site-load";
      import "~/components/A.astro?lc-script";
      now("[x]", () => import("~/components/B.astro?lc-script"));
      const c = () => import('~/components/C.astro?lc-script');
      const s = "~/components/NotAnImport.astro?lc-script";
      import "~/components/Plain.astro";
    `;
    expect(adoptedSpecifiers(src)).toEqual(["~/components/A.astro", "~/components/B.astro", "~/components/C.astro"]);
  });

  it("ignores commented-out imports (line and block comments, doc comments)", () => {
    const src = `
      /** \`import "<component>.astro?lc-script"\` pulls a component in */
      // import "~/components/Gallery.astro?lc-script";
      /* near("[data-zones]", () => import("~/components/ZonesBlock.astro?lc-script")); */
      import "~/components/Header.astro?lc-script"; // import "~/components/Footer.astro?lc-script"
    `;
    expect(adoptedSpecifiers(src)).toEqual(["~/components/Header.astro"]);
  });

  it("reads TypeScript (casts, generics, regex literals with slashes)", () => {
    const src = `
      const re = /^\\/[a-z]{2}\\/$/; // not a comment start
      const n = (navigator as Navigator & { x?: { y?: boolean } }).x;
      const el = document.querySelector<HTMLElement>("[a]")!;
      if (re.test(location.pathname)) void import("~/pages/[lang]/index.astro?lc-script");
    `;
    expect(adoptedSpecifiers(src)).toEqual(["~/pages/[lang]/index.astro"]);
  });

  it("site.ts: every adopted component file exists", () => {
    const specs = adoptedSpecifiers(read(SITE), SITE);
    expect(specs.length).toBeGreaterThan(15);
    for (const s of specs) expect(() => read(join(ROOT, "src", s.replace(/^~\//, "")))).not.toThrow();
  });
});

/* ------------------------------------------------------------------ gates ↔ components */

type Node = { type?: string; [k: string]: unknown };
const walk = (n: unknown, fn: (n: Node) => void): void => {
  if (!n || typeof n !== "object") return;
  if (Array.isArray(n)) return n.forEach((x) => walk(x, fn));
  fn(n as Node);
  for (const v of Object.values(n)) walk(v, fn);
};
const lcImports = (n: unknown) => {
  const out: string[] = [];
  walk(n, (x) => {
    const v = (x.source as { value?: unknown } | undefined)?.value;
    if (x.type === "ImportExpression" && typeof v === "string" && v.endsWith(".astro?lc-script"))
      out.push(v.slice(0, -"?lc-script".length));
  });
  return out;
};

/** site.ts's gates: now / near / idle("<selector>", load) with the component(s) each load imports. */
function gates() {
  const ast = parseSync(SITE, read(SITE), { lang: "ts" }).program;
  const consts = new Map<string, unknown>();
  walk(ast, (n) => {
    const id = n.id as { type?: string; name?: string } | undefined;
    if (n.type === "VariableDeclarator" && id?.type === "Identifier") consts.set(id.name!, n.init);
  });
  const out: Array<{ fn: string; selector: string; files: string[] }> = [];
  const gated = new Set<string>();
  walk(ast, (n) => {
    const callee = n.callee as { type?: string; name?: string } | undefined;
    const args = n.arguments as Array<{ type?: string; value?: unknown; name?: string }> | undefined;
    if (n.type !== "CallExpression" || callee?.type !== "Identifier" || !["now", "near", "idle"].includes(callee.name!)) return;
    if (args?.[0]?.type !== "Literal" || typeof args[0].value !== "string") return;
    // the load function: inline, or a const holding it (e.g. `lazyArt`). A load that calls such a const among other
    // work is a warm-up on another page (no component of its own: checked below).
    const load = args[1]?.type === "Identifier" ? consts.get(args[1].name!) : args[1];
    const files = lcImports(load);
    files.forEach((f) => gated.add(f));
    out.push({ fn: callee.name!, selector: args[0].value, files });
  });
  return { gates: out, gated, all: lcImports(ast) };
}

/** A component's markup (template, without its scripts) and its script code (+ the modules those scripts import). */
function partsOf(spec: string) {
  const file = join(ROOT, "src", spec.replace(/^~\//, ""));
  const src = read(file);
  const blocks = [...src.matchAll(/<script(?![^>]*is:inline)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
  let script = blocks.join("\n");
  for (const [, mod] of script.matchAll(/import\s*(?:[\w{},*\s]+from\s*)?["']((?:~\/|\.{1,2}\/)[^"']+)["']/g)) {
    const base = mod!.startsWith("~/") ? join(ROOT, "src", mod!.slice(2)) : resolve(dirname(file), mod!);
    for (const ext of ["", ".ts"]) {
      try {
        script += "\n" + read(base + ext);
        break;
      } catch {
        /* next extension */
      }
    }
  }
  const markup = src.replace(/^---[\s\S]*?\n---/, "").replace(/<script[\s\S]*?<\/script>/g, "");
  return { markup, script };
}

/** The tag / attributes / classes a compound selector (`svg[data-art-src]`, `.lc-hero-video[data-src]`) needs. */
function hooks(compound: string) {
  const tag = compound.match(/^[a-z]+/)?.[0];
  const attrs = [...compound.matchAll(/\[([\w-]+)/g)].map((m) => m[1]!);
  const classes = [...compound.matchAll(/\.([\w-]+)/g)].map((m) => m[1]!);
  return { tag, attrs, classes };
}

describe("site.ts gates match their components", () => {
  const { gates: list, gated, all } = gates();

  it("finds the gates", () => {
    expect(list.length).toBeGreaterThan(10);
  });

  it("every on-demand component is loaded behind a gate", () => {
    expect([...new Set(all)].filter((f) => !gated.has(f))).toEqual([]);
  });

  it("every gate but the warm-up loads a component", () => {
    expect(list.filter((g) => !g.files.length).map((g) => g.selector)).toEqual(["[data-art-warm]"]);
  });

  for (const g of list) {
    for (const spec of g.files) {
      const { markup, script } = partsOf(spec);
      for (const compound of g.selector.split(",").map((s) => s.trim())) {
        it(`${g.fn}("${g.selector}") → ${spec.split("/").pop()}: "${compound}" is in its markup and its script`, () => {
          const { tag, attrs, classes } = hooks(compound);
          if (tag) expect(markup, `<${tag}> in the markup`).toMatch(new RegExp(`<${tag}[\\s>]`));
          for (const a of attrs) expect(markup, `attribute ${a} in the markup`).toMatch(new RegExp(`\\s${a}(?=[\\s=>/])`));
          for (const c of classes) expect(markup, `class ${c} in the markup`).toMatch(new RegExp(`["'\\s]${c}["'\\s]`));
          expect(script, `the component's script looks for "${compound}"`).toContain(compound);
        });
      }
    }
  }

  it("the warm-up gate ([data-art-warm]) is rendered by the detail-hero art", () => {
    const g = list.find((x) => x.selector === "[data-art-warm]");
    expect(g).toBeDefined();
    expect(read(join(ROOT, "src/components/sections/catalog/HeroArt.astro"))).toMatch(/\sdata-art-warm=/);
  });
});
