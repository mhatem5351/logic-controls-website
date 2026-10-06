/**
 * Industries we have real project evidence for. Order = display order.
 * Copy lives in src/i18n/messages/<locale>/industries.json → items[slug].
 * Related projects are derived from projects.ts (see projectsByIndustry) so there is one source of truth.
 */
import type { ServiceSlug } from "./services";

export const INDUSTRY_SLUGS = [
  "food-beverage",
  "pharmaceutical",
  "cosmetics-personal-care",
  "packaging-labeling",
  "building-materials",
  "commercial-laundry",
  "test-equipment",
] as const;

export type IndustrySlug = (typeof INDUSTRY_SLUGS)[number];

export interface IndustryData {
  slug: IndustrySlug;
  /** Suggested icon name (Lucide set). The design agent may swap it. */
  icon: string;
  /** Services most relevant to this industry, in display order. */
  services: ServiceSlug[];
}

export const INDUSTRIES: readonly IndustryData[] = [
  { slug: "food-beverage", icon: "milk", services: ["process-control", "plc-hmi-programming", "control-panels", "testing-commissioning"] },
  { slug: "pharmaceutical", icon: "pill", services: ["scada-data-logging", "process-control", "machine-retrofits", "testing-commissioning"] },
  { slug: "cosmetics-personal-care", icon: "spray-can", services: ["machine-automation", "plc-hmi-programming", "control-panels", "maintenance-support"] },
  { slug: "packaging-labeling", icon: "package", services: ["machine-automation", "machine-retrofits", "plc-hmi-programming", "maintenance-support"] },
  { slug: "building-materials", icon: "brick-wall", services: ["process-control", "scada-data-logging", "plc-hmi-programming", "maintenance-support"] },
  { slug: "commercial-laundry", icon: "washing-machine", services: ["machine-automation", "plc-hmi-programming", "process-control", "maintenance-support"] },
  { slug: "test-equipment", icon: "gauge", services: ["machine-automation", "scada-data-logging", "plc-hmi-programming", "control-panels"] },
];

export function getIndustry(slug: string): IndustryData | undefined {
  return INDUSTRIES.find((i) => i.slug === slug);
}
