/**
 * scripts/check-i18n.mjs — the plain-text / typography / data-coverage guards added in audit round 1 (PK5:
 * CODE-21, I18N-02, DEV-02, A11Y-09, A11Y-08). Same fixture approach as check-i18n.test.ts: the real script is copied
 * into a temp project next to a small message tree (and, for coverage, a small src/data tree).
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { LINK_TOKEN_SOURCE } from "~/lib/text";

const SCRIPT = fileURLToPath(new URL("../../scripts/check-i18n.mjs", import.meta.url));
const LOCALES = ["en", "ar", "zh", "tr"] as const;
type L = (typeof LOCALES)[number];
type Tree = Record<L, Record<string, unknown>>;
const NBSP = "\u00A0";

const roots: string[] = [];
afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

function run(tree: Tree, files: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), "lc-i18n-guards-"));
  roots.push(root);
  mkdirSync(join(root, "scripts"));
  copyFileSync(SCRIPT, join(root, "scripts", "check-i18n.mjs"));
  for (const l of LOCALES) {
    const dir = join(root, "src", "i18n", "messages", l);
    mkdirSync(dir, { recursive: true });
    for (const [ns, json] of Object.entries(tree[l])) writeFileSync(join(dir, `${ns}.json`), JSON.stringify(json));
  }
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  const res = spawnSync(process.execPath, [join(root, "scripts", "check-i18n.mjs")], { encoding: "utf8", env: { PATH: process.env.PATH } });
  return { code: res.status, out: res.stdout + res.stderr };
}
/** Same message (shape) in every locale; `patch` overrides one locale's value. */
function tree(home: Record<string, unknown>, patch: Partial<Record<L, Record<string, unknown>>> = {}): Tree {
  return Object.fromEntries(LOCALES.map((l) => [l, { home: { ...structuredClone(home), ...(patch[l] ?? {}) } }])) as unknown as Tree;
}

