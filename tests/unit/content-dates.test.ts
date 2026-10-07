/**
 * scripts/content-dates.mjs — per-page content hashes and the dates derived from them (audit CS2-04).
 *
 * Everything runs on in-memory fixture trees and hand-built contexts: the real src/data/content-dates.json and git are
 * never read, so the suite stays fast and independent of whatever is being edited. One guard reads the real data
 * modules, only to check that the shared inputs (SITE figures, slug lists) can still be found in them.
 */
import { fileURLToPath } from "node:url";
import { format } from "prettier";
import { describe, expect, it, vi } from "vitest";
import { _internal as I, lastModFor, pageDates } from "../../scripts/content-dates.mjs";

const LOCALES = ["en", "ar"] as const;
type Tree = Record<string, unknown>;

const PROJECTS_TS = [
  'import aHmi from "~/assets/projects/a/hmi.jpg";',
  'export const PROJECT_SLUGS = ["a", "b"] as const;',
  "export const PROJECTS = [",
  "  {",
  '    slug: "a",',
  "    year: 2026,",
  '    cover: { key: "hmi", image: aHmi },',
  "  },",
  '  { slug: "b", year: 2025, cover: { key: "panel", image: bPanel } },',
  "];",
  "/** Home page order. */",
  'export const FEATURED_PROJECT_SLUGS: readonly ProjectSlug[] = ["a"];',
].join("\n");

const SITE_TS = [
  "export const SITE = {",
  '  name: "Logic Controls",',
  '  email: "info@example.com",',
  '  address: { locality: "6th of October City", region: "Giza" },',
  "  experienceYears: 4,",
  "  projectsCount: 50,",
  '  brands: ["Siemens", "Delta"],',
  "} as const;",
].join("\n");

const ZONES_TS = [
  'export const ZONE_SLUGS = ["z1", "z2"] as const;',
  'export type ZoneRegion = "greater-cairo" | "nile-delta";',
  "export const ZONES = [",
  '  { slug: "z1", region: "greater-cairo", home: true },',
  '  { slug: "z2", region: "nile-delta" },',
  "];",
].join("\n");

/** A small repository: 2 locales, 1 service, 1 industry, 2 projects (Arabic has no copy for "b"), 2 zones. */
function fixture(): Tree {
  const project = (s: string, l: string) => ({
    title: `${l} title ${s}`,
    cardTitle: `${l} card ${s}`,
    client: `${l} client ${s}`,
    summary: `${l} summary ${s}`,
    challenge: `${l} challenge ${s}`,
  });
  const t: Tree = {
    "src/i18n/config.ts": 'export const LOCALES = ["en", "ar"] as const;\nexport type Locale = (typeof LOCALES)[number];',
    "src/data/services.ts": 'export const SERVICE_SLUGS = ["s1"] as const;\nexport const SERVICES = [\n  { slug: "s1", icon: "cpu" },\n];',
    "src/data/industries.ts": 'export const INDUSTRY_SLUGS = ["i1"] as const;\nexport const INDUSTRIES = [{ slug: "i1", icon: "milk" }];',
    "src/data/projects.ts": PROJECTS_TS,
    "src/data/technologies.ts": 'export const BRAND_SLUGS = ["siemens"] as const;',
    "src/data/site.ts": SITE_TS,
    "src/data/zones.ts": ZONES_TS,
    "src/assets/projects/a/hmi.jpg": new Uint8Array([1, 2, 3]),
    "src/assets/projects/b/panel.jpg": new Uint8Array([4, 5, 6]),
  };
  for (const l of LOCALES) {
    const m = (ns: string, v: unknown) => (t[`src/i18n/messages/${l}/${ns}.json`] = v);
    m("home", { seo: { title: `${l} home` }, hero: { title: `${l} hero` } });
    m("services", {
      index: { h1: `${l} services` },
      items: { s1: { title: `${l} s1`, summary: `${l} s1 summary`, intro: `${l} s1 intro` } },
    });
    m("industries", {
      index: { h1: `${l} industries` },
      items: { i1: { title: `${l} i1`, summary: `${l} i1 summary`, needs: [`${l} need`] } },
    });
    m("projects", {
      index: { h1: `${l} projects` },
      labels: { countOne: "{count}" },
      items: l === "ar" ? { a: project("a", l) } : { a: project("a", l), b: project("b", l) },
    });
    for (const ns of ["contact", "technologies", "tech", "foreign", "privacy", "ui"]) m(ns, { title: `${l} ${ns}` });
    m("about", { title: `${l} about` });
    m("common", {
      title: `${l} common`,
      labels: { learnMore: `${l} learn more` },
      breadcrumbs: { about: `${l} about` },
      ctaBand: { default: { title: `${l} cta` } },
      notes: { anonymised: `${l} anonymised` },
      whatsapp: { default: `${l} hello` },
      stats: { title: `${l} numbers`, projects: { label: `${l} projects` }, caseStudies: { label: `${l} case studies` } },
      platforms: { title: `${l} platforms` },
      process: { title: `${l} process`, steps: [{ title: `${l} visit`, text: `${l} we visit` }] },
      quoteChecklist: { title: `${l} checklist`, items: [`${l} photos`] },
      teamStrip: { title: `${l} engineers` },
      zones: { title: `${l} zones`, items: { z1: { name: `${l} z1` }, z2: { name: `${l} z2` } } },
      company: { tagline: `${l} tagline`, addressLine: `${l} address` },
    });
  }
  return t;
}

