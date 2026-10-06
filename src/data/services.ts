/**
 * Service catalogue (8 pages). Order = display order on the home page, services index, nav and RFQ form.
 * Copy lives in src/i18n/messages/<locale>/services.json → items[slug].
 * Related projects are derived from projects.ts (projectsByService); `featuredProjects` only sets which 3 to show first.
 */
import type { IndustrySlug } from "./industries";
import type { ProjectSlug } from "./projects";

export const SERVICE_SLUGS = [
  "control-panels",
  "plc-hmi-programming",
  "machine-automation",
  "machine-retrofits",
  "process-control",
  "scada-data-logging",
  "testing-commissioning",
  "maintenance-support",
] as const;

export type ServiceSlug = (typeof SERVICE_SLUGS)[number];

export interface ServiceData {
  slug: ServiceSlug;
  /** Suggested icon name (Lucide set). The design agent may swap it. */
  icon: string;
  /** Industries to cross-link from this service page, in display order. */
  industries: IndustrySlug[];
  /** Up to 3 case studies to show first on this service page (more can follow from projectsByService). */
  featuredProjects: ProjectSlug[];
}

export const SERVICES: readonly ServiceData[] = [
  {
    slug: "control-panels",
    icon: "circuit-board",
    industries: ["food-beverage", "cosmetics-personal-care", "packaging-labeling", "pharmaceutical"],
    featuredProjects: ["shampoo-filling-delta-wecon", "shampoo-filling-ls-wecon"],
  },
  {
    slug: "plc-hmi-programming",
    icon: "cpu",
    industries: ["food-beverage", "cosmetics-personal-care", "commercial-laundry", "test-equipment"],
    featuredProjects: ["shampoo-filling-ls-wecon", "labeling-machine-delta-wecon", "cheese-cooker-recipes"],
  },
  {
    slug: "machine-automation",
    icon: "cog",
    industries: ["packaging-labeling", "cosmetics-personal-care", "pharmaceutical", "commercial-laundry"],
    featuredProjects: ["labeling-machine-delta-wecon", "shampoo-filling-ls-wecon", "pipe-make-break-test-rig"],
  },
  {
    slug: "machine-retrofits",
    icon: "refresh-cw",
    industries: ["packaging-labeling", "pharmaceutical", "cosmetics-personal-care", "food-beverage"],
    featuredProjects: ["bottle-printing-motion-retrofit"],
  },
  {
    slug: "process-control",
    icon: "thermometer",
    industries: ["food-beverage", "pharmaceutical", "building-materials", "commercial-laundry"],
    featuredProjects: ["pasteurizer-cip-recipes", "olive-autoclave-sterilization", "concrete-batching-plant-scada"],
  },
  {
    slug: "scada-data-logging",
    icon: "monitor-cog",
    industries: ["pharmaceutical", "building-materials", "food-beverage", "test-equipment"],
    featuredProjects: ["tablet-coating-scada", "concrete-batching-plant-scada", "pipe-make-break-test-rig"],
  },
  {
    slug: "testing-commissioning",
    icon: "clipboard-check",
    industries: ["food-beverage", "pharmaceutical", "cosmetics-personal-care", "packaging-labeling"],
    featuredProjects: ["anaerobic-waste-treatment-commissioning", "shampoo-filling-ls-wecon", "bottle-printing-motion-retrofit"],
  },
  {
    slug: "maintenance-support",
    icon: "wrench",
    industries: ["food-beverage", "cosmetics-personal-care", "packaging-labeling", "commercial-laundry"],
    /** No support-contract case study yet: hide the related-projects block (or link to /projects/). */
    featuredProjects: [],
  },
];

export function getService(slug: string): ServiceData | undefined {
  return SERVICES.find((s) => s.slug === slug);
}
