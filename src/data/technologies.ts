/**
 * Platforms we program and integrate (order = SITE.brands). Names and product names are language-neutral.
 * Descriptions live in technologies.json → brands.items[slug].text.
 * Wording rule: "platforms we program and integrate". Never "partner", "authorized" or "certified".
 */
export const BRAND_SLUGS = ["siemens", "schneider-electric", "delta", "ls-electric", "wecon"] as const;

export type BrandSlug = (typeof BRAND_SLUGS)[number];

export interface BrandData {
  slug: BrandSlug;
  /** Display name, identical in every locale. */
  name: string;
  /** Products we have used in projects (from post text and project photos). Render as-is, LTR. */
  products: string[];
}

export const BRANDS: readonly BrandData[] = [
  { slug: "siemens", name: "Siemens", products: ["S7-1200", "WinCC Professional", "S7-200 SMART"] },
  { slug: "schneider-electric", name: "Schneider Electric", products: ["Altivar VFDs", "Stepper drives", "C60N circuit breakers"] },
  { slug: "delta", name: "Delta", products: ["DVP series PLCs"] },
  { slug: "ls-electric", name: "LS Electric", products: ["PLCs", "M100 VFD"] },
  { slug: "wecon", name: "Wecon", products: ["LX3V PLCs", "HMIs"] },
];

/** Communication and signal types listed on the technologies page (language-neutral technical terms). */
export const PROTOCOLS = ["Modbus RTU (RS-485)", "Modbus TCP", "PROFINET", "Industrial Ethernet"] as const;
