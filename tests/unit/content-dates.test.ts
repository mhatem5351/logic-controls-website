/**
 * scripts/content-dates.mjs — per-page content hashes and the dates derived from them (audit CS2-04).
 *
 * Everything runs on in-memory fixture trees and hand-built contexts: the real src/data/content-dates.json, the working
 * tree and git are never read, so the suite stays fast and independent of whatever is being edited.
 */
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

/** A small repository: 2 locales, 1 service, 1 industry, 2 projects (Arabic has no copy for "b"). */
function fixture(): Tree {
  const project = (s: string, l: string) => ({ title: `${l} title ${s}`, cardTitle: `${l} card ${s}`, client: `${l} client ${s}`, summary: `${l} summary ${s}`, challenge: `${l} challenge ${s}` });
  const t: Tree = {
    "src/i18n/config.ts": 'export const LOCALES = ["en", "ar"] as const;\nexport type Locale = (typeof LOCALES)[number];',
    "src/data/services.ts": 'export const SERVICE_SLUGS = ["s1"] as const;\nexport const SERVICES = [\n  { slug: "s1", icon: "cpu" },\n];',
    "src/data/industries.ts": 'export const INDUSTRY_SLUGS = ["i1"] as const;\nexport const INDUSTRIES = [{ slug: "i1", icon: "milk" }];',
    "src/data/projects.ts": PROJECTS_TS,
    "src/data/technologies.ts": 'export const BRAND_SLUGS = ["siemens"] as const;',
    "src/assets/projects/a/hmi.jpg": new Uint8Array([1, 2, 3]),
    "src/assets/projects/b/panel.jpg": new Uint8Array([4, 5, 6]),
  };
  for (const l of LOCALES) {
    const m = (ns: string, v: unknown) => (t[`src/i18n/messages/${l}/${ns}.json`] = v);
    m("home", { seo: { title: `${l} home` }, hero: { title: `${l} hero` } });
    m("services", { index: { h1: `${l} services` }, items: { s1: { title: `${l} s1`, summary: `${l} s1 summary`, intro: `${l} s1 intro` } } });
    m("industries", { index: { h1: `${l} industries` }, items: { i1: { title: `${l} i1`, summary: `${l} i1 summary`, needs: [`${l} need`] } } });
    m("projects", { index: { h1: `${l} projects` }, labels: { countOne: "{count}" }, items: l === "ar" ? { a: project("a", l) } : { a: project("a", l), b: project("b", l) } });
    for (const ns of ["about", "contact", "technologies", "tech", "foreign", "privacy", "common", "ui"]) m(ns, { title: `${l} ${ns}` });
  }
  return t;
}

