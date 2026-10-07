/**
 * Search / share metadata builders:
 *   src/lib/og.ts      every public page of every locale has its own 1200×630 card (case studies: the photo JPEG),
 *                      the others fall back to the per-locale default card
 *   src/lib/jsonld.ts  the company node is one entity in every locale; page / service / breadcrumb / case-study nodes
 *                      carry absolute URLs, no display controls, and case studies are never modified before published
 */
import { describe, expect, it } from "vitest";
import { INDUSTRY_SLUGS } from "~/data/industries";
import { PROJECTS, PROJECT_SLUGS } from "~/data/projects";
import { SERVICE_SLUGS } from "~/data/services";
import { SITE } from "~/data/site";
import { LOCALES, getMessages } from "~/i18n";
import { ORG_ID, WEBSITE_ID, absUrl, article, breadcrumbList, graph, organization, service, webPage, website, type JsonLdNode } from "~/lib/jsonld";
import { ogCard, ogDefault, ogSpecs } from "~/lib/og";

/** Every page that should have its own card (locale-less paths). */
const CARD_PATHS = [
  "",
  "about",
  "contact",
  "technologies",
  "foreign-manufacturers",
  "privacy",
  "services",
  "industries",
  "projects",
  ...SERVICE_SLUGS.map((s) => `services/${s}`),
  ...INDUSTRY_SLUGS.map((s) => `industries/${s}`),
  ...PROJECT_SLUGS.map((s) => `projects/${s}`),
];
/** Display controls html() / plain() add for rendering; metadata must carry the words only. */
const CONTROLS = /[ ­​-‏⁠⁦-⁩]/;

describe("og cards", () => {
  for (const locale of LOCALES) {
    it(`${locale}: every public page has its own card, at its own URL, with a plain-text alt naming the company`, () => {
      const urls = new Set<string>();
      for (const path of CARD_PATHS) {
        const card = ogCard(locale, path);
        expect(card, path).toBeDefined();
        const photo = path.startsWith("projects/");
        expect(card!.url).toBe(`/og/${locale}/${path || "home"}.${photo ? "jpg" : "png"}`);
        expect(card).toMatchObject({ width: 1200, height: 630, type: photo ? "image/jpeg" : "image/png" });
        expect(card!.alt, path).toContain(SITE.name);
        expect(card!.alt, path).not.toMatch(CONTROLS);
        urls.add(card!.url);
      }
      expect(urls.size).toBe(CARD_PATHS.length);
    });

    it(`${locale}: slashes do not matter; pages without a card fall back to the default card`, () => {
      expect(ogCard(locale, "/services/control-panels/")).toEqual(ogCard(locale, "services/control-panels"));
      for (const path of ["contact/thanks", "lab/hmi", "styleguide", "services/nope", "default"]) expect(ogCard(locale, path), path).toBeUndefined();
      const d = ogDefault(locale);
      expect(d).toMatchObject({ url: `/og/${locale}/default.png`, width: 1200, height: 630, type: "image/png" });
      expect(d.alt.trim()).not.toBe("");
    });
  }

  it("the registry holds exactly the card pages + one default per locale", () => {
    expect(ogSpecs().size).toBe(LOCALES.length * (CARD_PATHS.length + 1));
  });
});

/** Every URL-valued field anywhere in a JSON-LD node (string values under URL-ish keys). */
function urls(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach((n) => urls(n, out));
  else if (node && typeof node === "object")
    for (const [k, v] of Object.entries(node)) {
      if (/^(url|@id|image|logo|contentUrl|thumbnailUrl|item|serviceUrl|sameAs)$/.test(k)) {
        for (const x of [v].flat()) if (typeof x === "string") out.push(x);
      }
      urls(v, out);
    }
  return out;
}
const absolute = (node: JsonLdNode) => {
  const found = urls(node);
  expect(found.length).toBeGreaterThan(0);
  for (const u of found) expect(u, u).toMatch(/^https:\/\/(logic-controls\.com\/|www\.facebook\.com\/|en\.wikipedia\.org\/)/);
};

