/**
 * Case studies (15), built from the client's Facebook and LinkedIn project posts. Clients are anonymised.
 * Copy lives in src/i18n/messages/<locale>/projects.json → items[slug]
 * (title, client, summary, challenge, solution, scope, result, highlights, imageAlts, seo…).
 *
 * Images: src/assets/projects/<slug>/*.jpg — third-party logos/nameplates were already cropped or blurred.
 * Alt text for each image: projects.json → items[slug].imageAlts[<key>] where <key> = `cover` or a gallery `key`.
 * Videos: pre-compressed files in /public/media (served as-is, no Google/YouTube dependency → safe on /zh/).
 */
import type { ImageMetadata } from "astro";
import type { IndustrySlug } from "./industries";
import type { ServiceSlug } from "./services";

// 1 · Shampoo filling (LS + Wecon), 2026
import shampooLsCover from "~/assets/projects/shampoo-filling-ls-wecon/cover.jpg";
// 2 · Bottle printing retrofit, 2026
import printingCover from "~/assets/projects/bottle-printing-motion-retrofit/cover.jpg";
// 3 · Anaerobic waste treatment commissioning, 2026
import wasteHmi from "~/assets/projects/anaerobic-waste-treatment-commissioning/hmi.jpg";
import wastePanel from "~/assets/projects/anaerobic-waste-treatment-commissioning/panel.jpg";
// 4 · Commercial laundry washer, 2026
import laundryHmi from "~/assets/projects/commercial-laundry-washer-control/hmi.jpg";
// 5 · Pasteurizer with CIP and recipes, 2026
import pastHmi from "~/assets/projects/pasteurizer-cip-recipes/hmi.jpg";
import pastPanel from "~/assets/projects/pasteurizer-cip-recipes/panel.jpg";
import pastTimers from "~/assets/projects/pasteurizer-cip-recipes/settings-timers.jpg";
import pastControl from "~/assets/projects/pasteurizer-cip-recipes/settings-control.jpg";
// 6 · Labeling machine, 2026
import labelHmi from "~/assets/projects/labeling-machine-delta-wecon/hmi.jpg";
import labelPanel from "~/assets/projects/labeling-machine-delta-wecon/panel.jpg";
import labelRecipes from "~/assets/projects/labeling-machine-delta-wecon/recipes.jpg";
// 7 · Olive autoclave, 2025
import oliveMachine from "~/assets/projects/olive-autoclave-sterilization/machine.jpg";
import olivePanel from "~/assets/projects/olive-autoclave-sterilization/panel.jpg";
import oliveHmi from "~/assets/projects/olive-autoclave-sterilization/hmi.jpg";
// 8 · Concrete batching, 2025
import concreteScada from "~/assets/projects/concrete-batching-plant-scada/scada.jpg";
// 9 · Tablet coating, 2025
import coatingMachine from "~/assets/projects/tablet-coating-scada/machine.jpg";
import coatingScada from "~/assets/projects/tablet-coating-scada/scada.jpg";
// 10 · Shampoo filling (Delta + Wecon), 2025
import shampooDeltaPanel from "~/assets/projects/shampoo-filling-delta-wecon/panel.jpg";
import shampooDeltaMachine from "~/assets/projects/shampoo-filling-delta-wecon/machine.jpg";
import shampooDeltaHmi from "~/assets/projects/shampoo-filling-delta-wecon/hmi-arabic.jpg";
// 11 · Cheese cooker, 2024
import cheesePanel from "~/assets/projects/cheese-cooker-recipes/panel.jpg";
import cheeseHmi from "~/assets/projects/cheese-cooker-recipes/hmi.jpg";
// 12 · Milk pasteurizer, 2025
import milkHmi from "~/assets/projects/milk-pasteurizer/hmi.jpg";
import milkPanel from "~/assets/projects/milk-pasteurizer/panel.jpg";
// 13 · Pipe make/break test rig, 2025
import pipeHmi from "~/assets/projects/pipe-make-break-test-rig/hmi.jpg";
// 14 · Hotel washer-extractor, 2024
import washerMachine from "~/assets/projects/hotel-washer-extractor-control/machine.jpg";
import washerHmi from "~/assets/projects/hotel-washer-extractor-control/hmi.jpg";
import washerEditor from "~/assets/projects/hotel-washer-extractor-control/program-editor.jpg";
// 15 · Beverage syrup jet mixing (Siemens S7-1200 + SIMATIC HMI + Yaskawa), 2026 (from LinkedIn)
import syrupHmi from "~/assets/projects/beverage-syrup-jet-mixing/hmi.jpg";
import syrupPanel from "~/assets/projects/beverage-syrup-jet-mixing/panel.jpg";