const files = (t: Tree) =>
  Object.fromEntries(Object.entries(t).map(([p, v]) => [p, typeof v === "string" || v instanceof Uint8Array ? v : JSON.stringify(v, null, 2)]));
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
      for (const p of ["", "services/", "services/s1/", "industries/", "industries/i1/", "projects/", "projects/a/", "about/", "contact/", "technologies/", "foreign-manufacturers/", "privacy/"])
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
    const a = hashes(), b = hashes();
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
        t["src/data/projects.ts"] = PROJECTS_TS.replace('slug: "b",', 'slug: "b", // the second one\n   ').replace("    year: 2026,", "\t\tyear: 2026, /* evidence */");
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
    expect(changedBy((t) => (t["src/data/projects.ts"] = PROJECTS_TS.replace("year: 2026", "year: 2025")))).toEqual(["/ar/projects/a/", "/en/projects/a/"]);
  });

  it("an image under src/assets/projects/<slug>/ changes that case study; dotfiles do not count", () => {
    expect(changedBy((t) => (t["src/assets/projects/b/panel.jpg"] = new Uint8Array([9])))).toEqual(["/en/projects/b/"]);
    expect(changedBy((t) => (t["src/assets/projects/a/gallery.jpg"] = new Uint8Array([7])))).toEqual(["/ar/projects/a/", "/en/projects/a/"]);
    expect(changedBy((t) => (t["src/assets/projects/a/.DS_Store"] = "junk"))).toEqual([]);
  });

  it("FEATURED_PROJECT_SLUGS decides which case studies the home page depends on", () => {
    expect(changedBy((t) => (t["src/data/projects.ts"] = PROJECTS_TS.replace('= ["a"]', '= ["b"]')))).toEqual(["/ar/", "/en/"]);
  });

  it("service / industry copy: item → its page; card field → also index and home", () => {
    expect(changedBy((t) => (msg(t, "ar", "services").items.s1.intro = "new"))).toEqual(["/ar/services/s1/"]);
    expect(changedBy((t) => (msg(t, "en", "industries").items.i1.title = "new"))).toEqual(["/en/", "/en/industries/", "/en/industries/i1/"]);
    expect(changedBy((t) => (msg(t, "en", "services").index.h1 = "new"))).toEqual(["/en/services/"]);
  });

  it("technologies page: technologies.json, tech.json and src/data/technologies.ts", () => {
    expect(changedBy((t) => (msg(t, "en", "tech").title = "new"))).toEqual(["/en/technologies/"]);
    expect(changedBy((t) => (t["src/data/technologies.ts"] = 'export const BRAND_SLUGS = ["siemens", "delta"] as const;'))).toEqual(["/ar/technologies/", "/en/technologies/"]);
  });

  it("shared chrome and listing labels date no page", () => {
    expect(changedBy((t) => (msg(t, "en", "common").title = "new"))).toEqual([]);
    expect(changedBy((t) => (msg(t, "ar", "ui").title = "new"))).toEqual([]);
    expect(changedBy((t) => (msg(t, "en", "projects").labels.countOne = "new"))).toEqual([]);
  });

  it("canonical JSON sorts keys at every level and drops undefined members", () => {
    expect(I.canonicalJson({ b: 1, a: [{ d: 1, c: 2 }, undefined], u: undefined })).toBe('{"a":[{"c":2,"d":1},null],"b":1}');
    expect(I.contentHash({ x: 1, y: 2 })).toBe(I.contentHash({ y: 2, x: 1 }));
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
  });

  it("extracts a multi-line record from a real-shaped data module", () => {
    expect(I.extractObjectLiteral(PROJECTS_TS, "a")).toBe('{\n    slug: "a",\n    year: 2026,\n    cover: { key: "hmi", image: aHmi },\n  }');
  });

  it("normalizes code: comments out, whitespace collapsed, strings untouched", () => {
    expect(I.normalizeCode('{\n  a: 1, // c\n  b: "x  y" /* d */\n}')).toBe('{ a: 1, b: "x  y" }');
  });

  it("reads const lists, with or without a type annotation", () => {
    expect(I.constList(PROJECTS_TS, "PROJECT_SLUGS")).toEqual(["a", "b"]);
    expect(I.constList(PROJECTS_TS, "FEATURED_PROJECT_SLUGS")).toEqual(["a"]);
    expect(I.constList(PROJECTS_TS, "MISSING")).toEqual([]);
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
    const r = I.mergeStored(stored, new Map([["/en/a/", "1"], ["/en/b/", "2b"], ["/en/new/", "4"]]), NOW);
    expect(r.next).toEqual({
      "/en/a/": stored["/en/a/"],
      "/en/b/": { hash: "2b", modified: NOW, published: "2026-10-06T15:00:00+03:00" },
      "/en/new/": { hash: "4", modified: NOW, published: NOW },
    });
    expect([r.unchanged, r.changed, r.added, r.removed]).toEqual([["/en/a/"], ["/en/b/"], ["/en/new/"], ["/en/gone/"]]);
  });

  it("--bootstrap walk: first presence = published, last hash change = modified, dirty working tree = now", () => {
    const c1 = fixture();
    for (const l of LOCALES) delete c1[`src/i18n/messages/${l}/about.json`];
    const c2 = fixture();
    const c3 = fixture();
    msg(c3, "en", "home").hero.title = "changed";
    const work = fixture();
    msg(work, "en", "home").hero.title = "changed";
    msg(work, "en", "about").title = "edited, not committed";
    const commits = [
      { date: "2026-10-06T14:00:00+03:00", reader: reader(c1) },
      { date: "2026-10-06T15:00:00+03:00", reader: reader(c2) },
      { date: "2026-10-06T16:00:00+03:00", reader: reader(c3) },
      { date: "2026-10-06T17:00:00+03:00", reader: reader(c3) },
    ];
    const { next, dirty } = I.historyDates(commits, I.pageHashes(reader(work)), NOW);
    expect(next["/en/"]).toMatchObject({ published: "2026-10-06T14:00:00+03:00", modified: "2026-10-06T16:00:00+03:00" });
    expect(next["/ar/"]).toMatchObject({ published: "2026-10-06T14:00:00+03:00", modified: "2026-10-06T14:00:00+03:00" });
    expect(next["/ar/about/"]).toMatchObject({ published: "2026-10-06T15:00:00+03:00", modified: "2026-10-06T15:00:00+03:00" });
    expect(next["/en/about/"]).toMatchObject({ published: "2026-10-06T15:00:00+03:00", modified: NOW });
    expect(dirty).toEqual(["/en/about/"]);
  });

  it("serializes with sorted paths, { hash, modified, published }, 2-space indent and a trailing newline", () => {
    const text = I.serialize({
      "/en/b/": { published: "p", modified: "m", hash: "h" },
      "/ar/": { hash: "h", modified: "m", published: "p" },
    });
    expect(text).toBe('{\n  "/ar/": {\n    "hash": "h",\n    "modified": "m",\n    "published": "p"\n  },\n  "/en/b/": {\n    "hash": "h",\n    "modified": "m",\n    "published": "p"\n  }\n}\n');
  });

  it("now: ISO 8601 with the local UTC offset and no milliseconds, same instant", () => {
    const d = new Date("2026-10-07T03:30:00.789Z");
    const iso = I.isoLocal(d);
    expect(iso).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/);
    expect(Date.parse(iso)).toBe(Date.parse("2026-10-07T03:30:00Z"));
  });
});
