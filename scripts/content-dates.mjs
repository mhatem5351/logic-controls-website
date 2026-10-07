// Content dates per page (sitemap <lastmod>, case-study Article datePublished / dateModified), read from a committed
// file, src/data/content-dates.json, that this script maintains. The build needs no git history (CI clones are
// shallow), a dirty tree cannot leave stale dates behind, and a one-word edit re-dates only the page it is on
// (audit CS2-04: Google trusts lastmod only when it is consistently accurate).
//
// MODEL
//   Each page has a content hash: the first 16 hex chars of sha256 over a canonical JSON serialization (object keys
//   sorted, arrays in order, undefined dropped) of that page's OWN content. content-dates.json maps every
//   locale-prefixed path to { hash, modified, published }: published = first time the page's content existed,
//   modified = last time its hash changed. Keys sorted, 2-space indent, trailing newline.
//
//   Pages, for every locale L in src/i18n/config.ts LOCALES (slug lists read from the data modules with regexes, never
//   imported; a slug page whose copy or data record is missing in that locale is skipped). Copy = the locale's
//   src/i18n/messages/L/<ns>.json; "*" = the slugs in the module's *_SLUGS list that have copy (all items without one):
//     /L/                           home.json (whole) + services.items[*].{title,summary} + industries.items[*].{title,summary}
//                                   + projects.items[f].{cardTitle,client,summary} for f in FEATURED_PROJECT_SLUGS, in order
//     /L/services/                  services.index + services.items[*].{title,summary}
//     /L/services/<slug>/           services.items[slug] + the slug's object literal in src/data/services.ts
//     /L/industries/                industries.index + industries.items[*].{title,summary}
//     /L/industries/<slug>/         industries.items[slug] + the slug's object literal in src/data/industries.ts
//     /L/projects/                  projects.index + projects.items[*].{cardTitle,client,summary}
//     /L/projects/<slug>/           projects.items[slug] + the slug's object literal in src/data/projects.ts
//                                   + git blob ids of every file under src/assets/projects/<slug>/
//     /L/about/                     about.json            /L/contact/        contact.json
//     /L/technologies/              technologies.json + tech.json + src/data/technologies.ts (whole file)
//     /L/foreign-manufacturers/     foreign.json          /L/privacy/        privacy.json
//   Object literal = the `{…}` enclosing `slug: "<slug>"` (brace matcher that skips strings, template literals and
//   comments; regex literals are not parsed — data modules have none). Source text from .ts files is compared with
//   comments removed and whitespace runs collapsed outside strings, so a reformat or a comment edit never re-dates a
//   page. Asset ids are git blob ids, sha1("blob <bytes>\0" + content), computed from the files themselves so the
//   working tree and `git ls-tree` at any commit agree without git; dotfiles (.DS_Store) and symlinks are ignored.
//
//   Deliberately NOT content: templates (src/pages, components, layouts, styles), shared chrome (common.json, ui.json,
//   seo.json, projects.labels, tech chip labels on case studies) and other records a page merely links to (related
//   case studies). Search engines want "this page's content changed", not "the site was rebuilt": a nav or layout edit
//   that re-dates all pages at once is exactly what makes lastmod untrustworthy. Trade-off: a template change that
//   alters what a page says (a new section) re-dates the page only through the copy that section adds.
//
// BUILD (pageDates / lastModFor; no git, no writes)
//   Stored hash == current hash → the stored dates. Otherwise (copy edited without refreshing the file, or a page not
//   in it yet) → modified = this process's start time, published = the stored published or that same time, and ONE
//   warning per process on stderr. A forgotten refresh therefore never understates a change, and dates never go missing.
//   The current hashes and the file are read once per process (shared through globalThis, so the copy Astro loads for
//   astro.config.mjs and the copy bundled into src/lib/jsonld.ts agree, including on the timestamp).
//
// CLI
//   node scripts/content-dates.mjs --write      Refresh the file: unchanged hash → keep dates; changed → modified = now;
//                                               new page → published = modified = now; vanished pages removed.
//                                               Without a file yet, bootstraps (below).
//   node scripts/content-dates.mjs --check      Exit 1 listing changed / missing / extra paths; exit 0 when current.
//                                               Never writes.
//   node scripts/content-dates.mjs --bootstrap  Rebuild from git history (refuses on a shallow clone): every commit of
//                                               `git rev-list --reverse HEAD` is hashed from its own blobs (one
//                                               `git cat-file --batch` for all of them); published = committer date of
//                                               the first commit where the page is present, modified = committer date
//                                               of the commit where its hash last changed; a page whose working-tree
//                                               hash differs from HEAD's gets modified = now. Writes the file.
//   "now" = ISO 8601 with this machine's UTC offset and no milliseconds (git %cI style), one value per process.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** @typedef {{ hash: string, modified: string, published: string }} Entry */
/** @typedef {Record<string, Entry>} Stored */
/**
 * Everything pageDates() needs. Build: one per repo root, cached for the process. Tests: built from fixtures.
 * @typedef {{ stored: Stored, hashes: Map<string, string>, now: string, onStale?: (ctx: Context) => void }} Context
 */