export const PROJECT_SLUGS = [
  "beverage-syrup-jet-mixing",
  "shampoo-filling-ls-wecon",
  "bottle-printing-motion-retrofit",
  "anaerobic-waste-treatment-commissioning",
  "commercial-laundry-washer-control",
  "pasteurizer-cip-recipes",
  "labeling-machine-delta-wecon",
  "olive-autoclave-sterilization",
  "concrete-batching-plant-scada",
  "tablet-coating-scada",
  "shampoo-filling-delta-wecon",
  "cheese-cooker-recipes",
  "milk-pasteurizer",
  "pipe-make-break-test-rig",
  "hotel-washer-extractor-control",
] as const;

export type ProjectSlug = (typeof PROJECT_SLUGS)[number];

export interface ProjectImage {
  /** Key into projects.json → items[slug].imageAlts */
  key: string;
  image: ImageMetadata;
}

export interface ProjectVideo {
  /** Public path of the compressed MP4 (already in /public/media). */
  src: string;
  /** Public path of the poster image. */
  poster: string;
  width: number;
  height: number;
  /** Internal note for the page-builder / client sign-off. Never render. */
  note?: string;
}

export interface ProjectData {
  slug: ProjectSlug;
  /** Best evidence for the delivery year (see `yearEvidence`). */
  year: number;
  /** Internal: where the year comes from. Never render. */
  yearEvidence: string;
  /** First item = primary industry (used for the card tag and breadcrumb). */
  industries: IndustrySlug[];
  services: ServiceSlug[];
  /** Brand + product as seen in post text or photos. Language-neutral, render as-is (LTR). */
  technologies: string[];
  /** Translatable location key → common.json locations[key]. All projects are in Egypt; no city is confirmed. */
  location: "egypt";
  featured: boolean;
  cover: ProjectImage;
  gallery: ProjectImage[];
  video?: ProjectVideo;
}

