// Content dates from git history, computed once per build (no network, no generated files):
//  - lastModFor(url): sitemap <lastmod> — newest commit date among the files that make up that page's content
//    (its template, its message namespace in that locale, its data module). Shared layout/component edits do not
//    count: search engines want "the content changed", not "the site was rebuilt".
//  - firstCommitted(file, needle) / lastModified(files): case-study datePublished / dateModified (JSON-LD).
// When git is unavailable or the clone is shallow (dates would be wrong), every function returns undefined and the
// caller omits the field — never a guessed date.
import { execFileSync } from "node:child_process";

const git = (args) => execFileSync("git", args, { cwd: process.cwd(), encoding: "utf8", maxBuffer: 64e6, stdio: ["ignore", "pipe", "ignore"] });

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

const M = (locale, ns) => `src/i18n/messages/${locale}/${ns}.json`;
const P = "src/pages/[lang]/";
/** Locale-less page path → its content sources. "*" = any slug. */
const SOURCES = {
  "": (l) => [`${P}index.astro`, M(l, "home"), "src/data/projects.ts"],
  services: (l) => [`${P}services/index.astro`, M(l, "services"), "src/data/services.ts"],
  "services/*": (l) => [`${P}services/[slug].astro`, M(l, "services"), "src/data/services.ts"],
  industries: (l) => [`${P}industries/index.astro`, M(l, "industries"), "src/data/industries.ts"],
  "industries/*": (l) => [`${P}industries/[slug].astro`, M(l, "industries"), "src/data/industries.ts"],
  projects: (l) => [`${P}projects/index.astro`, M(l, "projects"), "src/data/projects.ts"],
  "projects/*": (l, slug) => [`${P}projects/[slug].astro`, M(l, "projects"), "src/data/projects.ts", `src/assets/projects/${slug}/`],
  about: (l) => [`${P}about.astro`, M(l, "about")],
  contact: (l) => [`${P}contact/index.astro`, M(l, "contact")],
  technologies: (l) => [`${P}technologies.astro`, M(l, "technologies"), M(l, "tech"), "src/data/technologies.ts"],
  "foreign-manufacturers": (l) => [`${P}foreign-manufacturers.astro`, M(l, "foreign")],
  privacy: (l) => [`${P}privacy.astro`, M(l, "privacy")],
};

/**
 * Sitemap lastmod for an absolute page URL ("https://logic-controls.com/ar/services/control-panels/").
 * @param {string} url
 * @returns {string | undefined}
 */
export function lastModFor(url) {
  const [locale, ...rest] = new URL(url).pathname.split("/").filter(Boolean);
  if (!locale) return undefined;
  const path = rest.join("/");
  const src = SOURCES[path] ?? (rest.length === 2 ? SOURCES[`${rest[0]}/*`] : undefined);
  return src ? lastModified(src(locale, rest[1])) : undefined;
}
