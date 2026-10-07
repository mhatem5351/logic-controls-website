/**
 * integrations/hero-preload.mjs, feature chunk part (PERF3-06): a page with the RFQ form gets <link rel="modulepreload">
 * for the form's chunk and the modules it imports, read from the built site module and chunk, at the end of <head>;
 * nothing is preloaded twice, other pages are untouched, and a renamed chunk fails the build instead of silently
 * dropping the hint.
 */
import { describe, expect, it } from "vitest";
import { addModulePreloads, staticImports } from "../../integrations/hero-preload.mjs";

const SITE = "/_astro/BaseLayout.astro_astro_type_script_index_0_lang.AbC12.js";
const files: Record<string, string> = {
  [SITE]: 'const m=()=>import("./RfqForm.astro.lc.Xy-9z.js");const g=()=>import("./Gallery.astro.lc.Q1.js");',
  "/_astro/RfqForm.astro.lc.Xy-9z.js":
    'import{i as e}from"./BaseLayout.astro_astro_type_script_index_0_lang.AbC12.js";import{t as r}from"./format.F1.js";import{a}from"./rfq-rules.R1.js";var x=1;',
  "/_astro/format.F1.js": "export const t=1;",
  "/_astro/rfq-rules.R1.js": 'import{t}from"./format.F1.js";export const a=2;',
};
const read = async (p: string) => files[p];
const page = (body: string, head = "") =>
  `<!doctype html><html><head><meta charset="utf-8"><script type="module" src="${SITE}"></script>${head}<link rel="stylesheet" href="/_astro/a.css"></head><body>${body}</body></html>`;
const links = (html: string) => [...html.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map((m) => m[1]);

describe("staticImports()", () => {
  it("lists a built module's static same-origin imports", () => {
    expect(staticImports(files["/_astro/RfqForm.astro.lc.Xy-9z.js"]!)).toEqual([
      "/_astro/BaseLayout.astro_astro_type_script_index_0_lang.AbC12.js",
      "/_astro/format.F1.js",
      "/_astro/rfq-rules.R1.js",
    ]);
    expect(staticImports(files[SITE]!)).toEqual([]); // dynamic imports are not static deps
  });
});

describe("addModulePreloads()", () => {
  it("adds the form chunk and its imports (once each, not the site module) at the end of <head>", async () => {
    const out = await addModulePreloads(page('<form data-rfq method="post"></form>'), read);
    expect(links(out)).toEqual(["/_astro/RfqForm.astro.lc.Xy-9z.js", "/_astro/format.F1.js", "/_astro/rfq-rules.R1.js"]);
    expect(out.indexOf("modulepreload")).toBeGreaterThan(out.indexOf('rel="stylesheet"')); // CSS is requested first
    expect(out.indexOf("modulepreload")).toBeLessThan(out.indexOf("</head>"));
  });

  it("leaves pages without the form alone (an attribute that only starts with data-rfq is not the form)", async () => {
    const html = page("<div data-rfq-body></div><form data-other></form>");
    expect(await addModulePreloads(html, read)).toBe(html);
  });

  it("does not repeat a module the page already preloads", async () => {
    const out = await addModulePreloads(page("<form data-rfq></form>", '<link rel="modulepreload" href="/_astro/format.F1.js">'), read);
    expect(links(out)).toEqual(["/_astro/format.F1.js", "/_astro/RfqForm.astro.lc.Xy-9z.js", "/_astro/rfq-rules.R1.js"]);
  });

  it("fails the build when the site module no longer names the chunk (renamed in site.ts)", async () => {
    const r = (p: string) => Promise.resolve(p === SITE ? "export{}" : files[p]);
    await expect(addModulePreloads(page("<form data-rfq></form>"), r)).rejects.toThrow(/no chunk matching/);
  });

  it("fails the build when an imported module is missing", async () => {
    const r = (p: string) => Promise.resolve(p === "/_astro/rfq-rules.R1.js" ? undefined : files[p]);
    await expect(addModulePreloads(page("<form data-rfq></form>"), r)).rejects.toThrow(/not in the build/);
  });
});
