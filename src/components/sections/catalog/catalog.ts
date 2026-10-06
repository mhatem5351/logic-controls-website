/**
 * Shared helpers for the catalog pages (services, industries, projects).
 * Everything here is derived from src/data/* so new services, industries or projects flow through
 * without page edits (no hard-coded counts or option lists).
 */
import type { ImageMetadata } from "astro";
import { getMessages, localePath, type Locale } from "~/i18n";
import { SITE, whatsappLink } from "~/data/site";
import { SERVICES, SERVICE_SLUGS, type ServiceSlug } from "~/data/services";
import { INDUSTRY_SLUGS, type IndustrySlug } from "~/data/industries";
import { PROJECTS, projectsSorted, type ProjectData, type ProjectImage, type ProjectSlug } from "~/data/projects";
import type { IconName } from "~/components/Icon.astro";
import type enServices from "~/i18n/messages/en/services.json";
import type enIndustries from "~/i18n/messages/en/industries.json";
import type enProjects from "~/i18n/messages/en/projects.json";
import { fmt, mailtoLink, prefersEmail } from "~/components/nav";
import { esc, html as renderHtml, plain } from "~/lib/text";

/* ------------------------------------------------------------------ text (rules live in src/lib/text.ts) */

export const escapeHtml = esc;

/**
 * Plain-text message → safe HTML for components that use set:html (titles, leads, FAQ answers): codes and brand
 * names never wrap inside, Latin runs are isolated on Arabic pages, Chinese breaks only between words.
 * Same as rich.ts html(), with the catalog pages' (text, locale) argument order.
 */
export const html = (text: string, locale: Locale): string => renderHtml(locale, text);

/**
 * For text-only props (breadcrumb labels, attributes): the plain-text equivalent of html() — no-break spaces and
 * word joiners inside codes/brand names, LRI…PDI isolates around Latin runs on Arabic pages.
 */
export const keepCodes = (text: string, locale?: Locale): string => plain(locale, text);

/* ------------------------------------------------------------------ icons (data suggests Lucide names; map to our set) */

export const SERVICE_ICON: Record<ServiceSlug, IconName> = {
  "control-panels": "panel",
  "plc-hmi-programming": "plc",
  "machine-automation": "gear",
  "machine-retrofits": "layers",
  "process-control": "thermometer",
  "scada-data-logging": "hmi",
  "testing-commissioning": "gauge",
  "maintenance-support": "wrench",
};
export const INDUSTRY_ICON: Record<IndustrySlug, IconName> = {
  "food-beverage": "bottle",
  pharmaceutical: "flask",
  "cosmetics-personal-care": "droplet",
  "packaging-labeling": "box",
  "building-materials": "factory",
  "commercial-laundry": "layers",
  "test-equipment": "gauge",
};
export const serviceIcon = (slug: string): IconName => SERVICE_ICON[slug as ServiceSlug] ?? "gear";
export const industryIcon = (slug: string): IconName => INDUSTRY_ICON[slug as IndustrySlug] ?? "factory";

/* ------------------------------------------------------------------ lookups (guarded: new slugs without copy never crash a page) */

export function serviceCopy(locale: Locale, slug: string): ServiceItem | undefined {
  const items = getMessages(locale).services.items as Record<string, ServiceItem>;
  return items[slug];
}
export function industryCopy(locale: Locale, slug: string): IndustryItem | undefined {
  const items = getMessages(locale).industries.items as Record<string, IndustryItem>;
  return items[slug];
}
export type ServiceItem = (typeof enServices)["items"]["control-panels"];
export type IndustryItem = (typeof enIndustries)["items"]["food-beverage"];
export type ProjectItem = Omit<(typeof enProjects)["items"]["pasteurizer-cip-recipes"], "imageAlts"> & {
  imageAlts: Record<string, string>;
  videoTitle?: string;
};
export function projectCopy(locale: Locale, slug: string): ProjectItem | undefined {
  return (getMessages(locale).projects.items as unknown as Record<string, ProjectItem>)[slug];
}

/** Services / industries in display order, only the ones that have copy in this locale. */
export const serviceSlugs = (locale: Locale) => SERVICE_SLUGS.filter((s) => serviceCopy(locale, s));
export const industrySlugs = (locale: Locale) => INDUSTRY_SLUGS.filter((s) => industryCopy(locale, s));

/** Projects sorted newest first, only those with copy in this locale. */
export const projectsFor = (locale: Locale, list: readonly ProjectData[] = projectsSorted()) => list.filter((p) => projectCopy(locale, p.slug));

/** Alt text for a project image (cover or gallery key). */
export function imageAlt(locale: Locale, slug: string, key: string): string {
  const alts = projectCopy(locale, slug)?.imageAlts ?? {};
  return alts[key] ?? projectCopy(locale, slug)?.cardTitle ?? "";
}

