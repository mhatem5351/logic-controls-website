/**
 * Content-honesty guards on the BUILT site (skipped when dist/ is absent, e.g. a fresh clone before `npm run build`).
 *
 * "Panels we have built" on the control-panels service page may only show case studies whose recorded scope includes
 * control-panel building (`services` contains "control-panels"). A programming-only or commissioning-only job shown
 * there would claim work the company did not do.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PROJECTS } from "~/data/projects";
import { LOCALES } from "~/i18n/config";

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