export const PROJECTS: readonly ProjectData[] = [
  {
    slug: "beverage-syrup-jet-mixing",
    year: 2026,
    yearEvidence: "Founder's LinkedIn post of 26 Sep 2026 presenting it as a recent project (HMI date in the photo is too blurred to read)",
    industries: ["food-beverage"],
    services: ["control-panels", "plc-hmi-programming", "process-control", "testing-commissioning"],
    technologies: ["Siemens S7-1200 PLC", "Siemens S7-1200 I/O modules", "Siemens SIMATIC HMI", "Yaskawa VFDs"],
    location: "egypt",
    featured: true,
    cover: { key: "hmi", image: syrupHmi },
    gallery: [{ key: "panel", image: syrupPanel }],
  },
  {
    slug: "shampoo-filling-ls-wecon",
    year: 2026,
    yearEvidence: "Facebook reel posted 15 Sep 2026 as a recently completed project",
    industries: ["cosmetics-personal-care", "packaging-labeling"],
    services: ["machine-automation", "plc-hmi-programming", "control-panels", "testing-commissioning"],
    technologies: ["LS Electric PLC", "Wecon HMI"],
    location: "egypt",
    featured: true,
    cover: { key: "cover", image: shampooLsCover },
    gallery: [],
    video: {
      src: "/media/shampoo-filling-line.mp4",
      poster: "/media/shampoo-filling-line-poster.webp",
      width: 1280,
      height: 720,
      note: "The product brand is readable on some bottles in the video. Get the client's OK (or blur) before launch.",
    },
  },
  {
    slug: "bottle-printing-motion-retrofit",
    year: 2026,
    yearEvidence: "Facebook reel posted 29 Jul 2026 as a recently completed project",
    industries: ["packaging-labeling", "pharmaceutical", "cosmetics-personal-care"],
    services: ["machine-retrofits", "machine-automation", "plc-hmi-programming", "testing-commissioning"],
    technologies: ["PLC", "Motion control"],
    location: "egypt",
    featured: false,
    cover: { key: "cover", image: printingCover },
    gallery: [],
    video: {
      src: "/media/bottle-printing-retrofit.mp4",
      poster: "/media/bottle-printing-retrofit-poster.webp",
      width: 1280,
      height: 720,
      note: "The original machine builder's nameplate may be visible at the start of the video. Check before launch.",
    },
  },
  {
    slug: "anaerobic-waste-treatment-commissioning",
    year: 2026,
    yearEvidence: "Facebook album posted 11 Jul 2026 as a recently completed project",
    industries: ["food-beverage"],
    services: ["testing-commissioning", "process-control"],
    technologies: ["Siemens S7-200 SMART PLC", "Siemens EM expansion modules", "MCGS HMI", "Industrial Ethernet switch"],
    location: "egypt",
    featured: false,
    cover: { key: "hmi", image: wasteHmi },
    gallery: [{ key: "panel", image: wastePanel }],
  },
  {
    slug: "commercial-laundry-washer-control",
    year: 2026,
    yearEvidence: "Reel created 16 Jun 2026; HMI clock in the video shows 2026-06-16",
    industries: ["commercial-laundry"],
    services: ["plc-hmi-programming", "machine-automation", "process-control"],
    technologies: ["Wecon PLC", "Wecon HMI"],
    location: "egypt",
    featured: false,
    cover: { key: "hmi", image: laundryHmi },
    gallery: [],
    video: {
      src: "/media/hotel-laundry-hmi.mp4",
      poster: "/media/hotel-laundry-hmi-poster.webp",
      width: 540,
      height: 960,
      note: "Vertical video (9:16). Show it in a narrow frame, not full-width.",
    },
  },
  {
    slug: "pasteurizer-cip-recipes",
    year: 2026,
    yearEvidence: "Facebook album posted 2 May 2026 as a recently implemented project",
    industries: ["food-beverage"],
    services: ["process-control", "plc-hmi-programming", "scada-data-logging"],
    technologies: ["Wecon LX3V PLC", "Wecon HMI", "Schneider Electric C60N circuit breakers"],
    location: "egypt",
    featured: false,
    cover: { key: "hmi", image: pastHmi },
    gallery: [
      { key: "panel", image: pastPanel },
      { key: "settingsTimers", image: pastTimers },
      { key: "settingsControl", image: pastControl },
    ],
  },
  {
    slug: "labeling-machine-delta-wecon",
    year: 2026,
    yearEvidence: "HMI clock in photo shows 2026-02-07; posted 17 Apr 2026",
    industries: ["packaging-labeling"],
    services: ["machine-automation", "plc-hmi-programming", "scada-data-logging"],
    technologies: ["Delta DVP PLC", "Wecon HMI", "Schneider Electric stepper drives", "Schneider Electric Altivar VFD"],
    location: "egypt",
    featured: false,
    cover: { key: "hmi", image: labelHmi },
    gallery: [
      { key: "recipes", image: labelRecipes },
      { key: "panel", image: labelPanel },
    ],
  },
  {
    slug: "olive-autoclave-sterilization",
    year: 2025,
    yearEvidence: "HMI screenshot dated 2025-01-18; posted 1 Jan 2026 as a previous project",
    industries: ["food-beverage"],
    services: ["process-control", "plc-hmi-programming", "scada-data-logging"],
    technologies: ["LS Electric PLC with expansion module", "HMI"],
    location: "egypt",
    featured: false,
    cover: { key: "machine", image: oliveMachine },
    gallery: [
      { key: "hmi", image: oliveHmi },
      { key: "panel", image: olivePanel },
    ],
  },
  {
    slug: "concrete-batching-plant-scada",
    year: 2025,
    yearEvidence: "No date on screen; posted 1 Jan 2026 as a previous project (year assumed, confirm with client)",
    industries: ["building-materials"],
    services: ["process-control", "scada-data-logging", "plc-hmi-programming"],
    technologies: ["Siemens S7-1200 PLC", "Siemens WinCC Professional SCADA"],
    location: "egypt",
    featured: false,
    cover: { key: "scada", image: concreteScada },
    gallery: [],
  },
  {
    slug: "tablet-coating-scada",
    year: 2025,
    yearEvidence: "SCADA clock in photo shows 2025-11-15; posted 1 Jan 2026",
    industries: ["pharmaceutical"],
    services: ["scada-data-logging", "process-control", "plc-hmi-programming"],
    technologies: ["Siemens S7-1200 PLC", "Siemens WinCC Professional SCADA", "VFD-driven fans and drum"],
    location: "egypt",
    featured: true,
    cover: { key: "machine", image: coatingMachine },
    gallery: [{ key: "scada", image: coatingScada }],
  },
  {
    slug: "shampoo-filling-delta-wecon",
    year: 2025,
    yearEvidence: "Posted 1 Jan 2026 as a previous project (year assumed, confirm with client)",
    industries: ["cosmetics-personal-care", "packaging-labeling"],
    services: ["control-panels", "machine-automation", "plc-hmi-programming"],
    technologies: ["Delta DVP-12SC PLC", "Wecon HMI", "LS Electric M100 VFD", "MEAN WELL power supply"],
    location: "egypt",
    featured: false,
    cover: { key: "panel", image: shampooDeltaPanel },
    gallery: [
      { key: "machine", image: shampooDeltaMachine },
      { key: "hmiArabic", image: shampooDeltaHmi },
    ],
  },
  {
    slug: "cheese-cooker-recipes",
    year: 2024,
    yearEvidence: "HMI screenshot dated 2024-08-30 (before the company was founded: delivered by our engineers)",
    industries: ["food-beverage"],
    services: ["process-control", "plc-hmi-programming"],
    technologies: ["Wecon PLC with expansion module", "Wecon HMI", "VEICHI VFD"],
    location: "egypt",
    featured: false,
    cover: { key: "hmi", image: cheeseHmi },
    gallery: [{ key: "panel", image: cheesePanel }],
  },
  {
    slug: "milk-pasteurizer",
    year: 2025,
    yearEvidence: "Posted 28 Dec 2025 as a previous project (year assumed, confirm with client)",
    industries: ["food-beverage"],
    services: ["process-control", "plc-hmi-programming"],
    technologies: ["Wecon PLC with expansion module", "Wecon HMI"],
    location: "egypt",
    featured: false,
    cover: { key: "hmi", image: milkHmi },
    gallery: [{ key: "panel", image: milkPanel }],
  },
  {
    slug: "pipe-make-break-test-rig",
    year: 2025,
    yearEvidence: "HMI screenshot dated 2025-01-17; posted 26 Dec 2025 as a previous project",
    industries: ["test-equipment"],
    services: ["machine-automation", "plc-hmi-programming", "scada-data-logging"],
    technologies: ["Wecon PLC", "Wecon HMI"],
    location: "egypt",
    featured: false,
    cover: { key: "hmi", image: pipeHmi },
    gallery: [],
  },
  {
    slug: "hotel-washer-extractor-control",
    year: 2024,
    yearEvidence: "HMI screenshot dated 2024-09-14 (before the company was founded: delivered by our engineers)",
    industries: ["commercial-laundry"],
    services: ["machine-automation", "plc-hmi-programming", "process-control"],
    technologies: ["Wecon PLC", "Wecon HMI"],
    location: "egypt",
    featured: false,
    cover: { key: "machine", image: washerMachine },
    gallery: [
      { key: "hmi", image: washerHmi },
      { key: "programEditor", image: washerEditor },
    ],
  },
];

