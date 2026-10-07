/**
 * Content-honesty guards on the BUILT site (skipped when dist/ is absent, e.g. a fresh clone before `npm run build`).
 *
 * "Panels we have built" on the control-panels service page may only show case studies whose recorded scope includes
 * control-panel building (`services` contains "control-panels"). A programming-only or commissioning-only job shown
 * there would claim work the company did not do.
 * The same rule for the copy: the projects hub (meta description, lead) may not say that every case study was
 * "designed, programmed and commissioned" while most scope rows say "PLC program and HMI screens" (CS3-02).
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PROJECTS } from "~/data/projects";
import { LOCALES, type Locale } from "~/i18n/config";
import { getMessages } from "~/i18n";

const page = (locale: string) => `dist/${locale}/services/control-panels/index.html`;
const built = LOCALES.every((l) => existsSync(page(l)));

describe.skipIf(!built)("panels strip only shows panels we built", () => {
  for (const locale of LOCALES) {
    it(`${locale}: every #panels link points to a project whose scope includes control-panels`, () => {
      const html = readFileSync(page(locale), "utf8");
      const section = html.match(/<section[^>]*\bid="panels"[\s\S]*?<\/section>/)?.[0] ?? "";
      const slugs = [...section.matchAll(new RegExp(`href="/${locale}/projects/([a-z0-9-]+)/"`, "g"))].map((m) => m[1]);
      for (const slug of new Set(slugs)) {
        const project = PROJECTS.find((p) => p.slug === slug);
        expect(project, `unknown project ${slug}`).toBeDefined();
        expect(project!.services, `${slug} is shown as a panel we built`).toContain("control-panels");
      }
    });
  }
});

describe("platform attribution counts only control-platform entries", () => {
  it("passive panel parts (e.g. circuit breakers) never make a project a <brand> project", async () => {
    const { platformsOf } = await import("~/components/sections/catalog/platforms");
    const pasteurizer = PROJECTS.find((p) => p.slug === "pasteurizer-cip-recipes")!;
    expect(platformsOf(pasteurizer)).not.toContain("schneider-electric");
    const labeler = PROJECTS.find((p) => p.slug === "labeling-machine-delta-wecon")!;
    expect(platformsOf(labeler)).toContain("schneider-electric");
  });
});

describe("the projects hub claims no scope most case studies did not have", () => {
  /* Design + programming + commissioning said of the whole portfolio, in each locale's wording of round 2. */
  const FULL_SCOPE: Record<Locale, RegExp> = {
    en: /\bdesigned\b[^.]*\bprogrammed\b[^.]*\bcommissioned\b/i,
    ar: /صمم\p{L}*\s+و?برمج\p{L}*/u,
    zh: /设计.{0,3}编程.{0,3}调试/,
    tr: /tasarla\p{L}*[^.]*programla\p{L}*[^.]*devreye al/iu,
  };
  const fullScope = (p: (typeof PROJECTS)[number]) =>
    ["control-panels", "plc-hmi-programming", "testing-commissioning"].every((s) => (p.services as readonly string[]).includes(s));
  it("most case studies are not design-to-commissioning jobs (the premise of this guard)", () => {
    expect(PROJECTS.filter(fullScope).length).toBeLessThan(PROJECTS.length);
  });
  for (const locale of LOCALES) {
    it(`${locale}: the hub's description and lead do not claim design, programming and commissioning for all`, () => {
      const idx = getMessages(locale).projects.index;
      for (const text of [idx.seo.description, ...idx.intro]) expect(text).not.toMatch(FULL_SCOPE[locale]);
    });
  }
});
