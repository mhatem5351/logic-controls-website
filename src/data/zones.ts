/**
 * Areas we work across (home "zones" block, foreign-manufacturers page, RFQ "plant location" select).
 * Names and governorates are translated in common.json → zones.items[slug].
 * Wording rule: "We work across Greater Cairo and Egypt's industrial zones, including …"
 * This is a coverage statement, not a list of past project sites.
 */
export const ZONE_SLUGS = [
  "6th-of-october",
  "10th-of-ramadan",
  "obour",
  "badr",
  "sadat-city",
  "borg-el-arab",
  "ain-sokhna",
  "qantara-west",
  "east-port-said",
] as const;

export type ZoneSlug = (typeof ZONE_SLUGS)[number];

export type ZoneRegion = "greater-cairo" | "nile-delta" | "alexandria" | "suez-canal";

export interface ZoneData {
  slug: ZoneSlug;
  region: ZoneRegion;
  /** True for zones inside the Suez Canal Economic Zone (SCZONE). */
  sczone?: boolean;
  /** Our home base (6th of October City). */
  home?: boolean;
}

export const ZONES: readonly ZoneData[] = [
  { slug: "6th-of-october", region: "greater-cairo", home: true },
  { slug: "obour", region: "greater-cairo" },
  { slug: "badr", region: "greater-cairo" },
  { slug: "10th-of-ramadan", region: "nile-delta" },
  { slug: "sadat-city", region: "nile-delta" },
  { slug: "borg-el-arab", region: "alexandria" },
  { slug: "ain-sokhna", region: "suez-canal", sczone: true },
  { slug: "qantara-west", region: "suez-canal", sczone: true },
  { slug: "east-port-said", region: "suez-canal", sczone: true },
];