describe("JSON-LD", () => {
  it("the company is one node: the same values in every locale (CS2-07), with its facts and absolute URLs", () => {
    const org = organization("en");
    for (const l of LOCALES) expect(organization(l)).toEqual(org);
    expect(org).toMatchObject({ "@type": "ProfessionalService", "@id": ORG_ID, name: SITE.name, url: `${SITE.url}/`, email: SITE.email, telephone: SITE.phone.tel });
    expect((org.address as JsonLdNode).addressCountry).toBe("EG");
    expect((org.hasOfferCatalog as { itemListElement: unknown[] }).itemListElement).toHaveLength(SERVICE_SLUGS.length);
    absolute(org);
    expect(JSON.stringify(org)).not.toMatch(CONTROLS);
  });

  it("the site node lists every language and points at the company", () => {
    expect(website()).toMatchObject({ "@id": WEBSITE_ID, inLanguage: ["en", "ar", "zh-Hans", "tr"], publisher: { "@id": ORG_ID } });
    expect(graph(website(), false, undefined, null)["@graph"]).toHaveLength(1);
  });

  for (const locale of LOCALES) {
    const m = getMessages(locale);
    it(`${locale}: page, service and breadcrumb nodes use absolute locale URLs and drop the site-name suffix`, () => {
      const page = webPage(locale, { path: "services/control-panels", name: `Control panels | ${SITE.name}` });
      expect(page).toMatchObject({ "@id": `${SITE.url}/${locale}/services/control-panels/#webpage`, name: "Control panels", isPartOf: { "@id": WEBSITE_ID } });
      expect(page).not.toHaveProperty("description"); // optional facts are absent, never empty
      absolute(page);
      const s = service(locale, { path: "services/control-panels", name: m.services.items["control-panels"].title });
      expect(s["@id"]).toBe(`${SITE.url}/${locale}/services/control-panels/#service`);
      absolute(s);
      const crumbs = breadcrumbList(locale, [{ label: "Home", path: "" }, { label: "Services", path: "services" }, { label: "Here" }]);
      const items = crumbs.itemListElement as JsonLdNode[];
      expect(items.map((i) => i.position)).toEqual([1, 2, 3]);
      expect(items[1]!.item).toBe(`${SITE.url}/${locale}/services/`);
      expect(items[2]).not.toHaveProperty("item"); // the current page is the last crumb, without a link
    });
  }

  for (const p of PROJECTS) {
    it(`case study ${p.slug}: Article with headline, absolute images, dates (published ≤ modified) in every locale`, () => {
      for (const locale of LOCALES) {
        const m = getMessages(locale);
        const c = (m.projects.items as Record<string, { title: string; cardTitle: string; summary: string; seoDescription: string }>)[p.slug]!;
        const a = article(locale, {
          path: `projects/${p.slug}`,
          project: p,
          copy: c,
          coverUrl: absUrl(`/_astro/${p.slug}.jpg`),
          industries: p.industries.map((i) => ({ name: (m.industries.items as Record<string, { title: string }>)[i]!.title, path: `industries/${i}` })),
          section: m.common.breadcrumbs.projects,
        });
        const where = `${locale} ${p.slug}`;
        expect(a["@id"], where).toBe(`${SITE.url}/${locale}/projects/${p.slug}/#case-study`);
        expect(typeof a.headline === "string" && a.headline.length > 0 && a.headline.length <= 110, where).toBe(true);
        expect(a.image, where).toEqual([`${SITE.url}/og/${locale}/projects/${p.slug}.jpg`, `${SITE.url}/_astro/${p.slug}.jpg`]);
        expect(a.author, where).toMatchObject({ "@id": ORG_ID });
        expect(a.temporalCoverage, where).toBe(String(p.year));
        const [pub, mod] = [Date.parse(String(a.datePublished)), Date.parse(String(a.dateModified))];
        expect(Number.isNaN(pub) || Number.isNaN(mod), `${where}: dates ${a.datePublished} / ${a.dateModified}`).toBe(false);
        expect(pub, where).toBeLessThanOrEqual(mod);
        absolute(a);
        expect(JSON.stringify(a), where).not.toMatch(CONTROLS);
      }
    });
  }
});