/**
 * The 3 case studies on the home page, in this order: pharma (Siemens + WinCC SCADA), beverage (Siemens + Yaskawa,
 * newest), cosmetics (LS + Wecon, with video). Pasteurizers stay visible on the home page through the live HMI demo,
 * and pasteurizer-cip-recipes still leads the process-control service page.
 */
export const FEATURED_PROJECT_SLUGS: readonly ProjectSlug[] = [
  "tablet-coating-scada",
  "beverage-syrup-jet-mixing",
  "shampoo-filling-ls-wecon",
];

export function getProject(slug: string): ProjectData | undefined {
  return PROJECTS.find((p) => p.slug === slug);
}

export function featuredProjects(): ProjectData[] {
  return FEATURED_PROJECT_SLUGS.map((s) => getProject(s)!).filter(Boolean);
}

/** Newest first; ties keep catalogue order. */
export function projectsSorted(): ProjectData[] {
  return [...PROJECTS].sort((a, b) => b.year - a.year);
}

export function projectsByIndustry(industry: IndustrySlug): ProjectData[] {
  return projectsSorted().filter((p) => p.industries.includes(industry));
}

export function projectsByService(service: ServiceSlug): ProjectData[] {
  return projectsSorted().filter((p) => p.services.includes(service));
}

/** Related case studies for a project page: same primary industry first, then shared services. */
export function relatedProjects(slug: ProjectSlug, limit = 3): ProjectData[] {
  const self = getProject(slug);
  if (!self) return [];
  const score = (p: ProjectData) =>
    (p.industries[0] === self.industries[0] ? 3 : 0) +
    p.industries.filter((i) => self.industries.includes(i)).length +
    p.services.filter((s) => self.services.includes(s)).length;
  return projectsSorted()
    .filter((p) => p.slug !== slug)
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit);
}
