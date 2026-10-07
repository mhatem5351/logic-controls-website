/**
 * PLC / HMI platforms (src/data/technologies.ts → BRANDS) per case study, derived from projects.ts `technologies`
 * (the same brand-name match as catalog.ts brandsIn()). Drives the "By platform" filter on /projects/ (?platform=),
 * the "case studies on <brand>" links on /technologies/ (#<brand-slug> anchors) and the platform links in a case
 * study's facts table. Nothing is hard-coded: a new project or brand flows through.
 */
import { BRANDS, type BrandData, type BrandSlug } from "~/data/technologies";
import type { ProjectData } from "~/data/projects";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MATCH = BRANDS.map((b) => ({ brand: b, re: new RegExp(`(^|[^\\p{L}])${escape(b.name)}(?![\\p{L}])`, "iu") }));

/** The platform brands a text mentions, in BRANDS order. */
export const brandsInText = (text: string): BrandData[] => MATCH.filter((m) => m.re.test(text)).map((m) => m.brand);

/** The first platform brand a text mentions (by position in the text), if any. */
export function firstBrandIn(text: string): BrandData | undefined {
  let best: { brand: BrandData; at: number } | undefined;
  for (const { brand, re } of MATCH) {
    const m = re.exec(text);
    if (m && (!best || m.index < best.at)) best = { brand, at: m.index };
  }
  return best?.brand;
}

/**
 * Only control-platform entries count (PLC, HMI, SCADA, drives). Passive parts that merely sit in a panel — circuit
 * breakers, power supplies, contactors — must not make a case study "a <brand> project": that would claim platform
 * work the company did not do (e.g. Schneider C60N breakers in a Wecon PLC/HMI job).
 */
const CONTROL_PLATFORM = /\b(PLC|HMI|SCADA|WinCC|VFD|drives?|servo|I\/O|expansion)\b/i;

/** Platform slugs of a project (its control-platform technologies name the brand). */
export const platformsOf = (p: Pick<ProjectData, "technologies">): BrandSlug[] =>
  brandsInText(p.technologies.filter((t) => CONTROL_PLATFORM.test(t)).join(" | ")).map((b) => b.slug);

/** Projects (in the given order) that use a platform. */
export const projectsOnPlatform = <T extends Pick<ProjectData, "technologies">>(slug: BrandSlug, list: readonly T[]): T[] =>
  list.filter((p) => platformsOf(p).includes(slug));
