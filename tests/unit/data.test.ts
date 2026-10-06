/**
 * src/data/* integrity: every cross-reference between the data files, the message files and the assets resolves.
 * The site builds even when some of these drift (a missing alt falls back, an unknown slug renders nothing), so the
 * build alone does not catch them.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { INDUSTRIES, INDUSTRY_SLUGS } from "~/data/industries";
import {
  FEATURED_PROJECT_SLUGS,
  PROJECTS,
  PROJECT_SLUGS,
  featuredProjects,
  projectsByIndustry,
  projectsByService,
  projectsSorted,
  relatedProjects,
} from "~/data/projects";
import { SERVICES, SERVICE_SLUGS } from "~/data/services";
import { SITE } from "~/data/site";
import { STATS } from "~/data/stats";
import { BRANDS, BRAND_SLUGS, PROTOCOLS } from "~/data/technologies";
import { ZONES, ZONE_SLUGS } from "~/data/zones";
import { PIN, kmFromBase } from "~/components/sections/main/zone-geo";
import { LOCALES, getMessages } from "~/i18n";

const root = (p: string) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const unique = (xs: readonly string[]) => new Set(xs).size === xs.length;

describe("projects", () => {
  it("PROJECT_SLUGS are unique and match PROJECTS one to one (same order)", () => {
    expect(unique(PROJECT_SLUGS)).toBe(true);
    expect(PROJECTS.map((p) => p.slug)).toEqual([...PROJECT_SLUGS]);
  });

  it.each(PROJECTS.map((p) => [p.slug, p] as const))("%s references existing industries and services", (_, p) => {
    expect(p.industries.length).toBeGreaterThan(0);
    expect(p.services.length).toBeGreaterThan(0);
    expect(unique(p.industries) && unique(p.services)).toBe(true);
    for (const i of p.industries) expect(INDUSTRY_SLUGS, `industry ${i}`).toContain(i);
    for (const s of p.services) expect(SERVICE_SLUGS, `service ${s}`).toContain(s);
    expect(p.technologies.length).toBeGreaterThan(0);
    expect(p.year).toBeGreaterThanOrEqual(2020);
    expect(p.year).toBeLessThanOrEqual(new Date().getFullYear());
    expect(p.yearEvidence.trim()).not.toBe("");
  });

  it("every image imported by projects.ts exists, under the project's own folder", () => {
    const src = readFileSync(root("src/data/projects.ts"), "utf8");
    const imports = [...src.matchAll(/^import \w+ from "~\/assets\/projects\/([^"]+)";$/gm)].map((m) => m[1]!);
    expect(imports.length).toBeGreaterThanOrEqual(PROJECTS.length);
    for (const rel of imports) {
      expect(existsSync(root(`src/assets/projects/${rel}`)), rel).toBe(true);
      expect(PROJECT_SLUGS as readonly string[], `folder of ${rel}`).toContain(rel.split("/")[0]);
    }
    for (const p of PROJECTS) for (const img of [p.cover, ...p.gallery]) expect(img.image, `${p.slug}/${img.key}`).toBeTruthy();
  });

  it("image keys are unique per project and every image has alt text in every locale", () => {
    for (const p of PROJECTS) {
      const keys = [p.cover.key, ...p.gallery.map((g) => g.key)];
      expect(unique(keys), p.slug).toBe(true);
      for (const l of LOCALES) {
        const alts = getMessages(l).projects.items[p.slug]?.imageAlts as Record<string, string> | undefined;
        for (const k of keys) expect(alts?.[k]?.trim(), `${l} projects.items.${p.slug}.imageAlts.${k}`).toBeTruthy();
      }
    }
  });

  it("videos: files exist in public/, ISO upload date, and a localized title exactly where there is a video", () => {
    for (const p of PROJECTS) {
      for (const l of LOCALES) {
        const item = getMessages(l).projects.items[p.slug] as Record<string, unknown>;
        expect("videoTitle" in item, `${l} ${p.slug}.videoTitle`).toBe(!!p.video);
      }
      if (!p.video) continue;
      expect(existsSync(root(`public${p.video.src}`)), p.video.src).toBe(true);
      expect(existsSync(root(`public${p.video.poster}`)), p.video.poster).toBe(true);
      expect(p.video.uploadDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(p.video.width).toBeGreaterThan(0);
      expect(p.video.height).toBeGreaterThan(0);
    }
  });

  it("exactly 3 featured projects, and the featured flags agree with FEATURED_PROJECT_SLUGS", () => {
    expect(FEATURED_PROJECT_SLUGS).toHaveLength(3);
    expect(unique(FEATURED_PROJECT_SLUGS)).toBe(true);
    expect(PROJECTS.filter((p) => p.featured).map((p) => p.slug).sort()).toEqual([...FEATURED_PROJECT_SLUGS].sort());
    expect(featuredProjects().map((p) => p.slug)).toEqual([...FEATURED_PROJECT_SLUGS]);
  });

  it("every project has copy in every locale, and no locale has copy for an unknown project", () => {
    for (const l of LOCALES) expect(Object.keys(getMessages(l).projects.items).sort(), l).toEqual([...PROJECT_SLUGS].sort());
  });

  it("projectsSorted() is newest first and keeps catalogue order on ties", () => {
    const sorted = projectsSorted();
    expect(sorted).toHaveLength(PROJECTS.length);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i - 1]!.year).toBeGreaterThanOrEqual(sorted[i]!.year);
      if (sorted[i - 1]!.year === sorted[i]!.year) expect(PROJECTS.indexOf(sorted[i - 1]!)).toBeLessThan(PROJECTS.indexOf(sorted[i]!));
    }
  });

  it("relatedProjects() never returns the project itself and respects the limit", () => {
    for (const p of PROJECTS) {
      const rel = relatedProjects(p.slug);
      expect(rel.length).toBeLessThanOrEqual(3);
      expect(rel.map((r) => r.slug)).not.toContain(p.slug);
    }
  });
});

describe("services and industries", () => {
  it("SERVICES / INDUSTRIES match their slug lists (same order)", () => {
    expect(SERVICES.map((s) => s.slug)).toEqual([...SERVICE_SLUGS]);
    expect(INDUSTRIES.map((i) => i.slug)).toEqual([...INDUSTRY_SLUGS]);
  });

  it("cross-links point at existing slugs", () => {
    for (const s of SERVICES) {
      for (const i of s.industries) expect(INDUSTRY_SLUGS, `${s.slug} → ${i}`).toContain(i);
      expect(s.featuredProjects.length).toBeLessThanOrEqual(3);
      for (const p of s.featuredProjects) expect(PROJECT_SLUGS, `${s.slug} → ${p}`).toContain(p);
    }
    for (const i of INDUSTRIES) for (const s of i.services) expect(SERVICE_SLUGS, `${i.slug} → ${s}`).toContain(s);
  });

  it("a service page only features projects that actually used that service", () => {
    for (const s of SERVICES) {
      for (const slug of s.featuredProjects) expect(PROJECTS.find((p) => p.slug === slug)!.services, `${s.slug} features ${slug}`).toContain(s.slug);
    }
  });

  it("every industry has project evidence; every service except maintenance-support has a case study", () => {
    for (const i of INDUSTRY_SLUGS) expect(projectsByIndustry(i).length, i).toBeGreaterThan(0);
    for (const s of SERVICE_SLUGS) {
      if (s === "maintenance-support") expect(SERVICES.find((x) => x.slug === s)!.featuredProjects).toEqual([]);
      else expect(projectsByService(s).length, s).toBeGreaterThan(0);
    }
  });

  it("every service / industry has copy in every locale (and nothing extra)", () => {
    for (const l of LOCALES) {
      const m = getMessages(l);
      expect(Object.keys(m.services.items).sort(), `${l} services`).toEqual([...SERVICE_SLUGS].sort());
      expect(Object.keys(m.industries.items).sort(), `${l} industries`).toEqual([...INDUSTRY_SLUGS].sort());
    }
  });
});

describe("zones", () => {
  it("ZONE_SLUGS and ZONES list the same unique zones", () => {
    expect(unique(ZONE_SLUGS)).toBe(true);
    expect(ZONES.map((z) => z.slug).sort()).toEqual([...ZONE_SLUGS].sort());
  });

  it("exactly one home base: 6th of October (the address in SITE)", () => {
    const homes = ZONES.filter((z) => z.home);
    expect(homes.map((z) => z.slug)).toEqual(["6th-of-october"]);
    expect(SITE.address.locality).toBe("6th of October City");
  });

  it("SCZONE flags only on Suez Canal zones, and every Suez Canal zone is flagged", () => {
    for (const z of ZONES) expect(!!z.sczone, z.slug).toBe(z.region === "suez-canal");
  });

  it("every zone has a map pin; distances are 0 for the base, positive multiples of 5 km elsewhere", () => {
    expect(Object.keys(PIN).sort()).toEqual([...ZONE_SLUGS].sort());
    for (const z of ZONES) {
      const km = kmFromBase(z.slug);
      expect(km % 5, z.slug).toBe(0);
      if (z.home) expect(km).toBe(0);
      else expect(km, z.slug).toBeGreaterThan(0);
    }
  });

  it("every zone and region is named in every locale", () => {
    for (const l of LOCALES) {
      const zones = getMessages(l).common.zones as { items: Record<string, { name: string; governorate: string }>; regions: Record<string, string> };
      expect(Object.keys(zones.items).sort(), l).toEqual([...ZONE_SLUGS].sort());
      for (const z of ZONES) {
        expect(zones.items[z.slug]!.name.trim(), `${l} ${z.slug}`).not.toBe("");
        expect(zones.regions[z.region]?.trim(), `${l} region ${z.region}`).toBeTruthy();
      }
    }
  });
});

describe("site facts, stats and technologies", () => {
  it("NAP: phone formats agree with each other", () => {
    const digits = (s: string) => s.replace(/\D/g, "");
    expect(digits(SITE.phone.display)).toBe(digits(SITE.phone.tel));
    expect(SITE.whatsapp).toBe(digits(SITE.phone.tel));
    expect(`20${digits(SITE.phone.local).slice(1)}`).toBe(SITE.whatsapp);
  });

  it("stats are derived from the data (no hand-typed numbers)", () => {
    const v = Object.fromEntries(STATS.map((s) => [s.key, s.value]));
    expect(v.platforms).toBe(String(SITE.brands.length));
    expect(v.industries).toBe(`${INDUSTRIES.length}+`);
    expect(v.projects).toBe(`${SITE.projectsCount}+`);
    expect(SITE.projectsCount).toBeGreaterThanOrEqual(PROJECTS.length);
  });

  it("BRANDS follow SITE.brands and have text in every locale", () => {
    expect(BRANDS.map((b) => b.slug)).toEqual([...BRAND_SLUGS]);
    expect(BRANDS.map((b) => b.name)).toEqual([...SITE.brands]);
    for (const l of LOCALES) {
      const items = getMessages(l).technologies.brands.items as Record<string, { text: string }>;
      for (const b of BRAND_SLUGS) expect(items[b]?.text?.trim(), `${l} ${b}`).toBeTruthy();
    }
  });

  it("every technology / product / protocol string has a localized chip label in every locale", () => {
    const strings = new Set([...PROJECTS.flatMap((p) => p.technologies), ...BRANDS.flatMap((b) => b.products), ...PROTOCOLS]);
    for (const l of LOCALES) {
      const m = getMessages(l);
      const tech = (m.tech as { items: Record<string, string> }).items;
      const products = (m.technologies.brands as { productNames: Record<string, string> }).productNames;
      const missing = [...strings].filter((s) => !(s in tech) && !(s in products));
      expect(missing, `${l}: add these to tech.json items`).toEqual([]);
    }
  });
});
