/**
 * Case-study facts table helpers (projects/[slug].astro).
 *
 * The facts table (projects.json → items[slug].facts) already states the PLC, HMI, SCADA and drives in words, so the
 * separate "Technologies used" block repeated it ("PLC | PLC", "Drives and motion | Motion control"). Technology
 * groups the facts do not cover are added to the same table instead; the block is shown only when a case study has no
 * facts. Facts arrays are parallel in every locale (same order, same meaning), so coverage is decided once on the
 * English labels and every locale renders the same cells.
 */
import { getMessages, localePath, type Locale } from "~/i18n";
import { groupTechnologies, projectCopy, type TechGroup } from "./catalog";
import { firstBrandIn } from "./platforms";

/** English facts labels that already state a technology group. */
const COVERED_BY: Record<TechGroup, RegExp> = {
  plc: /^(plc|controller)$/i,
  hmi: /^hmi$/i,
  scada: /^scada$/i,
  drives: /^(drives?|motion)$/i,
  other: /^(network|panel)$/i,
};
/** Words that name a category, not a product: a chip made only of these ("PLC", "Motion control") says nothing. */
const GENERIC = new Set("plc plcs hmi hmis scada vfd vfds motion control controller drive drives with and expansion module modules i o".split(" "));
export const isGenericTech = (s: string) =>
  s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .every((w) => GENERIC.has(w));

/** Technology groups worth showing: generic chips dropped, and (when `slug` has facts) groups the facts already state. */
export function techRows(slug: string, technologies: readonly string[]): { group: TechGroup; items: string[] }[] {
  const en = (projectCopy("en", slug) as { facts?: { label: string }[] } | undefined)?.facts ?? [];
  return groupTechnologies(technologies)
    .map((g) => ({ ...g, items: g.items.filter((s) => !isGenericTech(s)) }))
    .filter((g) => g.items.length > 0 && !en.some((f) => COVERED_BY[g.group].test(f.label.trim())));
}

export const techGroupLabel = (locale: Locale, group: TechGroup): string =>
  (getMessages(locale).projects.labels.techGroups as Partial<Record<TechGroup, string>>)[group] ?? group.toUpperCase();

/**
 * The technologies page section for a fact value that names a platform brand ("Wecon HMI with Arabic screens" →
 * /<l>/technologies/#wecon). Detected on the English value at the same index, so all locales link the same cells.
 */
export function factPlatformHref(locale: Locale, slug: string, index: number): string | undefined {
  const en = (projectCopy("en", slug) as { facts?: { value: string }[] } | undefined)?.facts?.[index]?.value;
  const brand = en ? firstBrandIn(en) : undefined;
  return brand ? `${localePath(locale, "technologies")}#${brand.slug}` : undefined;
}
