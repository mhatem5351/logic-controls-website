/**
 * Shared helpers for the catalog pages (services, industries, projects).
 * Everything here is derived from src/data/* so new services, industries or projects flow through
 * without page edits (no hard-coded counts or option lists).
 */
import { getMessages, localePath, type Locale } from "~/i18n";
import { SITE } from "~/data/site";
import { SERVICES, SERVICE_SLUGS, type ServiceSlug } from "~/data/services";
import { INDUSTRY_SLUGS, type IndustrySlug } from "~/data/industries";
import { projectsSorted, type ProjectData, type ProjectImage, type ProjectSlug } from "~/data/projects";
import type { IconName } from "~/components/Icon.astro";
import type enServices from "~/i18n/messages/en/services.json";
import type enIndustries from "~/i18n/messages/en/industries.json";
import type enProjects from "~/i18n/messages/en/projects.json";
import { BRANDS, type BrandSlug } from "~/data/technologies";
import { fmt } from "~/components/nav";
import { contactCta } from "~/components/contact-cta";
import { brandsInText, projectsOnPlatform } from "./platforms";

/* ------------------------------------------------------------------ icons (data suggests Lucide names; map to our set) */

const SERVICE_ICON: Record<ServiceSlug, IconName> = {
  "control-panels": "panel",
  "plc-hmi-programming": "plc",
  "machine-automation": "gear",
  "machine-retrofits": "layers",
  "process-control": "thermometer",
  "scada-data-logging": "hmi",
  "testing-commissioning": "gauge",
  "maintenance-support": "wrench",
};
const INDUSTRY_ICON: Record<IndustrySlug, IconName> = {
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
  /** What the case-study video shows, in words (text alternative under the player). */
  videoDescription?: string;
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

/* ------------------------------------------------------------------ proof links (CS3-03) */

/**
 * Our scope included the control system itself (the panel or the PLC / HMI program), not only testing and
 * commissioning of someone else's: the stronger proof that we automate that kind of machine or platform.
 */
const builtControls = (p: ProjectData) => p.services.includes("plc-hmi-programming") || p.services.includes("control-panels");
/** An earlier tile / row already links this project: it drops below any alternative of the same relevance tier. */
const REPEAT_PENALTY = 3;

/**
 * Up to `n` projects for each group (hub tiles, brand rows) in group order, highest score first. A project an earlier
 * group already shows loses REPEAT_PENALTY, so it is repeated only when no comparable alternative exists. Ties keep the
 * candidates' own order (newest first, then catalogue order; Array.prototype.sort is stable): deterministic.
 */
function pickProof<K extends string>(groups: readonly { key: K; candidates: ProjectData[]; score: (p: ProjectData) => number }[], n: number) {
  const shown = new Set<string>();
  const out = {} as Record<K, ProjectData[]>;
  for (const g of groups) {
    const rank = (p: ProjectData) => g.score(p) - (shown.has(p.slug) ? REPEAT_PENALTY : 0);
    out[g.key] = [...g.candidates].sort((a, b) => rank(b) - rank(a)).slice(0, n);
    out[g.key].forEach((p) => shown.add(p.slug));
  }
  return out;
}

/**
 * Case studies linked from each industry tile on /industries/ (relevance first, not newest first): a project whose
 * primary industry is the tile's (+4) before one only cross-tagged with it, a control system we built (+2) before a
 * commissioning-only job, no repeat across tiles when an alternative exists. Slugs in tile order (the hub's order).
 */
export function industryProof(locale: Locale, slugs: readonly IndustrySlug[], n = 2): Record<IndustrySlug, ProjectData[]> {
  return pickProof(
    slugs.map((s) => ({
      key: s,
      candidates: projectsFor(locale, projectsForIndustry(s)),
      score: (p: ProjectData) => (p.industries[0] === s ? 4 : 0) + (builtControls(p) ? 2 : 0),
    })),
    n,
  ) as Record<IndustrySlug, ProjectData[]>;
}

/** The brand's role in a project: its PLC (+3), SCADA (+2), HMI (+1); a drive only: 0 (the platform is someone else's). */
const ROLE_SCORE: Partial<Record<TechGroup, number>> = { plc: 3, scada: 2, hmi: 1 };
function platformRole(p: ProjectData, brand: BrandSlug): number {
  const groups = new Set(p.technologies.filter((t) => brandsInText(t).some((b) => b.slug === brand)).map(techGroup));
  return [...groups].reduce((sum, g) => sum + (ROLE_SCORE[g] ?? 0), 0);
}

/**
 * Case studies linked from each platform row on /technologies/ (relevance first): the brand's role in the project
 * (its PLC and SCADA before an HMI on another brand's PLC, before a drive), a control system we built (+2) before a
 * commissioning-only job, no repeat across rows when an alternative exists. Rows in BRANDS order (the page's order).
 */
export function platformProof(locale: Locale, n = 3): Record<BrandSlug, ProjectData[]> {
  const portfolio = projectsFor(locale);
  return pickProof(
    BRANDS.map((b) => ({
      key: b.slug,
      candidates: projectsOnPlatform(b.slug, portfolio),
      score: (p: ProjectData) => platformRole(p, b.slug) + (builtControls(p) ? 2 : 0),
    })),
    n,
  );
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
const TECH_GROUP_ORDER: TechGroup[] = ["plc", "hmi", "scada", "drives", "other"];

/** Classify a technology string from projects.ts ("Siemens WinCC Professional SCADA", "LS Electric M100 VFD"…). */
function techGroup(name: string): TechGroup {
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
export function quoteHref(locale: Locale, query?: Record<string, string | undefined>): string {
  /* Empty values are dropped: the form ignores them anyway, and the link stays short. */
  const params = new URLSearchParams(Object.entries(query ?? {}).filter((e): e is [string, string] => !!e[1]));
  const qs = params.size ? `?${params.toString()}` : "";
  return `${localePath(locale, "contact")}${qs}#quote`;
}

/**
 * Quote link from a case study (UX2-22): the form preselects the project's first service and industry and names the
 * case study above the form (`?project=`; rfq-form.ts reads it). Same rule as the chrome (contact-cta.ts pageContact).
 */
export function caseStudyQuoteHref(locale: Locale, p: Pick<ProjectData, "slug" | "services" | "industries">): string {
  return quoteHref(locale, { service: p.services[0], industry: p.industries[0], project: p.slug });
}

/** Secondary CTA: WhatsApp with a contextual message, or email on /zh/ (WhatsApp is blocked in mainland China). */
export function secondaryCta(locale: Locale, waMessage: string) {
  return contactCta(locale, { whatsapp: waMessage });
}