const files = (t: Tree) =>
  Object.fromEntries(
    Object.entries(t).map(([p, v]) => [p, typeof v === "string" || v instanceof Uint8Array ? v : JSON.stringify(v, null, 2)]),
  );
const reader = (t: Tree) => I.memoryReader(files(t));
const hashes = (edit?: (t: Tree) => void) => {
  const t = fixture();
  edit?.(t);
  return I.pageHashes(reader(t));
};
/** Paths whose hash differs (or that appear / disappear) between two hash maps. */
const diff = (a: Map<string, string>, b: Map<string, string>) =>
  [...new Set([...a.keys(), ...b.keys()])].filter((p) => a.get(p) !== b.get(p)).sort();
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fixture JSON is edited freely in tests
const msg = (t: Tree, l: string, ns: string) => t[`src/i18n/messages/${l}/${ns}.json`] as Record<string, any>;
const changedBy = (edit: (t: Tree) => void) => diff(hashes(), hashes(edit));

describe("page list", () => {
  it("lists every page per locale and skips a slug page whose copy is missing", () => {
    const pages = [...hashes().keys()];
    for (const l of LOCALES)
      for (const p of [
        "",
        "services/",
        "services/s1/",
        "industries/",
        "industries/i1/",
        "projects/",
        "projects/a/",
        "about/",
        "contact/",
        "technologies/",
        "foreign-manufacturers/",
        "privacy/",
      ])
        expect(pages).toContain(`/${l}/${p}`);
    expect(pages).toContain("/en/projects/b/");
    expect(pages).not.toContain("/ar/projects/b/");
    expect(pages).toHaveLength(2 * 12 + 1);
  });

  it("drops a page whose single namespace is missing", () => {
    expect(changedBy((t) => delete t["src/i18n/messages/ar/privacy.json"])).toEqual(["/ar/privacy/"]);
  });
});

