/**
 * Platform brands in the structured data (CS3-05): one Brand entity per manufacturer with a stable @id, its official
 * site and unambiguous identities as sameAs (full node on /technologies/), and the case studies' Article.mentions
 * pointing at the same @id, so search engines reconcile "Delta" / "Wecon" with the right company.
 */
import { describe, expect, it } from "vitest";
import { PROJECTS } from "~/data/projects";
import { SITE } from "~/data/site";
import { BRANDS } from "~/data/technologies";
import { getMessages } from "~/i18n";
import { absUrl, article, brandId, brandNode, brandRef, type JsonLdNode } from "~/lib/jsonld";

describe("Brand nodes", () => {
  it("each brand: a stable site-wide @id, its name, the official site as url and first sameAs, https only", () => {
    const ids = new Set<string>();
    for (const b of BRANDS) {
      const n = brandNode(b);
      expect(n["@type"]).toBe("Brand");
      expect(n["@id"]).toBe(`${SITE.url}/#brand-${b.slug}`);
      expect(n.name).toBe(b.name);
      expect(n.url).toBe(b.website);
      const sameAs = n.sameAs as string[];
      expect(sameAs[0]).toBe(b.website);
      expect(new Set(sameAs).size).toBe(sameAs.length);
      for (const u of sameAs) expect(u, b.slug).toMatch(/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}\//);
      ids.add(String(n["@id"]));
    }
    expect(ids.size).toBe(BRANDS.length);
  });
  it("ambiguous short names carry the manufacturer's full name", () => {
    expect(brandNode(BRANDS.find((b) => b.slug === "delta")!).alternateName).toBe("Delta Electronics");
    expect(brandNode(BRANDS.find((b) => b.slug === "wecon")!).alternateName).toBe("Wecon Technology");
  });
  it("a reference carries only @id + name (the full node lives on /technologies/)", () => {
    for (const b of BRANDS) expect(brandRef(b)).toEqual({ "@type": "Brand", "@id": brandId(b.slug), name: b.name });
  });
});

describe("case-study mentions", () => {
  it("every brand a case study names is mentioned by the brand's @id", () => {
    const m = getMessages("en");
    for (const p of PROJECTS) {
      const c = (m.projects.items as Record<string, { title: string; cardTitle: string; summary: string; seoDescription: string }>)[
        p.slug
      ]!;
      const a = article("en", { path: `projects/${p.slug}`, project: p, copy: c, coverUrl: absUrl("/x.jpg"), industries: [] });
      const mentions = (a.mentions as JsonLdNode[] | undefined) ?? [];
      const tech = p.technologies.join(" | ").toLowerCase();
      const expected = BRANDS.filter((b) => tech.includes(b.name.toLowerCase()));
      expect(mentions, p.slug).toEqual(expected.map(brandRef));
    }
  });
});
