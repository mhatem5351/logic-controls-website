/**
 * How a case study's cover is presented (hero panel on ≥1024px, project cards).
 *
 * Some project images are screen captures exported from the HMI / SCADA (797×432, 800×480…), not photos. Stretched
 * edge to edge (object-cover) into the hero's tall media panel they were blown up 2–4× (giant pixels), and full-bleed
 * on a card they read as clip art next to the photos. They are shown as what they are: a screen in a device bezel, at
 * no more than their natural size. Photos too small to fill the hero panel at 1× are shown framed the same way
 * (a mounted print) instead of being upscaled.
 *
 * Kept here (not in projects.ts) because it describes presentation; a new screen capture only needs its key below.
 */
import type { ProjectData, ProjectImage, ProjectSlug } from "~/data/projects";

/** Image keys (projects.ts cover / gallery keys) that are screen captures, per project. Photos of a screen are not listed. */
export const SCREEN_GRABS: Partial<Record<ProjectSlug, readonly string[]>> = {
  "cheese-cooker-recipes": ["hmi"],
  "concrete-batching-plant-scada": ["scada"],
  "pipe-make-break-test-rig": ["hmi"],
  "milk-pasteurizer": ["hmi"],
  "olive-autoclave-sterilization": ["hmi"],
  "hotel-washer-extractor-control": ["hmi", "programEditor"],
  "shampoo-filling-delta-wecon": ["hmiArabic"],
};

export const isScreenGrab = (slug: string, key: string): boolean => !!SCREEN_GRABS[slug as ProjectSlug]?.includes(key);

/**
 * The page hero's media panel at its largest (Hero size="page": 44% of a 1920px viewport × the hero's height,
 * measured 845 × ~860 CSS px). A photo smaller than this would be upscaled by `object-cover` even on a 1× screen.
 */
export const HERO_PANEL = { width: 845, height: 860 } as const;

/** "cover": full-bleed photo (Hero default) · "screen": screen capture in an HMI bezel · "photo": small photo, framed. */
export type HeroTreatment = "cover" | "screen" | "photo";

export function heroTreatment(p: Pick<ProjectData, "slug" | "cover">): HeroTreatment {
  if (isScreenGrab(p.slug, p.cover.key)) return "screen";
  const { width, height } = p.cover.image;
  return width < HERO_PANEL.width || height < HERO_PANEL.height ? "photo" : "cover";
}

/** Card thumbnails: only screen captures are framed (every photo is large enough for a ≤ 470px card). */
export const cardIsScreen = (p: Pick<ProjectData, "slug">, img: ProjectImage): boolean => isScreenGrab(p.slug, img.key);
