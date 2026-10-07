/**
 * src/components/contact-cta.ts pageContact() — the context the persistent chrome actions carry (header button,
 * drawer, floating button, footer) — and src/components/nav.ts mailtoLink() for RTL bodies.
 */
import { describe, expect, it } from "vitest";
import { pageContact } from "~/components/contact-cta";
import { mailtoLink } from "~/components/nav";
import { getProject } from "~/data/projects";
import { getMessages, type Locale } from "~/i18n";
import { fmt } from "~/lib/format";

const LOCALES: Locale[] = ["en", "ar", "zh", "tr"];
const en = getMessages("en");
/** tr / zh messages add an English line for the team in Egypt, which names the page in English (UX2-24). */
const englishLine = (locale: Locale) => locale === "tr" || locale === "zh";

describe("pageContact", () => {
  for (const locale of LOCALES) {
    const m = getMessages(locale);
    const wa = m.common.whatsapp;

    it(`${locale}: a service page preselects the service and names it in the WhatsApp message`, () => {
      const c = pageContact(locale, "services/control-panels");
      expect(c.quote).toBe(`/${locale}/contact/?service=control-panels#quote`);
      const service = m.services.items["control-panels"].title;
      const serviceEn = en.services.items["control-panels"].title;
      expect(c.whatsapp).toBe(fmt(wa.service, { service, serviceEn }));
      expect(c.whatsapp).toContain(service);
      if (englishLine(locale)) expect(c.whatsapp).toContain(serviceEn);
      expect(c.topic).toBeTruthy();
      expect(c.urgent).toBe(false);
    });

    it(`${locale}: maintenance and support is the urgent path ("machine stopped" message)`, () => {
      const c = pageContact(locale, "services/maintenance-support/");
      expect(c.urgent).toBe(true);
      expect(c.whatsapp).toBe(wa.stopped);
      expect(c.quote).toContain("?service=maintenance-support#quote");
    });

    it(`${locale}: industry, case study, foreign-manufacturers, contact and other pages`, () => {
      const i = pageContact(locale, "industries/food-beverage");
      expect(i.quote).toBe(`/${locale}/contact/?industry=food-beverage#quote`);
      const industry = m.industries.items["food-beverage"].title;
      const industryEn = en.industries.items["food-beverage"].title;
      expect(i.whatsapp).toBe(fmt(wa.industry, { industry, industryEn }));
      if (englishLine(locale)) expect(i.whatsapp).toContain(industryEn);
      // a case study: its message names it; the form preselects its (first) service and industry and names it (UX2-22)
      const p = pageContact(locale, "projects/milk-pasteurizer");
      expect(p.whatsapp).toContain(m.projects.items["milk-pasteurizer"].cardTitle);
      if (englishLine(locale)) expect(p.whatsapp).toContain(en.projects.items["milk-pasteurizer"].cardTitle);
      const project = getProject("milk-pasteurizer")!;
      expect(p.quote).toBe(`/${locale}/contact/?service=${project.services[0]}&industry=${project.industries[0]}&project=milk-pasteurizer#quote`);
      const f = pageContact(locale, "foreign-manufacturers");
      expect(f.quote).toBe(`/${locale}/contact/?service=new-factory#quote`);
      expect(f.whatsapp).toBe(wa.foreign);
      expect(pageContact(locale, "contact").whatsapp).toBe(wa.quote);
      expect(pageContact(locale, "").whatsapp).toBe(wa.default);
      expect(pageContact(locale, "about").whatsapp).toBe(wa.default);
      // unknown slugs fall back to the generic context
      expect(pageContact(locale, "services/nope").quote).toBe(`/${locale}/contact/#quote`);
    });

    it(`${locale}: index pages and the contact pages ask for a quote; only maintenance and support is urgent`, () => {
      for (const path of ["services", "services/", "contact", "contact/thanks"]) {
        const c = pageContact(locale, path);
        expect(c, path).toEqual({ quote: `/${locale}/contact/#quote`, whatsapp: wa.quote, urgent: false });
      }
      for (const path of ["industries", "projects", "about", "technologies", "privacy"]) {
        expect(pageContact(locale, path), path).toEqual({ quote: `/${locale}/contact/#quote`, whatsapp: wa.default, urgent: false });
      }
      for (const path of ["services/control-panels", "industries/pharmaceutical", "projects/milk-pasteurizer", "foreign-manufacturers", "contact", ""]) {
        expect(pageContact(locale, path).urgent, path).toBe(false);
      }
    });

    it(`${locale}: the email topic is the page's short title (service / industry / case study) or "foreign manufacturers"`, () => {
      expect(pageContact(locale, "services/control-panels").topic).toBe(m.services.items["control-panels"].navTitle);
      expect(pageContact(locale, "services/maintenance-support").topic).toBe(m.services.items["maintenance-support"].navTitle);
      expect(pageContact(locale, "industries/food-beverage").topic).toBe(m.industries.items["food-beverage"].navTitle);
      expect(pageContact(locale, "projects/milk-pasteurizer").topic).toBe(m.projects.items["milk-pasteurizer"].cardTitle);
      expect(pageContact(locale, "foreign-manufacturers").topic).toBe(m.ui.nav.foreign);
      expect(pageContact(locale, "contact").topic).toBeUndefined();
      expect(pageContact(locale, "").topic).toBeUndefined();
    });

    it(`${locale}: a trailing slash does not matter; unknown industry / project slugs fall back to the generic context`, () => {
      expect(pageContact(locale, "services/control-panels/")).toEqual(pageContact(locale, "services/control-panels"));
      expect(pageContact(locale, "industries/food-beverage/")).toEqual(pageContact(locale, "industries/food-beverage"));
      expect(pageContact(locale, "foreign-manufacturers/")).toEqual(pageContact(locale, "foreign-manufacturers"));
      expect(pageContact(locale, "industries/nope")).toEqual({ quote: `/${locale}/contact/#quote`, whatsapp: wa.default, urgent: false });
      expect(pageContact(locale, "projects/nope")).toEqual({ quote: `/${locale}/contact/#quote`, whatsapp: wa.default, urgent: false });
    });

    it(`${locale}: no placeholder is left unfilled`, () => {
      for (const path of ["services/plc-hmi-programming", "industries/pharmaceutical", "projects/milk-pasteurizer", "foreign-manufacturers", ""]) {
        expect(pageContact(locale, path).whatsapp).not.toMatch(/\{\w+\}/);
      }
    });
  }
});

describe("mailtoLink: RTL bodies", () => {
  const body = (href: string) => decodeURIComponent(new URL(href).searchParams.get("body") ?? "");
  it("ar: a LEFT-TO-RIGHT MARK follows the page URL, so its trailing slash stays at the end in RTL mail clients", () => {
    const b = body(mailtoLink(undefined, { locale: "ar", path: "services/control-panels" }));
    expect(b).toContain("https://logic-controls.com/ar/services/control-panels/‎");
  });
  it("en / zh / tr: no mark", () => {
    for (const locale of ["en", "zh", "tr"] as const) expect(body(mailtoLink(undefined, { locale, path: "about" }))).not.toContain("‎");
  });
  it("lines are CRLF-separated and the topic goes into the subject", () => {
    const href = mailtoLink(undefined, { locale: "en", path: "services/control-panels", topic: "Control panels" });
    expect(new URL(href).searchParams.get("subject")).toBe("Automation project inquiry: Control panels");
    expect(body(href)).toContain("\r\n");
  });
});
