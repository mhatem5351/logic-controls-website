/**
 * scripts/check-i18n.mjs (runs before every build) — behaviour on fixture message trees.
 *
 * The script resolves its input relative to itself (../src/i18n/messages/), so each case copies the real script into a
 * temp project next to a small fixture tree and runs it with node. No change to the script is needed.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(new URL("../../scripts/check-i18n.mjs", import.meta.url));
const LOCALES = ["en", "ar", "zh", "tr"] as const;
type Tree = Partial<Record<(typeof LOCALES)[number], Record<string, unknown>>>;

const roots: string[] = [];
afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

/** Write `tree` (locale → namespace → JSON) into a temp project and run the real script there. */
function run(tree: Tree, env: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), "lc-i18n-"));
  roots.push(root);
  mkdirSync(join(root, "scripts"));
  copyFileSync(SCRIPT, join(root, "scripts", "check-i18n.mjs"));
  for (const locale of LOCALES) {
    const dir = join(root, "src", "i18n", "messages", locale);
    mkdirSync(dir, { recursive: true });
    for (const [ns, json] of Object.entries(tree[locale] ?? {})) writeFileSync(join(dir, `${ns}.json`), typeof json === "string" ? json : JSON.stringify(json));
  }
  const res = spawnSync(process.execPath, [join(root, "scripts", "check-i18n.mjs")], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, ...env },
  });
  return { code: res.status, out: res.stdout + res.stderr };
}

const ui = { nav: { home: "Home", services: "Services" }, list: ["a", "b"], items: [{ q: "Q1", a: "A1" }] };
const home = { title: "Logic Controls" };
/** Same shape in every locale. */
const all = (ns: Record<string, unknown>): Tree => Object.fromEntries(LOCALES.map((l) => [l, structuredClone(ns)]));

describe("check-i18n.mjs", () => {
  it("passes when every locale has the English shape, and reports the totals", () => {
    const { code, out } = run(all({ ui, home }));
    expect(code).toBe(0);
    // ui: nav.home, nav.services, list[], list[0], list[1], items[], items[0].q, items[0].a = 8; home: 1
    expect(out).toContain("i18n check passed (9 keys × 4 locales, 2 namespaces)");
  });

  it("fails on a missing key", () => {
    const tree = all({ ui, home });
    delete (tree.ar!.ui as { nav: Partial<typeof ui.nav> }).nav.services;
    const { code, out } = run(tree);
    expect(code).toBe(1);
    expect(out).toContain("ar/ui.json: missing nav.services");
    expect(out).toContain("i18n check failed with 1 problem(s).");
  });

  it("fails on an extra key", () => {
    const tree = all({ ui, home });
    (tree.zh!.home as Record<string, string>).extra = "x";
    const { code, out } = run(tree);
    expect(code).toBe(1);
    expect(out).toContain("zh/home.json: extra key extra");
  });

  it("fails when an array has a different length", () => {
    const tree = all({ ui, home });
    (tree.tr!.ui as typeof ui).list = ["a"];
    const { code, out } = run(tree);
    expect(code).toBe(1);
    expect(out).toContain("tr/ui.json: list[] has 1 items, en has 2");
  });

  it("fails on empty strings and TODO markers (in English too)", () => {
    const tree = all({ ui, home });
    (tree.ar!.home as typeof home).title = "";
    (tree.zh!.ui as typeof ui).nav.home = "TODO translate";
    (tree.en!.ui as typeof ui).items[0]!.a = "";
    const { code, out } = run(tree);
    expect(code).toBe(1);
    expect(out).toContain("ar/home.json: title is empty/TODO");
    expect(out).toContain("zh/ui.json: nav.home is empty/TODO");
    expect(out).toContain("en/ui.json: items[0].a is empty/TODO");
  });

  it('does not treat "TODO" inside a word as a marker', () => {
    const tree = all({ home: { title: "TODOS los días" } });
    expect(run(tree).code).toBe(0);
  });

  it("fails when a namespace file is missing in a locale", () => {
    const tree = all({ ui, home });
    delete tree.tr!.home;
    const { code, out } = run(tree);
    expect(code).toBe(1);
    expect(out).toContain("tr/home.json: file missing");
  });

  it("fails on a Latin letter the shipped Montserrat subsets do not have", () => {
    const tree = all({ ui, home });
    (tree.tr!.home as typeof home).title = "Łódź"; // Ł (U+0141) and ź (U+017A) are latin-ext, not shipped
    const { code, out } = run(tree);
    expect(code).toBe(1);
    expect(out).toContain('tr/home.json: "Ł" (U+0141) is not in the Montserrat subsets');
    expect(out).toContain('tr/home.json: "ź" (U+017A) is not in the Montserrat subsets');
  });

  it("accepts Turkish letters from the LC Montserrat Ext subset, Latin-1, Arabic and Han", () => {
    const tree = all({ ui, home });
    (tree.tr!.home as typeof home).title = "Işık, Ğ, İş, Şu — çğöü ÇÖÜ";
    (tree.ar!.home as typeof home).title = "لوحات التحكم";
    (tree.zh!.home as typeof home).title = "电气控制柜，全角：ＡＢＣ";
    expect(run(tree).code).toBe(0);
  });

  it("I18N_LENIENT=1 reports problems but exits 0", () => {
    const tree = all({ ui, home });
    delete (tree.ar!.ui as { nav: Partial<typeof ui.nav> }).nav.home;
    const { code, out } = run(tree, { I18N_LENIENT: "1" });
    expect(code).toBe(0);
    expect(out).toContain("ar/ui.json: missing nav.home");
  });

  it("crashes (non-zero exit) on invalid JSON instead of passing silently", () => {
    const tree = all({ ui, home });
    (tree.ar as Record<string, unknown>).home = "{ not json";
    expect(run(tree).code).not.toBe(0);
  });

  it("passes on the real message files", () => {
    const res = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
    expect(res.status, res.stderr).toBe(0);
  });
});