describe("content hash", () => {
  it("is stable: same content → same hashes; 16 hex chars", () => {
    const a = hashes(),
      b = hashes();
    expect(diff(a, b)).toEqual([]);
    for (const h of a.values()) expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it("ignores JSON key order and formatting", () => {
    expect(
      changedBy((t) => {
        const p = msg(t, "en", "projects");
        t["src/i18n/messages/en/projects.json"] = JSON.stringify(Object.fromEntries(Object.entries(p).reverse()));
      }),
    ).toEqual([]);
  });

  it("ignores comments and re-indentation in data modules", () => {
    expect(
      changedBy((t) => {
        t["src/data/projects.ts"] = PROJECTS_TS.replace('slug: "b",', 'slug: "b", // the second one\n   ').replace(
          "    year: 2026,",
          "\t\tyear: 2026, /* evidence */",
        );
      }),
    ).toEqual([]);
  });

  it("a non-card field of one case study changes only that page", () => {
    expect(changedBy((t) => (msg(t, "en", "projects").items.a.challenge = "new"))).toEqual(["/en/projects/a/"]);
  });

  it("a card field of a featured case study also changes the listing and the home page", () => {
    expect(changedBy((t) => (msg(t, "en", "projects").items.a.summary = "new"))).toEqual(["/en/", "/en/projects/", "/en/projects/a/"]);
  });

  it("a card field of a non-featured case study changes it and the listing, not home, not its sibling", () => {
    expect(changedBy((t) => (msg(t, "en", "projects").items.b.cardTitle = "new"))).toEqual(["/en/projects/", "/en/projects/b/"]);
  });

  it("the project's data record changes that case study in every locale", () => {
    expect(changedBy((t) => (t["src/data/projects.ts"] = PROJECTS_TS.replace("year: 2026", "year: 2025")))).toEqual([
      "/ar/projects/a/",
      "/en/projects/a/",
    ]);
  });

  it("an image under src/assets/projects/<slug>/ changes that case study; dotfiles do not count", () => {
    expect(changedBy((t) => (t["src/assets/projects/b/panel.jpg"] = new Uint8Array([9])))).toEqual(["/en/projects/b/"]);
    expect(changedBy((t) => (t["src/assets/projects/a/gallery.jpg"] = new Uint8Array([7])))).toEqual([
      "/ar/projects/a/",
      "/en/projects/a/",
    ]);
    expect(changedBy((t) => (t["src/assets/projects/a/.DS_Store"] = "junk"))).toEqual([]);
  });

  it("FEATURED_PROJECT_SLUGS decides which case studies the home page depends on", () => {
    expect(changedBy((t) => (t["src/data/projects.ts"] = PROJECTS_TS.replace('= ["a"]', '= ["b"]')))).toEqual(["/ar/", "/en/"]);
  });

  it("service / industry copy: item → its page; card field → also index and home", () => {
    expect(changedBy((t) => (msg(t, "ar", "services").items.s1.intro = "new"))).toEqual(["/ar/services/s1/"]);
    expect(changedBy((t) => (msg(t, "en", "industries").items.i1.title = "new"))).toEqual([
      "/en/",
      "/en/industries/",
      "/en/industries/i1/",
    ]);
    expect(changedBy((t) => (msg(t, "en", "services").index.h1 = "new"))).toEqual(["/en/services/"]);
  });

  it("technologies page: technologies.json, tech.json and src/data/technologies.ts", () => {
    expect(changedBy((t) => (msg(t, "en", "tech").title = "new"))).toEqual(["/en/technologies/"]);
    expect(changedBy((t) => (t["src/data/technologies.ts"] = 'export const BRAND_SLUGS = ["siemens", "delta"] as const;'))).toEqual([
      "/ar/technologies/",
      "/en/technologies/",
    ]);
  });

  it("shared chrome and listing labels date no page", () => {
    expect(changedBy((t) => (msg(t, "en", "common").title = "new"))).toEqual([]);
    expect(changedBy((t) => (msg(t, "ar", "ui").title = "new"))).toEqual([]);
    expect(changedBy((t) => (msg(t, "en", "projects").labels.countOne = "new"))).toEqual([]);
    for (const block of ["labels", "breadcrumbs", "ctaBand", "notes", "whatsapp"])
      expect(
        changedBy((t) => (msg(t, "en", "common")[block] = { x: "new" })),
        block,
      ).toEqual([]);
    expect(changedBy((t) => (msg(t, "en", "common").company.tagline = "new"))).toEqual([]);
    expect(changedBy((t) => (t["src/data/site.ts"] = SITE_TS.replace("info@example.com", "sales@example.com")))).toEqual([]);
  });

  it("canonical JSON sorts keys at every level and drops undefined members", () => {
    expect(I.canonicalJson({ b: 1, a: [{ d: 1, c: 2 }, undefined], u: undefined })).toBe('{"a":[{"c":2,"d":1},null],"b":1}');
    expect(I.contentHash({ x: 1, y: 2 })).toBe(I.contentHash({ y: 2, x: 1 }));
  });
});

describe("shared blocks re-date exactly the pages that show them", () => {
  const PROOF = ["/ar/", "/ar/about/", "/ar/foreign-manufacturers/", "/en/", "/en/about/", "/en/foreign-manufacturers/"];
  const ZONES = PROOF;

  it("proof figures: the SITE numbers and platform names → home, about, foreign-manufacturers in every locale", () => {
    expect(changedBy((t) => (t["src/data/site.ts"] = SITE_TS.replace("projectsCount: 50", "projectsCount: 60")))).toEqual(PROOF);
    expect(changedBy((t) => (t["src/data/site.ts"] = SITE_TS.replace("experienceYears: 4", "experienceYears: 5")))).toEqual(PROOF);
    expect(changedBy((t) => (t["src/data/site.ts"] = SITE_TS.replace('"Delta"]', '"Delta", "Wecon"]')))).toEqual(PROOF);
  });

  it("proof labels (common.stats) → that locale's home, about, foreign-manufacturers", () => {
    expect(changedBy((t) => (msg(t, "en", "common").stats.projects.label = "new"))).toEqual([
      "/en/",
      "/en/about/",
      "/en/foreign-manufacturers/",
    ]);
  });

  it("a new industry: its pages, the listing and home cards where it has copy, the industry count everywhere", () => {
    expect(
      changedBy((t) => {
        t["src/data/industries.ts"] =
          'export const INDUSTRY_SLUGS = ["i1", "i2"] as const;\nexport const INDUSTRIES = [{ slug: "i1", icon: "milk" }, { slug: "i2", icon: "pill" }];';
        msg(t, "en", "industries").items.i2 = { title: "en i2", summary: "en i2 summary" };
      }),
    ).toEqual([...PROOF, "/en/industries/", "/en/industries/i2/"].sort());
  });

  it("a new case study changes the home page's case-study count, even before it has copy", () => {
    expect(
      changedBy((t) => (t["src/data/projects.ts"] = PROJECTS_TS.replace('PROJECT_SLUGS = ["a", "b"]', 'PROJECT_SLUGS = ["a", "b", "c"]'))),
    ).toEqual(["/ar/", "/en/"]);
  });

  it("zones: common.zones and src/data/zones.ts → home, about, foreign-manufacturers", () => {
    expect(changedBy((t) => (msg(t, "ar", "common").zones.title = "new"))).toEqual(["/ar/", "/ar/about/", "/ar/foreign-manufacturers/"]);
    expect(changedBy((t) => (msg(t, "en", "common").zones.items.z2.name = "new"))).toEqual([
      "/en/",
      "/en/about/",
      "/en/foreign-manufacturers/",
    ]);
    expect(changedBy((t) => (t["src/data/zones.ts"] = ZONES_TS.replace('"z2"] as const', '"z2", "z3"] as const')))).toEqual(ZONES);
    expect(changedBy((t) => (t["src/data/zones.ts"] = ZONES_TS.replace('region: "nile-delta" }', 'region: "greater-cairo" }')))).toEqual(
      ZONES,
    );
  });

  it("process → home, about and the services listing; checklist → contact; platforms → home; address → about", () => {
    expect(changedBy((t) => (msg(t, "en", "common").process.steps[0].text = "new"))).toEqual(["/en/", "/en/about/", "/en/services/"]);
    expect(changedBy((t) => (msg(t, "en", "common").quoteChecklist.items[0] = "new"))).toEqual(["/en/contact/"]);
    expect(changedBy((t) => (msg(t, "ar", "common").platforms.title = "new"))).toEqual(["/ar/"]);
    expect(changedBy((t) => (msg(t, "en", "common").company.addressLine = "new"))).toEqual(["/en/about/"]);
  });

  it("team strip → home and foreign-manufacturers only", () => {
    expect(changedBy((t) => (msg(t, "en", "common").teamStrip.title = "new"))).toEqual(["/en/", "/en/foreign-manufacturers/"]);
  });
});

describe("formatting never re-dates a page (real Prettier output of every data module)", () => {
  const TS = Object.keys(fixture()).filter((p) => p.endsWith(".ts"));
  const STYLES = [
    { name: "the repo's style (printWidth 140)", options: { printWidth: 140 } },
    { name: "wrapped (printWidth 40): one item per line, trailing commas, leading | on unions", options: { printWidth: 40 } },
    {
      name: "single quotes, consistent quoted keys, no semicolons, no trailing commas",
      options: { printWidth: 60, singleQuote: true, quoteProps: "consistent", semi: false, trailingComma: "none" },
    },
    { name: "tabs, no bracket spacing", options: { useTabs: true, bracketSpacing: false } },
  ] as const;
  for (const { name, options } of STYLES)
    it(name, async () => {
      const t = fixture();
      for (const p of TS) t[p] = await format(t[p] as string, { parser: "typescript", ...options });
      expect(TS.filter((p) => t[p] !== fixture()[p]).length, "Prettier changed the fixture modules").toBeGreaterThan(0);
      expect(diff(hashes(), I.pageHashes(reader(t)))).toEqual([]);
    });

  it("a hand reflow with quoted keys and single quotes (what Prettier would undo) too", () => {
    expect(
      changedBy((t) => {
        t["src/data/projects.ts"] = PROJECTS_TS.replace(
          '{ slug: "b", year: 2025, cover: { key: "panel", image: bPanel } },',
          "{\n    'slug': 'b',\n    'year': 2025.0,\n    'cover': { 'key': 'panel', 'image': bPanel, },\n  },",
        );
      }),
    ).toEqual([]);
  });
});

describe("TS source helpers", () => {
  const SRC = [
    "export const X = [",
    '  // { slug: "a" } in a comment is ignored',
    '  { slug: "a", s: "}{", t: `x ${ {a: 1}.a } }`, /* } */ nested: { k: 1 } },',
    "  { slug: 'b', n: 2 },",
    "];",
    "const s = 'slug: \"c\"';",
  ].join("\n");

  it("extracts the object literal around slug: …, ignoring braces in strings, templates and comments", () => {
    expect(I.extractObjectLiteral(SRC, "a")).toBe('{ slug: "a", s: "}{", t: `x ${ {a: 1}.a } }`, /* } */ nested: { k: 1 } }');
    expect(I.extractObjectLiteral(SRC, "b")).toBe("{ slug: 'b', n: 2 }");
    expect(I.extractObjectLiteral(SRC, "c")).toBeUndefined();
    expect(I.extractObjectLiteral(SRC, "zz")).toBeUndefined();
    // a quoted key counts; the same text inside a longer string does not
    expect(I.extractObjectLiteral("[{ 'slug': 'q', n: 1 }]", "q")).toBe("{ 'slug': 'q', n: 1 }");
    expect(I.extractObjectLiteral(`[{ k: "'slug': 'q'" }]`, "q")).toBeUndefined();
  });

  it("extracts a multi-line record from a real-shaped data module", () => {
    expect(I.extractObjectLiteral(PROJECTS_TS, "a")).toBe(
      '{\n    slug: "a",\n    year: 2026,\n    cover: { key: "hmi", image: aHmi },\n  }',
    );
  });

  it("normalizes code to a token stream: comments and whitespace out, string contents untouched", () => {
    expect(I.normalizeCode('{\n  a: 1, // c\n  b: "x  y" /* d */\n}')).toBe('{a:1,b:"x  y"}');
    expect(I.normalizeCode("export const A = 1 as const")).toBe("export const A=1 as const");
  });

  it("formatting-only differences normalize to the same text", () => {
    const same = (...variants: string[]) => expect(new Set(variants.map((v) => I.normalizeCode(v))).size).toBe(1);
    same('{ slug: "a", x: ["b"] }', '{\n  slug: "a",\n  x: [\n    "b",\n  ],\n}', "{slug:'a',x:['b',],}", '{ "slug": "a", "x": ["b"] };');
    same('f("a", "b")', "f(\n  'a',\n  'b',\n);");
    same('type R = "a" | "b";', 'type R =\n  | "a"\n  | "b"');
    same("[1.5, 1, 0.5]", "[1.50, 1.0, .5,]");
    same('"it\'s"', "'it\\'s'");
  });

  it("…while real differences stay different", () => {
    const differ = (a: string, b: string) => expect(I.normalizeCode(a)).not.toBe(I.normalizeCode(b));
    differ('{ a: "x" }', '{ a: "y" }');
    differ("{ a: 1 }", "{ b: 1 }");
    differ('{ "a-b": 1 }', "{ ab: 1 }");
    differ("as const", "asconst");
    differ("a || b", "a | b");
    differ("[0xff]", "[255]"); // only plain decimals are canonicalized
    differ("`a ${b}`", "`a  ${b}`"); // template literals are kept as written
    // a quoted key needs quotes, a ternary branch is not a key: both keep their (canonical) quotes
    expect(I.normalizeCode("{ 'a-b': 1, c: x ? 'd' : 'e' }")).toBe('{"a-b":1,c:x?"d":"e"}');
  });

  it("decodes string escapes like JavaScript", () => {
    expect(I.decodeString(String.raw`it\'s \"q\" \n\t \x41\u00e9\u{1F600} \q`)).toBe('it\'s "q" \n\t Aé😀 q');
    expect(I.decodeString("a\\\nb")).toBe("ab"); // line continuation
    expect(I.decodeString(String.raw`\u{110000}`)).toBeUndefined();
  });

  it("reads const lists from normalized source, with or without a type annotation, in any quote style", () => {
    const code = I.normalizeCode(PROJECTS_TS);
    expect(I.constList(code, "PROJECT_SLUGS")).toEqual(["a", "b"]);
    expect(I.constList(code, "FEATURED_PROJECT_SLUGS")).toEqual(["a"]);
    expect(I.constList(code, "MISSING")).toEqual([]);
    expect(I.constList(I.normalizeCode("export const L = [\n  'en',\n  'ar',\n] as const"), "L")).toEqual(["en", "ar"]);
  });

  it("reads members of the SITE literal, formatting-insensitive", () => {
    const r = reader(fixture());
    expect([I.siteMember(r, "projectsCount"), I.siteMember(r, "experienceYears"), I.siteMember(r, "brands")]).toEqual([
      "50",
      "4",
      '["Siemens","Delta"]',
    ]);
    expect(I.siteMember(r, "missing")).toBeUndefined();
  });
});

describe("git blob ids", () => {
  it("match `git hash-object` (printf 'hello\\n' | git hash-object --stdin)", () => {
    expect(I.blobSha("hello\n")).toBe("ce013625030ba8dba906f756967f9e9ca394464a");
    expect(I.blobSha(new TextEncoder().encode("hello\n"))).toBe("ce013625030ba8dba906f756967f9e9ca394464a");
    expect(I.blobSha("")).toBe("e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
  });
});

describe("pageDates / lastModFor", () => {
  const NOW = "2026-10-07T06:30:00+03:00";
  const context = () => ({
    stored: {
      "/en/projects/a/": { hash: "old", modified: "2026-10-07T04:45:03+03:00", published: "2026-10-06T15:10:10+03:00" },
      "/en/about/": { hash: "same", modified: "2026-10-06T16:55:59+03:00", published: "2026-10-06T15:10:10+03:00" },
    },
    hashes: new Map([
      ["/en/projects/a/", "new"],
      ["/en/about/", "same"],
      ["/en/privacy/", "fresh"],
    ]),
    now: NOW,
    onStale: vi.fn(),
  });

  it("returns the stored dates when the hash matches (path, URL, missing trailing slash)", () => {
    const ctx = context();
    const stored = { published: "2026-10-06T15:10:10+03:00", modified: "2026-10-06T16:55:59+03:00" };
    expect(pageDates("/en/about/", ctx)).toEqual(stored);
    expect(pageDates("https://logic-controls.com/en/about/", ctx)).toEqual(stored);
    expect(pageDates("/en/about", ctx)).toEqual(stored);
    expect(ctx.onStale).not.toHaveBeenCalled();
  });

  it("stale stored hash → modified = the process timestamp, published kept, onStale fired", () => {
    const ctx = context();
    expect(pageDates("/en/projects/a/", ctx)).toEqual({ published: "2026-10-06T15:10:10+03:00", modified: NOW });
    expect(ctx.onStale).toHaveBeenCalled();
    expect(I.staleCount(ctx)).toBe(2);
  });

  it("a file written by another hash-algorithm version: every page is stale (published kept), onStale fired", () => {
    const ctx = { ...context(), version: I.ALGO_VERSION - 1 };
    expect(pageDates("/en/about/", ctx)).toEqual({ published: "2026-10-06T15:10:10+03:00", modified: NOW });
    expect(ctx.onStale).toHaveBeenCalled();
    expect(I.staleCount(ctx)).toBe(3);
    expect(pageDates("/en/about/", { ...context(), version: I.ALGO_VERSION })).toEqual({
      published: "2026-10-06T15:10:10+03:00",
      modified: "2026-10-06T16:55:59+03:00",
    });
  });

  it("page not in the file yet → published = modified = the process timestamp", () => {
    expect(pageDates("/en/privacy/", context())).toEqual({ published: NOW, modified: NOW });
  });

  it("lastModFor: modified of a page; undefined for paths that are not content pages", () => {
    const ctx = context();
    expect(lastModFor("https://logic-controls.com/en/about/", ctx)).toBe("2026-10-06T16:55:59+03:00");
    expect(lastModFor("https://logic-controls.com/en/contact/thanks/", ctx)).toBeUndefined();
    expect(lastModFor("https://logic-controls.com/", ctx)).toBeUndefined();
    expect(pageDates("/en/contact/thanks/", ctx)).toEqual({});
  });
});

describe("file maintenance", () => {
  const NOW = "2026-10-07T06:30:00+03:00";

  it("--write merge: unchanged keeps dates, changed → modified now, new → both now, vanished removed", () => {
    const stored = {
      "/en/a/": { hash: "1", modified: "2026-10-06T16:00:00+03:00", published: "2026-10-06T15:00:00+03:00" },
      "/en/b/": { hash: "2", modified: "2026-10-06T16:00:00+03:00", published: "2026-10-06T15:00:00+03:00" },
      "/en/gone/": { hash: "3", modified: "2026-10-06T16:00:00+03:00", published: "2026-10-06T15:00:00+03:00" },
    };
    const r = I.mergeStored(
      stored,
      new Map([
        ["/en/a/", "1"],
        ["/en/b/", "2b"],
        ["/en/new/", "4"],
      ]),
      NOW,
    );
    expect(r.next).toEqual({
      "/en/a/": stored["/en/a/"],
      "/en/b/": { hash: "2b", modified: NOW, published: "2026-10-06T15:00:00+03:00" },
      "/en/new/": { hash: "4", modified: NOW, published: NOW },
    });
    expect([r.unchanged, r.changed, r.added, r.removed]).toEqual([["/en/a/"], ["/en/b/"], ["/en/new/"], ["/en/gone/"]]);
  });

  it("--bootstrap walk: first presence = published, last hash change = modified, dirty working tree = now", () => {
    const c1 = fixture();
    for (const l of LOCALES) delete c1[`src/i18n/messages/${l}/privacy.json`];
    const c2 = fixture();
    const c3 = fixture();
    msg(c3, "en", "home").hero.title = "changed";
    const work = fixture();
    msg(work, "en", "home").hero.title = "changed";
    msg(work, "en", "privacy").title = "edited, not committed";
    const commits = [
      { date: "2026-10-06T14:00:00+03:00", reader: reader(c1) },
      { date: "2026-10-06T15:00:00+03:00", reader: reader(c2) },
      { date: "2026-10-06T16:00:00+03:00", reader: reader(c3) },
      { date: "2026-10-06T17:00:00+03:00", reader: reader(c3) },
    ];
    const { next, dirty } = I.historyDates(commits, I.pageHashes(reader(work)), NOW);
    expect(next["/en/"]).toMatchObject({ published: "2026-10-06T14:00:00+03:00", modified: "2026-10-06T16:00:00+03:00" });
    expect(next["/ar/"]).toMatchObject({ published: "2026-10-06T14:00:00+03:00", modified: "2026-10-06T14:00:00+03:00" });
    expect(next["/ar/privacy/"]).toMatchObject({ published: "2026-10-06T15:00:00+03:00", modified: "2026-10-06T15:00:00+03:00" });
    expect(next["/en/privacy/"]).toMatchObject({ published: "2026-10-06T15:00:00+03:00", modified: NOW });
    expect(dirty).toEqual(["/en/privacy/"]);
  });

  it("serializes with $version first, sorted paths, { hash, modified, published }, 2-space indent and a trailing newline", () => {
    const text = I.serialize({
      "/en/b/": { published: "p", modified: "m", hash: "h" },
      "/ar/": { hash: "h", modified: "m", published: "p" },
    });
    expect(text).toBe(
      `{\n  "$version": ${I.ALGO_VERSION},\n  "/ar/": {\n    "hash": "h",\n    "modified": "m",\n    "published": "p"\n  },\n  "/en/b/": {\n    "hash": "h",\n    "modified": "m",\n    "published": "p"\n  }\n}\n`,
    );
  });

  it("$version round-trips and is never a page; a file without it is version 1", () => {
    const entry = { hash: "h", modified: "m", published: "p" };
    const back = I.splitStored(JSON.parse(I.serialize({ "/en/": entry })));
    expect(back).toEqual({ version: I.ALGO_VERSION, entries: { "/en/": entry } });
    expect(I.splitStored({ "/en/": entry })).toEqual({ version: 1, entries: { "/en/": entry } });
    // even a raw object that still carries the key: not "removed", not "unchanged"
    const raw = { $version: I.ALGO_VERSION, "/en/": entry } as unknown as Parameters<typeof I.mergeStored>[0];
    const r = I.mergeStored(raw, new Map([["/en/", "h"]]), NOW);
    expect([r.unchanged, r.changed, r.added, r.removed]).toEqual([["/en/"], [], [], []]);
    expect(Object.keys(r.next)).toEqual(["/en/"]);
  });

  it("--check: another hash-algorithm version is reported as such; otherwise changed / missing / extra", () => {
    const entry = (hash: string) => ({ hash, modified: "m", published: "p" });
    const hashes = new Map([
      ["/en/", "1"],
      ["/en/new/", "2"],
    ]);
    expect(I.checkStored({ version: 1, entries: { "/en/": entry("1") } }, hashes)).toEqual({
      versionChanged: true,
      changed: [],
      added: [],
      removed: [],
    });
    expect(I.checkStored({ version: I.ALGO_VERSION, entries: { "/en/": entry("0"), "/en/gone/": entry("3") } }, hashes)).toEqual({
      versionChanged: false,
      changed: ["/en/"],
      added: ["/en/new/"],
      removed: ["/en/gone/"],
    });
  });

  it("now: ISO 8601 with the local UTC offset and no milliseconds, same instant", () => {
    const d = new Date("2026-10-07T03:30:00.789Z");
    const iso = I.isoLocal(d);
    expect(iso).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/);
    expect(Date.parse(iso)).toBe(Date.parse("2026-10-07T03:30:00Z"));
  });
});

describe("the real data modules still expose the shared inputs", () => {
  // Guards the regex-free reads above against a refactor of src/data (a moved SITE member would silently stop counting).
  const r = I.workingTreeReader(fileURLToPath(new URL("../../", import.meta.url)));
  it("SITE figures, slug lists and the zones module are found", () => {
    expect(I.siteMember(r, "projectsCount")).toMatch(/^\d+$/);
    expect(I.siteMember(r, "experienceYears")).toMatch(/^\d+$/);
    expect(JSON.parse(I.siteMember(r, "brands") ?? "[]").length).toBeGreaterThan(0);
    for (const [file, list] of [
      ["src/data/industries.ts", "INDUSTRY_SLUGS"],
      ["src/data/projects.ts", "PROJECT_SLUGS"],
      ["src/data/zones.ts", "ZONE_SLUGS"],
      ["src/i18n/config.ts", "LOCALES"],
    ])
      expect(I.constList(r.code(file), list).length, `${list} in ${file}`).toBeGreaterThan(0);
    const { proof } = I.pageParts(r, "/en/") as { proof: Record<string, unknown> };
    for (const k of ["copy", "projects", "experience", "brands", "industries", "caseStudies"])
      expect(proof[k], `home proof.${k}`).toBeDefined();
  });
});
