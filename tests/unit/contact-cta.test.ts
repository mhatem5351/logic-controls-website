/**
 * src/components/contact-cta.ts — the call-to-action rules of heroes and closing bands (Hero.astro, CtaBand.astro):
 *   contactCta  zh → email (WhatsApp is blocked in mainland China), every other locale → WhatsApp with the message
 *   placeCtas   ar: a "quote form + WhatsApp" pair becomes WhatsApp first (filled); every other pair keeps its order;
 *               icons / new-tab per kind; a plain mailto is completed with the page's topic + body template
 *   ctaKind     the kind from an explicit `kind`, else from the link
 *   pageTopic   the email subject topic of a catalogue page
 * (pageContact and mailtoLink: tests/unit/contact.test.ts.)
 */
import { describe, expect, it } from "vitest";
import { contactCta, ctaKind, pageTopic, placeCtas, type Cta } from "~/components/contact-cta";
import { SITE } from "~/data/site";
import { getMessages, type Locale } from "~/i18n";

const LOCALES: Locale[] = ["en", "ar", "zh", "tr"];
const query = (href: string, key: string) => new URL(href).searchParams.get(key);

const FORM: Cta = { label: "Request a quote", href: "/en/contact/#quote" };
const WA: Cta = { label: "WhatsApp", href: `https://wa.me/${SITE.whatsapp}?text=hi` };
const PHONE: Cta = { label: "Call", href: `tel:${SITE.phone.tel}` };
const MAIL: Cta = { label: "Email", href: `mailto:${SITE.email}?subject=Hi` };
const LINK: Cta = { label: "Learn more", href: "/en/about/" };

describe("ctaKind", () => {
  it("reads the kind from the link", () => {
    expect(ctaKind(WA)).toBe("whatsapp");
    expect(ctaKind(MAIL)).toBe("email");
    expect(ctaKind(PHONE)).toBe("phone");
    expect(ctaKind(FORM)).toBe("form");
    expect(ctaKind({ label: "", href: "/ar/contact/?service=control-panels#quote" })).toBe("form");
    expect(ctaKind(LINK)).toBe("link");
    expect(ctaKind({ label: "", href: "https://example.com/wa.me/" })).toBe("link");
  });

  it("an explicit kind wins over the link", () => {
    expect(ctaKind({ ...LINK, kind: "form" })).toBe("form");
    expect(ctaKind({ ...WA, kind: "link" })).toBe("link");
  });
});

describe("contactCta", () => {
  for (const locale of LOCALES) {
    const ui = getMessages(locale).ui;
    if (locale === "zh") {
      it("zh: email, never WhatsApp (blocked in mainland China)", () => {
        const c = contactCta("zh", { whatsapp: "ignored" });
        expect(c.kind).toBe("email");
        expect(c.label).toBe(ui.cta.emailEngineer);
        expect(c.href.startsWith(`mailto:${SITE.email}?`)).toBe(true);
        // plain mailto (subject only) without page context: placeCtas completes it
        expect(query(c.href, "subject")).toBe(ui.email.subject);
        expect(query(c.href, "body")).toBeNull();
        expect(c.href).not.toContain("wa.me");
      });

      it("zh: with page context the email carries the topic and the body template with the page URL", () => {
        const c = contactCta("zh", { mail: { topic: "控制柜", path: "services/control-panels" } });
        expect(query(c.href, "subject")).toBe(`${ui.email.subject}：控制柜`);
        expect(query(c.href, "body")).toContain(`${SITE.url}/zh/services/control-panels/`);
      });
    } else {
      it(`${locale}: WhatsApp with the default message, or the page's own`, () => {
        const c = contactCta(locale);
        expect(c.kind).toBe("whatsapp");
        expect(c.label).toBe(ui.cta.whatsapp);
        expect(c.href).toBe(`https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(ui.whatsapp.message)}`);
        const own = getMessages(locale).common.whatsapp.stopped;
        expect(query(contactCta(locale, { whatsapp: own }).href, "text")).toBe(own);
        // email context is irrelevant on WhatsApp locales
        expect(contactCta(locale, { mail: { topic: "x" } }).href).toBe(c.href);
      });
    }
  }
});

