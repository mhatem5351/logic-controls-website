/**
 * Geometry of the "Where we work" map (ZoneMap.astro, ZonesBlock.astro). Build-time only.
 *
 * Projection (equirectangular around 30°N): x = (lon − 28.8) × 86.6, y = (31.8 − lat) × 100 → viewBox 380×260.
 * Distances are great-circle distances between the inverse-projected pins, rounded to 5 km: they are labelled
 * "straight line" everywhere (never a road distance or a drive time).
 */
import type { ZoneSlug } from "~/data/zones";

export const MAP_W = 380;
export const MAP_H = 260;

export const PIN: Record<ZoneSlug, [number, number]> = {
  "6th-of-october": [184.5, 186],
  obour: [231, 157],
  badr: [250, 170],
  "10th-of-ramadan": [257, 149],
  "sadat-city": [150, 143],
  "borg-el-arab": [74, 93],
  "ain-sokhna": [306, 218],
  "qantara-west": [297, 95],
  "east-port-said": [316, 61],
};
export const BASE = PIN["6th-of-october"];

/** Side of a pin's square hit area, in map units (≈ 24px on a 330px-wide phone map, capped at 44px in CSS). */
export const HIT = 28;
/**
 * Where the pin sits inside its hit square (0–1, x / y). Centred by default; the Obour / Badr / 10th of Ramadan
 * cluster gets offset squares that tile without overlapping, so every target keeps ≥ 24px of its own.
 */
export const HIT_ANCHOR: Partial<Record<ZoneSlug, [number, number]>> = {
  obour: [0.57, 0.5],
  badr: [0.21, 0.46],
  "10th-of-ramadan": [0.46, 0.75],
};

const toLatLon = ([x, y]: [number, number]) => [31.8 - y / 100, x / 86.6 + 28.8].map((d) => (d * Math.PI) / 180);

/** Straight-line (great-circle) distance from our base, km, rounded to the nearest 5. */
export function kmFromBase(slug: ZoneSlug): number {
  const [la1, lo1] = toLatLon(BASE);
  const [la2, lo2] = toLatLon(PIN[slug]);
  const h = Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2;
  return Math.round((2 * 6371 * Math.asin(Math.sqrt(h))) / 5) * 5;
}