/**
 * A view of the repository: the working tree, one git commit, or an in-memory fixture. Paths are repo-relative, "/".
 * @typedef {object} Reader
 * @property {(path: string) => string | undefined} text
 * @property {(path: string) => any} json parsed JSON, undefined when the file is missing
 * @property {(path: string) => string | undefined} code normalized source (comments removed, whitespace collapsed)
 * @property {(file: string, slug: string) => string | undefined} literal normalized object literal of `slug: "<slug>"`
 * @property {(slug: string) => Array<[string, string]>} assets [path under src/assets/projects/<slug>/, git blob id], sorted
 */

export const DATES_FILE = "src/data/content-dates.json";
const ASSETS_DIR = "src/assets/projects/";
const MSG = (/** @type {string} */ locale, /** @type {string} */ ns) => `src/i18n/messages/${locale}/${ns}.json`;

/* ------------------------------------------------------------------------------------------------ time */

const pad = (/** @type {number} */ n) => String(n).padStart(2, "0");
/**
 * ISO 8601 with the machine's local UTC offset and no milliseconds, like git's %cI: 2026-10-07T06:30:00+03:00.
 * @param {Date} [date]
 */
function isoLocal(date = new Date()) {
  const offset = -date.getTimezoneOffset();
  const local = new Date(date.getTime() + offset * 60_000).toISOString().slice(0, 19);
  const a = Math.abs(offset);
  return `${local}${offset < 0 ? "-" : "+"}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

/** Shared by every copy of this module in the process (Astro loads it once for the config and bundles it once more). */
const STATE_KEY = Symbol.for("logic-controls.content-dates");
/** @type {{ now: string, warned: boolean, contexts: Map<string, Context> }} */
const state = /** @type {any} */ (globalThis)[STATE_KEY] ?? ((/** @type {any} */ (globalThis))[STATE_KEY] = { now: isoLocal(), warned: false, contexts: new Map() });

/* ------------------------------------------------------------------------------------------------ hashing */

/**
 * JSON with object keys sorted (code-unit order) at every level; undefined object members are dropped.
 * @param {unknown} value
 * @returns {string}
 */
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? "null" : canonicalJson(v))).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = /** @type {Record<string, unknown>} */ (value);
    return `{${Object.keys(obj)
      .sort()
      .filter((k) => obj[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** @param {unknown} parts */
const contentHash = (parts) => createHash("sha256").update(canonicalJson(parts)).digest("hex").slice(0, 16);

/**
 * Git blob id of a file's bytes (what `git hash-object` / `git ls-tree` print).
 * @param {Uint8Array | string} bytes
 */
function blobSha(bytes) {
  const buf = typeof bytes === "string" ? Buffer.from(bytes, "utf8") : bytes;
  return createHash("sha1").update(`blob ${buf.length}\0`).update(buf).digest("hex");
}

/* ------------------------------------------------------------------------------------------------ TS source */

/**
 * Split JS/TS source into code / string / comment runs. Template literals are strings; their `${…}` bodies are code.
 * Regex literals are not recognized (data modules have none).
 * @param {string} src
 * @returns {Array<["code" | "string" | "comment", number, number]>}
 */
function segments(src) {
  /** @type {Array<["code" | "string" | "comment", number, number]>} */
  const out = [];
  const n = src.length;
  /** brace depth at which each open template `${` began */
  const tpl = [];
  let depth = 0, start = 0, i = 0, inTpl = false;
  const cut = (/** @type {"code" | "string" | "comment"} */ type, /** @type {number} */ end) => {
    if (end > start) out.push([type, start, end]);
    start = end;
  };
  while (i < n) {
    const c = src[i];
    if (inTpl) {
      if (c === "\\") i += 2;
      else if (c === "`") {
        i++;
        cut("string", i);
        inTpl = false;
      } else if (c === "$" && src[i + 1] === "{") {
        i += 2;
        cut("string", i);
        tpl.push(depth);
        inTpl = false;
      } else i++;
    } else if (c === "/" && src[i + 1] === "/") {
      cut("code", i);
      const e = src.indexOf("\n", i);
      i = e < 0 ? n : e;
      cut("comment", i);
    } else if (c === "/" && src[i + 1] === "*") {
      cut("code", i);
      const e = src.indexOf("*/", i + 2);
      i = e < 0 ? n : e + 2;
      cut("comment", i);
    } else if (c === '"' || c === "'") {
      cut("code", i);
      i++;
      while (i < n && src[i] !== c && src[i] !== "\n") i += src[i] === "\\" ? 2 : 1;
      i = Math.min(i + 1, n);
      cut("string", i);
    } else if (c === "`") {
      cut("code", i);
      i++;
      inTpl = true;
    } else if (c === "}" && tpl.length && tpl[tpl.length - 1] === depth) {
      cut("code", i);
      tpl.pop();
      i++;
      inTpl = true;
    } else {
      if (c === "{") depth++;
      else if (c === "}") depth--;
      i++;
    }
  }
  cut(inTpl ? "string" : "code", n);
  return out;
}

/**
 * Segments + matched code braces of a source file (computed once per file and reused for every slug).
 * @param {string} src
 */
function scanSource(src) {
  const segs = segments(src);
  /** @type {Array<[number, number]>} */
  const pairs = [];
  /** @type {number[]} */
  const stack = [];
  for (const [type, s, e] of segs) {
    if (type !== "code") continue;
    for (let i = s; i < e; i++) {
      if (src[i] === "{") stack.push(i);
      else if (src[i] === "}") {
        const o = stack.pop();
        if (o !== undefined) pairs.push([o, i]);
      }
    }
  }
  return { segs, pairs };
}

const escapeRe = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Source text of the object literal that contains `slug: "<slug>"` (innermost enclosing braces), or undefined.
 * @param {string} src
 * @param {string} slug
 * @param {ReturnType<typeof scanSource>} [scan]
 */
function extractObjectLiteral(src, slug, scan = scanSource(src)) {
  const inCode = (/** @type {number} */ i) => scan.segs.some(([t, s, e]) => t === "code" && s <= i && i < e);
  for (const m of src.matchAll(new RegExp(`\\bslug\\s*:\\s*(["'\`])${escapeRe(slug)}\\1`, "g"))) {
    const at = m.index ?? 0;
    if (!inCode(at)) continue;
    /** @type {[number, number] | undefined} */
    let best;
    for (const p of scan.pairs) if (p[0] < at && at < p[1] && (!best || p[0] > best[0])) best = p;
    return best ? src.slice(best[0], best[1] + 1) : undefined;
  }
  return undefined;
}

/**
 * Source without comments and with whitespace runs outside strings collapsed to one space (formatting-insensitive).
 * @param {string} src
 */
function normalizeCode(src) {
  let out = "", code = "";
  for (const [type, s, e] of segments(src)) {
    if (type === "string") {
      out += code.replace(/\s+/g, " ") + src.slice(s, e);
      code = "";
    } else code += type === "comment" ? " " : src.slice(s, e);
  }
  return (out + code.replace(/\s+/g, " ")).trim();
}

/**
 * `export const NAME[: type] = ["a", "b"]` → ["a", "b"] (like scripts/check-i18n.mjs constList()).
 * @param {string | undefined} src
 * @param {string} name
 * @returns {string[]}
 */
function constList(src, name) {
  const m = src && new RegExp(`export const ${name}\\b[^=]*=\\s*\\[([^\\]]*)\\]`).exec(src);
  return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
}

/* ------------------------------------------------------------------------------------------------ readers */

/** Asset paths that never count (and that git usually ignores): any dot segment (.DS_Store, .git…). */
const countedAsset = (/** @type {string} */ rel) => !rel.split("/").some((seg) => seg.startsWith("."));
const byPath = (/** @type {[string, string]} */ a, /** @type {[string, string]} */ b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

/**
 * @param {{ read: (path: string) => string | undefined, assets: (slug: string) => Array<[string, string]> }} source
 * @param {{ strict?: boolean }} [opts] strict: invalid JSON throws (working tree) instead of counting as missing (history)
 * @returns {Reader}
 */
function makeReader(source, { strict = false } = {}) {
  /** @type {Map<string, any>} */
  const cache = new Map();
  /** @type {<T>(key: string, fn: () => T) => T} */
  const memo = (key, fn) => {
    if (!cache.has(key)) cache.set(key, fn());
    return cache.get(key);
  };
  /** @type {Reader["text"]} */
  const text = (p) => memo(`t:${p}`, () => source.read(p)?.replace(/^﻿/, ""));
  const scan = (/** @type {string} */ p) =>
    memo(`s:${p}`, () => {
      const t = text(p);
      return t === undefined ? undefined : scanSource(t);
    });
  return {
    text,
    json: (p) =>
      memo(`j:${p}`, () => {
        const t = text(p);
        if (t === undefined) return undefined;
        try {
          return JSON.parse(t);
        } catch (e) {
          if (strict) throw new Error(`content-dates: ${p} is not valid JSON (${/** @type {Error} */ (e).message})`, { cause: e });
          return undefined;
        }
      }),
    code: (p) =>
      memo(`c:${p}`, () => {
        const t = text(p);
        return t === undefined ? undefined : normalizeCode(t);
      }),
    literal: (file, slug) =>
      memo(`l:${file}\0${slug}`, () => {
        const t = text(file);
        const lit = t === undefined ? undefined : extractObjectLiteral(t, slug, scan(file));
        return lit === undefined ? undefined : normalizeCode(lit);
      }),
    assets: (slug) => memo(`a:${slug}`, () => source.assets(slug).filter(([rel]) => countedAsset(rel)).sort(byPath)),
  };
}

/**
 * The files on disk under `root`.
 * @param {string} root
 */
function workingTreeReader(root) {
  return makeReader(
    {
      read(p) {
        try {
          return readFileSync(join(root, p), "utf8");
        } catch (e) {
          const code = /** @type {NodeJS.ErrnoException} */ (e).code;
          if (code === "ENOENT" || code === "ENOTDIR" || code === "EISDIR") return undefined;
          throw e;
        }
      },
      assets(slug) {
        const dir = join(root, ASSETS_DIR, slug);
        /** @type {string[]} */
        let names;
        try {
          names = readdirSync(dir, { recursive: true }).map(String);
        } catch {
          return [];
        }
        return names
          .map((n) => [n.split(sep).join("/"), join(dir, n)])
          .filter(([rel, abs]) => countedAsset(rel) && lstatSync(abs).isFile())
          .map(([rel, abs]) => [rel, blobSha(readFileSync(abs))]);
      },
    },
    { strict: true },
  );
}

/**
 * An in-memory tree (tests): repo-relative path → file content.
 * @param {Record<string, string | Uint8Array>} files
 */
function memoryReader(files) {
  return makeReader(
    {
      read: (p) => {
        const v = files[p];
        return v === undefined ? undefined : typeof v === "string" ? v : Buffer.from(v).toString("utf8");
      },
      assets: (slug) => {
        const prefix = `${ASSETS_DIR}${slug}/`;
        return Object.keys(files)
          .filter((p) => p.startsWith(prefix))
          .map((p) => [p.slice(prefix.length), blobSha(files[p])]);
      },
    },
    { strict: true },
  );
}

/**
 * One commit, from its `git ls-tree -r` map (path → blob id) and the blob contents fetched by `git cat-file --batch`.
 * @param {Map<string, string>} tree
 * @param {Map<string, string>} blobs
 */
function commitReader(tree, blobs) {
  return makeReader({
    read: (p) => {
      const id = tree.get(p);
      return id === undefined ? undefined : blobs.get(id);
    },
    assets: (slug) => {
      const prefix = `${ASSETS_DIR}${slug}/`;
      /** @type {Array<[string, string]>} */
      const out = [];
      for (const [p, id] of tree) if (p.startsWith(prefix)) out.push([p.slice(prefix.length), id]);
      return out;
    },
  });
}

/* ------------------------------------------------------------------------------------------------ pages */

/** Collections: copy namespace, data module, slug list, fields a listing card shows. */
const COLLECTIONS = {
  services: { ns: "services", data: "src/data/services.ts", list: "SERVICE_SLUGS", card: ["title", "summary"] },
  industries: { ns: "industries", data: "src/data/industries.ts", list: "INDUSTRY_SLUGS", card: ["title", "summary"] },
  projects: { ns: "projects", data: "src/data/projects.ts", list: "PROJECT_SLUGS", card: ["cardTitle", "client", "summary"] },
};
/** @typedef {keyof typeof COLLECTIONS} Collection */
/** Single-namespace pages: path segment → namespace. */
const SINGLE = { about: "about", contact: "contact", "foreign-manufacturers": "foreign", privacy: "privacy" };

/**
 * @param {any} obj
 * @param {string[]} fields
 */
const pick = (obj, fields) => (obj && typeof obj === "object" ? Object.fromEntries(fields.map((f) => [f, obj[f]])) : undefined);

/**
 * Card fields of every listed item of a collection: { slug: { field: … } } (slugs = the data list that have copy).
 * @param {Reader} r
 * @param {string} locale
 * @param {Collection} key
 */
function cards(r, locale, key) {
  const c = COLLECTIONS[key];
  const items = r.json(MSG(locale, c.ns))?.items;
  if (!items || typeof items !== "object") return undefined;
  const listed = constList(r.text(c.data), c.list);
  const slugs = (listed.length ? listed : Object.keys(items)).filter((s) => Object.hasOwn(items, s));
  return Object.fromEntries(slugs.map((s) => [s, pick(items[s], c.card)]));
}

/**
 * Candidate pages (locale-prefixed paths) from the config and the data modules' slug lists.
 * @param {Reader} r
 * @returns {string[]}
 */
function pageList(r) {
  const locales = constList(r.text("src/i18n/config.ts"), "LOCALES");
  const out = [];
  for (const l of locales) {
    out.push(`/${l}/`);
    for (const [key, c] of Object.entries(COLLECTIONS)) {
      out.push(`/${l}/${key}/`);
      for (const s of constList(r.text(c.data), c.list)) out.push(`/${l}/${key}/${s}/`);
    }
    for (const p of ["about", "contact", "technologies", "foreign-manufacturers", "privacy"]) out.push(`/${l}/${p}/`);
  }
  return out;
}

/**
 * What a page's hash covers (see the header), or undefined when the page is absent in this tree.
 * @param {Reader} r
 * @param {string} path locale-prefixed, with slashes: "/en/projects/milk-pasteurizer/"
 * @returns {object | undefined}
 */
function pageParts(r, path) {
  const m = /^\/([^/]+)\/(?:([^/]+)\/(?:([^/]+)\/)?)?$/.exec(path);
  if (!m) return undefined;
  const [, l, section, slug] = m;
  const json = (/** @type {string} */ ns) => r.json(MSG(l, ns));
  if (!section) {
    const home = json("home");
    if (home === undefined) return undefined;
    const projects = json("projects")?.items;
    const featured = constList(r.text(COLLECTIONS.projects.data), "FEATURED_PROJECT_SLUGS");
    return {
      page: "home",
      copy: home,
      services: cards(r, l, "services"),
      industries: cards(r, l, "industries"),
      featured: featured.map((s) => ({ slug: s, ...pick(projects?.[s], COLLECTIONS.projects.card) })),
    };
  }
  if (Object.hasOwn(COLLECTIONS, section)) {
    const key = /** @type {Collection} */ (section);
    const c = COLLECTIONS[key];
    const copy = json(c.ns);
    if (!slug) return copy?.index === undefined ? undefined : { page: `${key}/`, index: copy.index, cards: cards(r, l, key) };
    const item = copy?.items?.[slug];
    const data = r.literal(c.data, slug);
    if (item === undefined || data === undefined) return undefined;
    return { page: `${key}/*`, copy: item, data, assets: key === "projects" ? r.assets(slug) : undefined };
  }
  if (slug) return undefined;
  if (section === "technologies") {
    const copy = json("technologies");
    return copy === undefined ? undefined : { page: "technologies", copy, tech: json("tech"), data: r.code("src/data/technologies.ts") };
  }
  const ns = /** @type {Record<string, string>} */ (SINGLE)[section];
  const copy = ns ? json(ns) : undefined;
  return copy === undefined ? undefined : { page: section, copy };
}

/**
 * @param {Reader} r
 * @param {string} path
 */
const pageHash = (r, path) => {
  const parts = pageParts(r, path);
  return parts === undefined ? undefined : contentHash(parts);
};

/**
 * Current hash of every page present in this tree.
 * @param {Reader} r
 * @param {string[]} [paths]
 */
function pageHashes(r, paths = pageList(r)) {
  /** @type {Map<string, string>} */
  const out = new Map();
  for (const p of paths) {
    const h = pageHash(r, p);
    if (h !== undefined) out.set(p, h);
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------ build-time API */

/** Repo root: this file's parent directory when run from source, else the nearest cwd ancestor with the i18n config. */
function findRoot() {
  /** @type {string[]} */
  const candidates = [];
  try {
    candidates.push(dirname(dirname(fileURLToPath(import.meta.url))));
  } catch {}
  for (let d = process.cwd(); ; d = dirname(d)) {
    candidates.push(d);
    if (dirname(d) === d) break;
  }
  return candidates.find((d) => existsSync(join(d, "src/i18n/config.ts"))) ?? process.cwd();
}

/**
 * @param {string} root
 * @returns {Stored}
 */
function readStored(root) {
  const file = join(root, DATES_FILE);
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`content-dates: ${DATES_FILE} is not valid JSON (${/** @type {Error} */ (e).message}) — resolve it or run "node scripts/content-dates.mjs --bootstrap"`, { cause: e });
  }
}

/** @param {Context} ctx */
const staleCount = (ctx) => [...ctx.hashes].filter(([p, h]) => ctx.stored[p]?.hash !== h).length;

/** @param {Context} ctx */
function warnOnce(ctx) {
  if (state.warned) return;
  state.warned = true;
  console.warn(`content-dates: ${staleCount(ctx)} page(s) changed since ${DATES_FILE} was written — run "node scripts/content-dates.mjs --write" and commit it`);
}

/**
 * The process-wide context for the working tree (file + current hashes read once).
 * @returns {Context}
 */
function defaultContext() {
  const root = findRoot();
  let ctx = state.contexts.get(root);
  if (!ctx) {
    ctx = { stored: readStored(root), hashes: pageHashes(workingTreeReader(root)), now: state.now, onStale: warnOnce };
    state.contexts.set(root, ctx);
  }
  return ctx;
}

/**
 * "/en/x/", "en/x", "https://logic-controls.com/en/x/?q#h" → "/en/x/".
 * @param {string} input
 */
function pagePath(input) {
  let p;
  try {
    p = new URL(input, "https://x.invalid").pathname;
  } catch {
    return undefined;
  }
  try {
    p = decodeURI(p);
  } catch {}
  return p.endsWith("/") ? p : `${p}/`;
}

/**
 * Publication dates of a page: { published, modified } as ISO 8601 strings, or {} for a path that is not a content
 * page (e.g. "/en/contact/thanks/"). See the header for the stale-file fallback.
 * @param {string} path locale-prefixed path ("/en/projects/milk-pasteurizer/") or absolute URL
 * @param {Context} [ctx] defaults to the working tree + src/data/content-dates.json (tests pass their own)
 * @returns {{ published?: string, modified?: string }}
 */
export function pageDates(path, ctx = defaultContext()) {
  const key = pagePath(path);
  const hash = key && ctx.hashes.get(key);
  if (!key || !hash) return {};
  const s = ctx.stored[key];
  if (s && s.hash === hash) return { published: s.published, modified: s.modified };
  ctx.onStale?.(ctx);
  return { published: s?.published ?? ctx.now, modified: ctx.now };
}

/**
 * Sitemap <lastmod> for an absolute page URL ("https://logic-controls.com/ar/services/control-panels/"), or undefined.
 * @param {string} url
 * @param {Context} [ctx]
 * @returns {string | undefined}
 */
export function lastModFor(url, ctx) {
  return pageDates(url, ctx).modified;
}

/* ------------------------------------------------------------------------------------------------ file maintenance */

/**
 * The --write merge: unchanged hash keeps its dates, changed → modified = now, new → published = modified = now,
 * pages that no longer exist are dropped.
 * @param {Stored} stored
 * @param {Map<string, string>} hashes
 * @param {string} now
 */
function mergeStored(stored, hashes, now) {
  /** @type {Stored} */
  const next = {};
  /** @type {string[]} */
  const unchanged = [];
  /** @type {string[]} */
  const changed = [];
  /** @type {string[]} */
  const added = [];
  for (const [p, hash] of hashes) {
    const s = stored[p];
    if (!s) {
      added.push(p);
      next[p] = { hash, modified: now, published: now };
    } else if (s.hash === hash) {
      unchanged.push(p);
      next[p] = { hash, modified: s.modified, published: s.published };
    } else {
      changed.push(p);
      next[p] = { hash, modified: now, published: s.published ?? now };
    }
  }
  const removed = Object.keys(stored).filter((p) => !hashes.has(p));
  return { next, unchanged, changed, added, removed };
}

/**
 * Dates from a walk over history, oldest commit first, then the working tree.
 * @param {Array<{ date: string, reader: Reader }>} commits
 * @param {Map<string, string>} current working-tree hashes (the pages to date)
 * @param {string} now
 * @returns {{ next: Stored, dirty: string[] }} dirty = pages whose working-tree content differs from HEAD's
 */
function historyDates(commits, current, now) {
  /** @type {Map<string, { published: string, modified: string, hash: string | undefined }>} */
  const track = new Map();
  for (const { date, reader } of commits) {
    for (const p of current.keys()) {
      const h = pageHash(reader, p);
      const t = track.get(p);
      if (h === undefined) {
        if (t) t.hash = undefined;
      } else if (!t) track.set(p, { published: date, modified: date, hash: h });
      else if (t.hash !== h) {
        t.modified = date;
        t.hash = h;
      }
    }
  }
  /** @type {Stored} */
  const next = {};
  const dirty = [];
  for (const [p, hash] of current) {
    const t = track.get(p);
    if (t?.hash === hash) next[p] = { hash, modified: t.modified, published: t.published };
    else {
      dirty.push(p);
      next[p] = { hash, modified: now, published: t?.published ?? now };
    }
  }
  return { next, dirty };
}

/**
 * The file's text: paths sorted, entries as { hash, modified, published }, 2-space indent, trailing newline.
 * @param {Stored} stored
 */
function serialize(stored) {
  const sorted = Object.fromEntries(
    Object.keys(stored)
      .sort()
      .map((p) => [p, { hash: stored[p].hash, modified: stored[p].modified, published: stored[p].published }]),
  );
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

/**
 * @param {string} root
 * @param {Stored} stored
 * @returns {boolean} whether the file changed
 */
function save(root, stored) {
  const file = join(root, DATES_FILE);
  const text = serialize(stored);
  if (existsSync(file) && readFileSync(file, "utf8") === text) return false;
  writeFileSync(file, text);
  return true;
}

/**
 * @param {string} root
 * @param {string[]} args
 * @param {string} [input]
 */
const gitIn = (root, args, input) =>
  execFileSync("git", args, { cwd: root, input, maxBuffer: 1 << 30, stdio: ["pipe", "pipe", "pipe"] });

/**
 * Blob contents for `ids`, from one `git cat-file --batch` process.
 * @param {string} root
 * @param {string[]} ids
 */
function catBlobs(root, ids) {
  /** @type {Map<string, string>} */
  const blobs = new Map();
  if (!ids.length) return blobs;
  const out = gitIn(root, ["cat-file", "--batch"], `${ids.join("\n")}\n`);
  let pos = 0;
  while (pos < out.length) {
    const nl = out.indexOf(10, pos);
    if (nl < 0) break;
    const [id, type, size] = out.toString("utf8", pos, nl).split(" ");
    if (type === "missing" || size === undefined) {
      pos = nl + 1;
      continue;
    }
    const end = nl + 1 + Number(size);
    blobs.set(id, out.toString("utf8", nl + 1, end));
    pos = end + 1;
  }
  return blobs;
}

/**
 * Rebuild every page's dates from git history (see the header).
 * @param {string} root
 * @param {string} now
 */
function bootstrap(root, now) {
  let shallow;
  try {
    shallow = gitIn(root, ["rev-parse", "--is-shallow-repository"]).toString().trim();
  } catch (e) {
    throw new Error(`content-dates: --bootstrap needs git history, and ${root} is not a git checkout (${/** @type {Error} */ (e).message.split("\n")[0]})`, { cause: e });
  }
  if (shallow === "true")
    throw new Error("content-dates: this clone is shallow, so the history (and every date) would be wrong — run `git fetch --unshallow` first");
  const current = pageHashes(workingTreeReader(root));
  /** @type {Array<{ sha: string, date: string }>} */
  const log = [];
  const lines = gitIn(root, ["rev-list", "--reverse", "--format=%cI", "HEAD"]).toString().split("\n");
  for (let i = 0; i + 1 < lines.length; i += 2) if (lines[i].startsWith("commit ")) log.push({ sha: lines[i].slice(7), date: lines[i + 1].trim() });
  const trees = log.map(({ sha }) => {
    /** @type {Map<string, string>} */
    const tree = new Map();
    const out = gitIn(root, ["ls-tree", "-r", "-z", "--full-tree", sha, "--", "src/i18n/", "src/data/", ASSETS_DIR]).toString();
    for (const rec of out.split("\0")) {
      const m = /^(\d+) (\w+) ([0-9a-f]+)\t(.*)$/s.exec(rec);
      if (m && m[2] === "blob" && m[1] !== "120000") tree.set(m[4], m[3]);
    }
    return tree;
  });
  const needed = new Set();
  for (const t of trees) for (const [p, id] of t) if (!p.startsWith(ASSETS_DIR)) needed.add(id);
  const blobs = catBlobs(root, [...needed]);
  const commits = log.map((c, i) => ({ date: c.date, reader: commitReader(trees[i], blobs) }));
  return { ...historyDates(commits, current, now), commits: log.length, head: log.at(-1)?.sha };
}

/* ------------------------------------------------------------------------------------------------ CLI */

/** @param {string[]} args */
function main(args) {
  const t0 = performance.now();
  const took = () => `${((performance.now() - t0) / 1000).toFixed(2)} s`;
  const root = findRoot();
  const now = state.now;
  const list = (/** @type {string} */ label, /** @type {string[]} */ paths, out = console.log) => paths.forEach((p) => out(`  ${label.padEnd(8)} ${p}`));
  if (args.includes("--check")) {
    if (!existsSync(join(root, DATES_FILE))) {
      console.error(`content-dates: ${DATES_FILE} does not exist — run "node scripts/content-dates.mjs --write" and commit it`);
      return 1;
    }
    const stored = readStored(root);
    const { changed, added, removed } = mergeStored(stored, pageHashes(workingTreeReader(root)), now);
    const n = changed.length + added.length + removed.length;
    if (!n) {
      console.log(`content-dates: ${DATES_FILE} is current (${Object.keys(stored).length} pages, ${took()})`);
      return 0;
    }
    console.error(`content-dates: ${DATES_FILE} is out of date (${n} page(s)):`);
    list("changed", changed, console.error);
    list("missing", added, console.error);
    list("extra", removed, console.error);
    console.error(`run "node scripts/content-dates.mjs --write" and commit it`);
    return 1;
  }
  if (args.includes("--bootstrap") || (args.includes("--write") && !existsSync(join(root, DATES_FILE)))) {
    if (!args.includes("--bootstrap")) console.log(`content-dates: no ${DATES_FILE} yet, bootstrapping from git history`);
    const { next, dirty, commits, head } = bootstrap(root, now);
    const wrote = save(root, next);
    console.log(
      `content-dates: ${Object.keys(next).length} pages dated from ${commits} commits (HEAD ${head?.slice(0, 7)}), ` +
        `${new Set(Object.values(next).map((e) => e.modified)).size} distinct modified dates, ${took()}`,
    );
    if (dirty.length) {
      console.log(`  ${dirty.length} page(s) differ from HEAD in the working tree (or are new) → modified = ${now}:`);
      list("now", dirty);
    }
    console.log(wrote ? `  wrote ${DATES_FILE}` : `  ${DATES_FILE} unchanged`);
    return 0;
  }
  if (args.includes("--write")) {
    const { next, unchanged, changed, added, removed } = mergeStored(readStored(root), pageHashes(workingTreeReader(root)), now);
    const wrote = save(root, next);
    console.log(
      `content-dates: ${unchanged.length} unchanged, ${changed.length} changed, ${added.length} new, ${removed.length} removed (${took()})` +
        (wrote ? ` → wrote ${DATES_FILE}` : ""),
    );
    list("changed", changed);
    list("new", added);
    list("removed", removed);
    return 0;
  }
  console.error("usage: node scripts/content-dates.mjs --write | --check | --bootstrap");
  return 2;
}

/** True when this file is the process entry point (not when imported by astro.config.mjs, src/lib/jsonld.ts or tests). */
function isMain() {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href || import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
}

/** Internals, exported for tests (tests/unit/content-dates.test.ts). Not an API. */
export const _internal = {
  isoLocal,
  canonicalJson,
  contentHash,
  blobSha,
  segments,
  extractObjectLiteral,
  normalizeCode,
  constList,
  memoryReader,
  workingTreeReader,
  pageList,
  pageParts,
  pageHashes,
  pagePath,
  mergeStored,
  historyDates,
  serialize,
  staleCount,
};

/* ------------------------------------------------------------------------------------------------ deprecated (git) */

const git = (/** @type {string[]} */ args) =>
  execFileSync("git", args, { cwd: process.cwd(), encoding: "utf8", maxBuffer: 64e6, stdio: ["ignore", "pipe", "ignore"] });

/** @type {Map<string, string> | null | undefined} file → ISO date of the newest commit that touched it */
let newest;
function history() {
  if (newest !== undefined) return newest;
  try {
    if (git(["rev-parse", "--is-shallow-repository"]).trim() === "true") return (newest = null);
    const out = git(["log", "--format=%x00%cI", "--name-only", "--no-renames"]);
    newest = new Map();
    let date = "";
    for (const line of out.split("\n")) {
      if (line.startsWith("\0")) date = line.slice(1);
      else if (line && date && !newest.has(line)) newest.set(line, date);
    }
  } catch {
    newest = null;
  }
  return newest;
}

/**
 * Newest commit date (ISO 8601) among `files` (repo-relative paths; a path ending in "/" matches everything under it).
 * @deprecated Whole-file git dates are too coarse (CS2-04). Use pageDates(path).modified.
 * @param {string[]} files
 * @returns {string | undefined}
 */
export function lastModified(files) {
  const h = history();
  if (!h) return undefined;
  let best;
  for (const f of files) {
    if (f.endsWith("/")) {
      for (const [k, d] of h) if (k.startsWith(f) && (!best || Date.parse(d) > Date.parse(best))) best = d;
    } else {
      const d = h.get(f);
      if (d && (!best || Date.parse(d) > Date.parse(best))) best = d;
    }
  }
  return best;
}

const firstCache = new Map();
/**
 * Date of the first commit whose diff added `needle` to `file` (git pickaxe), e.g. a project's `slug: "…"` line.
 * @deprecated Needs full git history at build time. Use pageDates(path).published.
 * @param {string} file
 * @param {string} needle
 * @returns {string | undefined}
 */
export function firstCommitted(file, needle) {
  const key = `${file}\0${needle}`;
  if (firstCache.has(key)) return firstCache.get(key);
  let d;
  if (history()) {
    try {
      d = git(["log", "--format=%cI", "--reverse", `-S${needle}`, "--", file]).split("\n")[0]?.trim() || undefined;
    } catch {
      d = undefined;
    }
  }
  firstCache.set(key, d);
  return d;
}

// Last, so every module-level binding above is initialized before the CLI runs.
if (isMain()) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(/** @type {Error} */ (e).message);
    process.exitCode = 1;
  }
}