describe("placeCtas", () => {
  const order = (placed: ReturnType<typeof placeCtas>) => placed.map((p) => p.kind);

  it("ar: the quote form + WhatsApp pair becomes WhatsApp first (filled, white icon) and the form second (outline)", () => {
    const [a, b] = placeCtas("ar", FORM, WA);
    expect(a).toMatchObject({ cta: WA, kind: "whatsapp", filled: true, icon: "whatsapp", iconEnd: undefined, iconClass: "text-white", external: true });
    expect(b).toMatchObject({ cta: FORM, kind: "form", filled: false, icon: undefined, iconEnd: "arrow", iconClass: "text-royal-300", external: false });
  });

  for (const locale of ["en", "tr", "zh"] as const) {
    it(`${locale}: the quote form stays first (filled), WhatsApp second (outline, green icon)`, () => {
      const [a, b] = placeCtas(locale, FORM, WA);
      expect(a).toMatchObject({ cta: FORM, kind: "form", filled: true, iconEnd: "arrow", iconClass: undefined, external: false });
      expect(b).toMatchObject({ cta: WA, kind: "whatsapp", filled: false, icon: "whatsapp", iconClass: "text-whatsapp-500", external: true });
    });
  }

  it("ar: any other pair keeps its order (call an engineer first; WhatsApp already first; form + email)", () => {
    expect(order(placeCtas("ar", PHONE, WA))).toEqual(["phone", "whatsapp"]);
    expect(order(placeCtas("ar", WA, FORM))).toEqual(["whatsapp", "form"]);
    expect(order(placeCtas("ar", FORM, MAIL))).toEqual(["form", "email"]);
    expect(order(placeCtas("ar", LINK, WA))).toEqual(["link", "whatsapp"]);
  });

  it("icons per kind: WhatsApp / mail / phone glyphs at the start; forms and links get the arrow at the end", () => {
    const [phone, mail] = placeCtas("en", PHONE, MAIL);
    expect(phone).toMatchObject({ icon: "phone", iconEnd: undefined, filled: true, iconClass: undefined, external: false });
    expect(mail).toMatchObject({ icon: "mail", iconEnd: undefined, filled: false, iconClass: "text-royal-300", external: false });
    const [link] = placeCtas("en", LINK, undefined);
    expect(link).toMatchObject({ icon: undefined, iconEnd: "arrow" });
  });

  it("only WhatsApp opens a new tab (external)", () => {
    for (const c of [FORM, PHONE, MAIL, LINK]) expect(placeCtas("en", c, false)[0]!.external, c.href).toBe(false);
    expect(placeCtas("en", WA, false)[0]!.external).toBe(true);
  });

  it("missing actions are skipped: one action is the filled one; none → nothing", () => {
    expect(placeCtas("ar", false, WA)).toHaveLength(1);
    expect(placeCtas("ar", false, WA)[0]).toMatchObject({ kind: "whatsapp", filled: true });
    expect(placeCtas("en", undefined, FORM)[0]).toMatchObject({ kind: "form", filled: true });
    expect(placeCtas("en", false, undefined)).toEqual([]);
  });

  it("a plain mailto to the main address is completed with the page topic, body template and URL when context is given", () => {
    const mail = { topic: "Control panels", path: "services/control-panels" };
    const [placed] = placeCtas("en", MAIL, false, mail);
    expect(query(placed!.cta.href, "subject")).toBe("Automation project inquiry: Control panels");
    expect(query(placed!.cta.href, "body")).toContain(`${SITE.url}/en/services/control-panels/`);
    expect(placed!.cta.label).toBe(MAIL.label);
    // the caller's object is not mutated
    expect(MAIL.href).toBe(`mailto:${SITE.email}?subject=Hi`);
  });

  it("left alone: without context, a mailto that already has a body, another address, and non-email actions", () => {
    expect(placeCtas("en", MAIL, false)[0]!.cta.href).toBe(MAIL.href);
    const withBody: Cta = { label: "Email", href: `mailto:${SITE.email}?subject=A&body=B` };
    expect(placeCtas("en", withBody, false, { topic: "T" })[0]!.cta.href).toBe(withBody.href);
    const sales: Cta = { label: "Sales", href: `mailto:${SITE.salesEmail}?subject=A` };
    expect(placeCtas("en", sales, false, { topic: "T" })[0]!.cta.href).toBe(sales.href);
    expect(placeCtas("en", FORM, WA, { topic: "T" }).map((p) => p.cta)).toEqual([FORM, WA]);
  });

  it("zh: the default contact CTA (plain mailto) placed with page context gets the localized topic subject", () => {
    const [form, mail] = placeCtas("zh", { label: "报价", href: "/zh/contact/#quote" }, contactCta("zh"), { topic: "控制柜", path: "services/control-panels" });
    expect(form!.filled).toBe(true);
    expect(mail).toMatchObject({ kind: "email", filled: false, icon: "mail" });
    expect(query(mail!.cta.href, "subject")).toBe(`${getMessages("zh").ui.email.subject}：控制柜`);
    expect(query(mail!.cta.href, "body")).toContain(`${SITE.url}/zh/services/control-panels/`);
  });
});

describe("pageTopic", () => {
  for (const locale of LOCALES) {
    const m = getMessages(locale);
    it(`${locale}: the short title of a service / industry / case study; nothing elsewhere`, () => {
      expect(pageTopic(locale, "services/control-panels")).toBe(m.services.items["control-panels"].navTitle);
      expect(pageTopic(locale, "industries/food-beverage")).toBe(m.industries.items["food-beverage"].navTitle);
      expect(pageTopic(locale, "projects/milk-pasteurizer")).toBe(m.projects.items["milk-pasteurizer"].cardTitle);
      expect(pageTopic(locale, "services/control-panels/")).toBe(m.services.items["control-panels"].navTitle);
      for (const path of ["", "services", "services/", "about", "contact", "foreign-manufacturers", "services/nope", "projects/nope", "about/team"]) {
        expect(pageTopic(locale, path), path).toBeUndefined();
      }
    });
  }
});