/** Cover first, then gallery, without duplicates. */
export function projectImages(p: ProjectData): ProjectImage[] {
  const seen = new Set<string>();
  return [p.cover, ...p.gallery].filter((img) => (seen.has(img.key) ? false : (seen.add(img.key), true)));
}

/** Services that a project lists, in the global display order. */
export const orderedServices = (list: readonly string[]) => [...list].sort((a, b) => SERVICE_SLUGS.indexOf(a as ServiceSlug) - SERVICE_SLUGS.indexOf(b as ServiceSlug));

/* ------------------------------------------------------------------ related content */

/** Featured projects for a service first, then every other project that lists the service (newest first). */
export function projectsForService(slug: ServiceSlug): ProjectData[] {
  const featured = SERVICES.find((s) => s.slug === slug)?.featuredProjects ?? [];
  const byService = projectsSorted().filter((p) => p.services.includes(slug));
  const first = featured.map((f) => byService.find((p) => p.slug === f)).filter((p): p is ProjectData => !!p);
  return [...first, ...byService.filter((p) => !featured.includes(p.slug as ProjectSlug))];
}
export const projectsForIndustry = (slug: IndustrySlug) => projectsSorted().filter((p) => p.industries.includes(slug));

/** How many projects mention each industry / service (drives filter options and counts). */
export function countBy(key: "industries" | "services"): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of PROJECTS) for (const v of p[key]) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}

export function countLabel(locale: Locale, count: number): string {
  const t = getMessages(locale);
  const one = (t.projects as { labels?: { countOne?: string } }).labels?.countOne;
  return fmt(count === 1 && one ? one : t.common.filters.count, { count });
}

/**
 * Was the project delivered by the team before the company was established? (common.notes.preFounding)
 * Uses a `preFounding` boolean if the data ever provides one; otherwise the marker the copy agent left in the
 * internal `yearEvidence` ("before the company was founded"). Only read for logic, never rendered.
 */
export const isPreFounding = (p: Pick<ProjectData, "yearEvidence">) => {
  const flag = (p as { preFounding?: boolean }).preFounding;
  return typeof flag === "boolean" ? flag : /before the company was (founded|established)/i.test(p.yearEvidence);
};

/* ------------------------------------------------------------------ technologies */

export type TechGroup = "plc" | "hmi" | "scada" | "drives" | "other";
export const TECH_GROUP_ORDER: TechGroup[] = ["plc", "hmi", "scada", "drives", "other"];

/** Classify a technology string from projects.ts ("Siemens WinCC Professional SCADA", "LS Electric M100 VFD"…). */
export function techGroup(name: string): TechGroup {
  if (/scada|wincc/i.test(name)) return "scada";
  if (/\bhmi\b|operator panel|touch ?screen/i.test(name)) return "hmi";
  if (/vfd|drive|inverter|altivar|servo|motion|stepper|yaskawa/i.test(name)) return "drives";
  if (/\bplc\b|s7-|expansion|\bdvp\b|lx3v|\bem\b|i\/o/i.test(name)) return "plc";
  return "other";
}
export function groupTechnologies(list: readonly string[]): { group: TechGroup; items: string[] }[] {
  return TECH_GROUP_ORDER.map((group) => ({ group, items: list.filter((n) => techGroup(n) === group) })).filter((g) => g.items.length);
}

/** Platform brands (SITE.brands) that appear in a set of projects' technologies, in SITE order. */
export function brandsIn(projects: readonly ProjectData[]): string[] {
  const all = projects.flatMap((p) => p.technologies).join(" | ").toLowerCase();
  return SITE.brands.filter((b) => all.includes(b.toLowerCase()));
}

/* ------------------------------------------------------------------ CTAs */

/** Contact page link that preselects the form (`?service=` / `?industry=`) and jumps to the form. */
export function quoteHref(locale: Locale, query?: Record<string, string>): string {
  const qs = query ? `?${new URLSearchParams(query).toString()}` : "";
  return `${localePath(locale, "contact")}${qs}#quote`;
}

/** Secondary CTA: WhatsApp with a contextual message, or email on /zh/ (WhatsApp is blocked in mainland China). */
export function secondaryCta(locale: Locale, waMessage: string) {
  const ui = getMessages(locale).ui;
  return prefersEmail(locale)
    ? { label: ui.cta.emailEngineer, href: mailtoLink(ui.email.subject) }
    : { label: ui.cta.whatsapp, href: whatsappLink(waMessage) };
}

/* ------------------------------------------------------------------ JSON-LD */

export const ORG_ID = `${SITE.url}/#organization`;
export const orgRef = () => ({
  "@type": "Organization",
  "@id": ORG_ID,
  name: SITE.name,
  url: SITE.url,
  telephone: SITE.phone.tel,
  email: SITE.email,
  address: {
    "@type": "PostalAddress",
    addressLocality: SITE.address.locality,
    addressRegion: SITE.address.region,
    addressCountry: SITE.address.country,
  },
});
export const absUrl = (path: string) => new URL(path, SITE.url).href;

export type { ImageMetadata };
