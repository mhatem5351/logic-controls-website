/**
 * HmiDemo source guards for round-3 fixes that no build-free test would otherwise catch:
 *  - PERF3-04: the demo's stylesheet is requested by the bootstrap, never an in-body <link> + inline script (that pair
 *    held the parser, and DOMContentLoaded with it, until the sheet had loaded); without JS a <noscript> sheet.
 *  - I18N3-06: the KPI line's "≥ 72.0 °C" / "15 s" keep the unit with its number (no-break spaces), server-rendered
 *    and as the controller rewrites them.
 *  - MOT3-05: the Try-it hint is shown with data-on (it keeps its box), not the hidden attribute (display: none).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const astro = src("src/components/motion/HmiDemo.astro");
const ts = src("src/scripts/motion/hmi-demo.ts");
const markup = astro.slice(astro.indexOf("---", 3) + 3, astro.lastIndexOf("<script>"));

describe("HmiDemo stylesheet (PERF3-04)", () => {
  it("has no inline script and no stylesheet link outside <noscript>", () => {
    expect(markup).not.toMatch(/<script\b/);
    expect(markup.replace(/<noscript>[\s\S]*?<\/noscript>/g, "")).not.toMatch(/<link\b[^>]*stylesheet/);
    expect(markup).toMatch(/<noscript>\s*<link rel="stylesheet" href=\{hmiCss\} \/>\s*<\/noscript>/);
  });
  it("the bootstrap requests the sheet from the figure's data-css", () => {
    expect(markup).toContain("data-css={hmiCss}");
    expect(astro).toMatch(/rel: "stylesheet",\s*href: figs\[0\]!\.dataset\.css/);
  });
});

describe("HMI KPI line (I18N3-06)", () => {
  it("server-renders number + unit with no-break spaces", () => {
    expect(markup).toMatch(/<b data-v="limit" dir="ltr">≥&nbsp;\{n1\(R\.limit\)\}&nbsp;°C<\/b>/);
    expect(markup).toMatch(/<b data-v="minHold" dir="ltr">\{R\.hold\}&nbsp;s<\/b>/);
  });
  it("the controller rewrites them with no-break spaces too", () => {
    const writes = [...ts.matchAll(/set\("(limit|minHold)", `([^`]*)`\)/g)].map((m) => m[2]!);
    expect(writes.length).toBeGreaterThanOrEqual(3);
    for (const w of writes) expect(w).not.toMatch(/ /);
  });
});

describe("Try-it hint (MOT3-05)", () => {
  it("keeps its box: toggled with data-on, never with hidden", () => {
    expect(markup).toMatch(/<span class="lc-hmi-hint" data-step-hint>/);
    expect(markup).not.toMatch(/data-step-hint[^>]*hidden/);
    expect(ts).toContain('attr(stepHint, "data-on"');
    expect(ts).not.toMatch(/stepHint\.hidden/);
  });
});
