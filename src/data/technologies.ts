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
  /** The manufacturer's full name where the display name alone is ambiguous ("Delta"): structured data only. */
  alternateName?: string;
  /** The manufacturer's official website (Brand url in the JSON-LD). */
  website: string;
  /**
   * Unambiguous public identities of the manufacturer (Wikipedia / Wikidata), for the Brand `sameAs` (CS3-05). Only
   * pages that are certainly this company; none rather than a guess.
   */
  sameAs: string[];
}

export const BRANDS: readonly BrandData[] = [
  {
    slug: "siemens",
    name: "Siemens",
    products: ["S7-1200", "WinCC Professional", "SIMATIC HMI", "S7-200 SMART"],
    website: "https://www.siemens.com/",
    sameAs: ["https://en.wikipedia.org/wiki/Siemens", "https://www.wikidata.org/wiki/Q81230"],
  },
  {
    slug: "schneider-electric",
    name: "Schneider Electric",
    products: ["Altivar VFDs", "Stepper drives", "C60N circuit breakers"],
    website: "https://www.se.com/",
    sameAs: ["https://en.wikipedia.org/wiki/Schneider_Electric"],
  },
  {
    slug: "delta",
    name: "Delta",
    products: ["DVP series PLCs"],
    alternateName: "Delta Electronics",
    website: "https://www.deltaww.com/",
    sameAs: ["https://en.wikipedia.org/wiki/Delta_Electronics"],
  },
  {
    slug: "ls-electric",
    name: "LS Electric",
    products: ["PLCs", "M100 VFD"],
    website: "https://www.ls-electric.com/",
    sameAs: [],
  },
  {
    slug: "wecon",
    name: "Wecon",
    products: ["LX3V PLCs", "HMIs"],
    alternateName: "Wecon Technology",
    website: "https://www.we-con.com.cn/",
    sameAs: [],
  },
];

/** Communication and signal types listed on the technologies page (language-neutral technical terms). */
export const PROTOCOLS = ["Modbus RTU (RS-485)", "Modbus TCP", "PROFINET", "Industrial Ethernet"] as const;
