/**
 * Open Graph / Twitter cards: one branded 1200×630 card per page and locale, generated at build time.
 *
 * This module is the registry (which pages have a card, what it says, where it lives) and is safe to import from any
 * page or component (no image code). The pixels are drawn by src/lib/og-render.ts, served by the static endpoints
 * src/pages/og/[...slug].png.ts (flat cards) and src/pages/og/[...slug].jpg.ts (case studies, which carry a photo):
 *   /og/<locale>/home.png, /og/<locale>/services/<slug>.png, /og/<locale>/projects/<slug>.jpg, /og/<locale>/default.png …
 *
 * Card text comes from the same messages as the page's H1 (case studies use the shorter `cardTitle`), the eyebrow from
 * the breadcrumb labels, the chip line from the project's technologies (localized with techLabel) or the company
 * address line. The default card (pages without their own: thanks, lab, styleguide, 404) shows the logo and the
 * localized company tagline. Fonts: src/assets/fonts/og/ (build-only; regeneration command in build.py there).
 */
import type { ImageMetadata } from "astro";
import { getMessages, type Locale, LOCALES } from "~/i18n";
import { SITE } from "~/data/site";
import { SERVICE_SLUGS } from "~/data/services";
import { INDUSTRY_SLUGS } from "~/data/industries";
import { PROJECT_SLUGS, getProject } from "~/data/projects";
import { cleanText, techLabel } from "~/lib/text";

export interface OgCard {
  url: string;
  alt: string;
  width: 1200;
  height: 630;
  type: "image/png" | "image/jpeg";
}

/** Everything og-render.ts needs to draw one card. */
export interface OgSpec {
  locale: Locale;
  /** Locale-less page path ("" = home, "default" = the per-locale fallback card). */
  path: string;
  kind: "page" | "photo" | "default";
  title: string;
  eyebrow?: string;
  /** One line under the title (platforms of a case study, the company address…). */
  chips?: string[];
  photo?: ImageMetadata;
  alt: string;
}

/* ------------------------------------------------------------------ text helpers */

const altFor = (title: string) => {
  const t = cleanText(title);
  return t.includes(SITE.name) ? t : `${t} · ${SITE.name}`;
};

/* ------------------------------------------------------------------ registry */

type Items<T> = Record<string, T | undefined>;
interface PageItem {
  h1: string;
  title: string;
}
interface ProjectItem {
  cardTitle: string;
}

function specsFor(locale: Locale): OgSpec[] {
  const t = getMessages(locale);
  const crumbs = t.common.breadcrumbs as Record<string, string>;
  const company = t.common.company as { tagline: string; addressLine: string };
  const address = [company.addressLine];
  const page = (path: string, title: string, eyebrow?: string, chips: string[] | undefined = address): OgSpec => ({
    locale,
    path,
    kind: "page",
    title,
    eyebrow,
    chips,
    alt: altFor(title),
  });

  const services = t.services.items as Items<PageItem>;
  const industries = t.industries.items as Items<PageItem>;
  const projects = t.projects.items as Items<ProjectItem>;

  const list: OgSpec[] = [
    page("", t.home.hero.title),
    page("about", t.about.h1, crumbs.about),
    page("contact", t.contact.h1, crumbs.contact),
    page("technologies", t.technologies.h1, crumbs.technologies),
    page("foreign-manufacturers", t.foreign.hero.title, t.ui.nav.foreign),
    page("privacy", t.privacy.h1, crumbs.privacy, undefined),
    page("services", t.services.index.h1, crumbs.services),
    page("industries", t.industries.index.h1, crumbs.industries),
    page("projects", t.projects.index.h1, crumbs.projects),
  ];
  for (const s of SERVICE_SLUGS) {
    const item = services[s];
    if (item) list.push(page(`services/${s}`, item.h1, crumbs.services));
  }
  for (const s of INDUSTRY_SLUGS) {
    const item = industries[s];
    if (item) list.push(page(`industries/${s}`, item.h1, crumbs.industries));
  }
  for (const s of PROJECT_SLUGS) {
    const item = projects[s];
    const p = getProject(s);
    if (!item || !p) continue;
    list.push({
      locale,
      path: `projects/${s}`,
      kind: "photo",
      title: item.cardTitle,
      eyebrow: `${crumbs.projects} · ${p.year}`,
      chips: p.technologies.map((x) => techLabel(locale, x)),
      photo: p.cover.image,
      alt: altFor(item.cardTitle),
    });
  }
  list.push({
    locale,
    path: "default",
    kind: "default",
    title: company.tagline,
    alt: cleanText(t.seo.ogImageAlt),
  });
  return list;
}

let registry: Map<string, OgSpec> | undefined;
const key = (locale: Locale, path: string) => `${locale}/${path.replace(/^\/+|\/+$/g, "")}`;

/** All cards, keyed "<locale>/<path>" (home = "<locale>/"). */
export function ogSpecs(): Map<string, OgSpec> {
  registry ??= new Map(LOCALES.flatMap((l) => specsFor(l).map((s) => [key(l, s.path), s] as const)));
  return registry;
}

/** File slug of a card under /og/: "en/home", "ar/services/control-panels", "zh/default". */
export const ogSlug = (spec: Pick<OgSpec, "locale" | "path">) => `${spec.locale}/${spec.path || "home"}`;
export const ogExt = (spec: Pick<OgSpec, "kind">) => (spec.kind === "photo" ? "jpg" : "png");

function toCard(spec: OgSpec): OgCard {
  const ext = ogExt(spec);
  return { url: `/og/${ogSlug(spec)}.${ext}`, alt: spec.alt, width: 1200, height: 630, type: ext === "jpg" ? "image/jpeg" : "image/png" };
}

/** Card for a page (path = locale-less, "" for home, "services/control-panels", "projects/<slug>"); undefined if none. */
export function ogCard(locale: Locale, path: string): OgCard | undefined {
  const clean = path.replace(/^\/+|\/+$/g, "");
  if (clean === "default") return undefined;
  const spec = ogSpecs().get(key(locale, clean));
  return spec ? toCard(spec) : undefined;
}

/** Per-locale default card (logo + localized tagline) for pages without their own (thanks, lab, styleguide, 404). */
export function ogDefault(locale: Locale): OgCard {
  return toCard(ogSpecs().get(key(locale, "default"))!);
}