describe("check-i18n guards", () => {
  it("fails when a translation drops or renames a {placeholder}", () => {
    const { code, out } = run(tree({ hi: "Hello {name}" }, { tr: { hi: "Merhaba {isim}" } }));
    expect(code).toBe(1);
    expect(out).toContain("tr/home.json: hi has placeholders [{isim}], en has [{name}]");
  });

  it("fails on markup or HTML entities in a message (messages are plain text)", () => {
    const { code, out } = run(tree({ a: "Plain" }, { zh: { a: "<b>粗体</b>" }, en: { a: "R &amp; D" } }));
    expect(code).toBe(1);
    expect(out).toContain("zh/home.json: a contains markup");
    expect(out).toContain("en/home.json: a contains markup");
  });

  it("allows & and < as plain characters", () => {
    expect(run(tree({ a: "Testing & Commissioning, pressure < 2 bar" })).code).toBe(0);
  });

  it("fails when an Arabic conjunction is glued backward onto a Latin code", () => {
    const { code, out } = run(tree({ a: "x" }, { ar: { a: `IEC 60204-1${NBSP}و${NBSP}IEC 61439` } }));
    expect(code).toBe(1);
    expect(out).toContain('ar/home.json: a glues "1⍽و" backward');
    expect(run(tree({ a: "x" }, { ar: { a: `S7-1200${NBSP}ونظام SCADA` } })).code).toBe(1);
  });

  it("accepts the forward glue (normal space before و, no-break space after it)", () => {
    expect(run(tree({ a: "x" }, { ar: { a: `IEC 60204-1 و${NBSP}IEC 61439، و4${NBSP}وحدات` } })).code).toBe(0);
  });

  it("fails on a no-break chain of Latin words longer than 20 characters", () => {
    const { code, out } = run(tree({ a: `Siemens${NBSP}WinCC${NBSP}Professional SCADA` }));
    expect(code).toBe(1);
    expect(out).toContain('no-break run "Siemens⍽WinCC⍽Professional" (max 20)');
  });

  it("warns (without failing) on a 19+ letter Latin word in a heading outside Turkish", () => {
    const { code, out } = run(tree({ title: "Internationalizations" }));
    expect(code).toBe(0);
    expect(out).toContain('has a 21-letter word "Internationalizations" in a heading');
    expect(out).toContain("3 warning(s)"); // en, ar, zh — Turkish gets soft hyphens instead
  });

  it("checks data → message coverage when src/data exists", () => {
    const t = tree({ x: "x" });
    for (const l of LOCALES) t[l].services = { items: { "control-panels": { title: "Panels" } } };
    t.zh.services = { items: { "control-panels": { title: "控制柜" } } };
    const files = { "src/data/services.ts": `export const SERVICE_SLUGS = ["control-panels", "plc-hmi-programming"] as const;` };
    const { code, out } = run(t, files);
    expect(code).toBe(1);
    expect(out).toContain('en/services.json: items.plc-hmi-programming is missing (src/data has the slug "plc-hmi-programming")');
  });

  it("reads the locale list from src/i18n/config.ts when present", () => {
    const t = tree({ a: "x" });
    const { code, out } = run(t, { "src/i18n/config.ts": `export const LOCALES = ["en", "ar"] as const;` });
    expect(code).toBe(0);
    expect(out).toContain("× 2 locales");
  });

  describe("link tokens", () => {
    const DATA = {
      "src/data/services.ts": `export const SERVICE_SLUGS = ["machine-retrofits", "control-panels"] as const;`,
      "src/data/industries.ts": `export const INDUSTRY_SLUGS = ["food-beverage"] as const;`,
      "src/data/projects.ts": `export const PROJECTS = [{ slug: "pasteurizer-cip-recipes" }];`,
    };
    /** Copy for every fixture slug (the data-coverage guard requires it), in every locale. */
    const withCopy = (t: Tree): Tree => {
      for (const l of LOCALES) {
        t[l].services = { items: { "machine-retrofits": { title: "x" }, "control-panels": { title: "x" } } };
        t[l].industries = { items: { "food-beverage": { title: "x" } } };
        t[l].projects = { items: { "pasteurizer-cip-recipes": { title: "x" } } };
      }
      return t;
    };
    const linkTree = (patch: Partial<Record<L, string>> = {}) =>
      withCopy(tree({ a: "See our {link:services/machine-retrofits|retrofit service}." }, Object.fromEntries(Object.entries(patch).map(([l, a]) => [l, { a }]))));

    it("uses the same token pattern as src/lib/text.ts", () => {
      const script = readFileSync(SCRIPT, "utf8");
      expect(script).toContain("const LINK_TOKEN_SOURCE = String.raw`" + LINK_TOKEN_SOURCE + "`;");
    });
    it("accepts real routes (sections and data slugs) and allow-listed official https links", () => {
      const ok = withCopy(tree({
        a: "{link:services/machine-retrofits|a} {link:industries/food-beverage|b} {link:projects/pasteurizer-cip-recipes|c} {link:foreign-manufacturers|d} {link:about|e} {link:ext:https://www.gafi.gov.eg/|GAFI} {link:ext:https://sczone.eg/|SCZONE}",
      }));
      const { code, out } = run(ok, DATA);
      expect(out).toContain("i18n check passed");
      expect(code).toBe(0);
    });
    it("fails on an internal target that is not a page", () => {
      const { code, out } = run(linkTree({ en: "See {link:services/retrofits|x}.", ar: "{link:services/retrofits|x}", zh: "{link:services/retrofits|x}", tr: "{link:services/retrofits|x}" }), DATA);
      expect(code).toBe(1);
      expect(out).toContain('en/home.json: a links to "services/retrofits", which is not a page of the site');
    });
    it("fails when a locale links to different targets than English", () => {
      const { code, out } = run(linkTree({ zh: "详见{link:services/control-panels|控制柜}。", tr: "Bakınız." }), DATA);
      expect(code).toBe(1);
      expect(out).toContain("zh/home.json: a links to [services/control-panels], en links to [services/machine-retrofits]");
      expect(out).toContain("tr/home.json: a links to [], en links to [services/machine-retrofits]");
    });
    it("fails on a malformed token", () => {
      const { code, out } = run(linkTree({ ar: "{link:services/machine-retrofits}" , en: "See {link:Services/Machine|x}." }), DATA);
      expect(code).toBe(1);
      expect(out).toContain("ar/home.json: a has a malformed link token");
      expect(out).toContain("en/home.json: a has a malformed link token");
    });
    it("fails on external links that are not https or not on an allow-listed host", () => {
      const notHttps = run(withCopy(tree({ a: "{link:ext:http://www.gafi.gov.eg/|GAFI}" })), DATA);
      expect(notHttps.code).toBe(1);
      expect(notHttps.out).toContain("malformed link token");
      const other = run(withCopy(tree({ a: "{link:ext:https://example.com/|x}" })), DATA);
      expect(other.code).toBe(1);
      expect(other.out).toContain('links to "https://example.com/", which is not an https URL on an allow-listed official host');
    });
  });
});

