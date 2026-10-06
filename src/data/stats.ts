/**
 * Proof figures. Render as static text (never animated count-ups). Same values on every page and locale.
 * Labels live in common.json → stats[key].label. Values are Western digits in every locale.
 */
import { SITE } from "./site";
import { INDUSTRIES } from "./industries";

export type StatKey = "projects" | "experience" | "platforms" | "industries";

export interface Stat {
  key: StatKey;
  value: string;
}

export const STATS: readonly Stat[] = [
  { key: "projects", value: `${SITE.projectsCount}+` },
  { key: "experience", value: `${SITE.experienceYears}+` },
  { key: "platforms", value: String(SITE.brands.length) },
  { key: "industries", value: `${INDUSTRIES.length}+` },
];
