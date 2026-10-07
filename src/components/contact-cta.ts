/**
 * Call-to-action pairs for heroes and closing bands (Hero.astro, CtaBand.astro).
 *
 * Locale rules (research/competitors-and-ux.md §4.7):
 *   ar     WhatsApp first and filled (how Egyptian plant teams reach suppliers), the quote form second (outline).
 *   en/tr  the quote form first, WhatsApp second.
 *   zh     the quote form first, email second (WhatsApp is blocked in mainland China).
 * A CTA's kind decides its icon and new-tab behaviour; pages may pass `kind`, otherwise it is read from the link.
 */
import { SITE } from "~/data/site";
import { getProject } from "~/data/projects";
import { getMessages, type Locale } from "~/i18n";
import type { IconName } from "./Icon.astro";
import { FOREIGN_PATH, QUOTE_PATH, fmt, href, mailtoLink, prefersEmail, prefersWhatsapp, whatsappLink, type MailContext } from "./nav";

export type CtaKind = "form" | "whatsapp" | "email" | "phone" | "link";
export interface Cta {
  label: string;
  href: string;
  kind?: CtaKind;
}

export function ctaKind(cta: Cta): CtaKind {
  if (cta.kind) return cta.kind;
  if (cta.href.startsWith("https://wa.me/")) return "whatsapp";
  if (cta.href.startsWith("mailto:")) return "email";
  if (cta.href.startsWith("tel:")) return "phone";
  return cta.href.includes("#quote") ? "form" : "link";
}

/**
 * The topic of a catalogue page for email subjects ("Automation project inquiry: Control panels"): the service,
 * industry or case-study title for services/<slug>, industries/<slug>, projects/<slug>; undefined elsewhere.
 */
export function pageTopic(locale: Locale, path: string): string | undefined {
  const m = getMessages(locale);
  const [section, slug] = path.replace(/^\/+|\/+$/g, "").split("/");
  if (!slug) return undefined;
  const pick = (items: unknown, ...keys: string[]) => {
    const it = (items as Record<string, Record<string, unknown> | undefined>)[slug];
    for (const k of keys) if (typeof it?.[k] === "string") return it[k] as string;
    return undefined;
  };
  if (section === "services") return pick(m.services.items, "navTitle", "title");
  if (section === "industries") return pick(m.industries.items, "navTitle", "title");
  if (section === "projects") return pick(m.projects.items, "cardTitle", "title");
  return undefined;
}

/** What the persistent actions (header button, drawer buttons, floating button) should carry on a page. */
export interface PageContact {
  /** Quote form link, preselecting the service / industry of a catalogue page ("/en/contact/?service=…#quote"). */
  quote: string;
  /** Pre-filled WhatsApp message (the same one the page's own CTAs use). */
  whatsapp: string;
  /** Email subject topic (service / industry / case-study title, or "Setting up in Egypt?"). */
  topic?: string;
  /** A stopped machine (maintenance and support): the urgent path leads. */
  urgent: boolean;
}

/**
 * Page context for the site chrome (UX2-11), from the locale-less path alone — the same rules the pages use for their
 * own CTAs (services/[slug], industries/[slug], projects/[slug], foreign-manufacturers, contact, the index pages), so a
 * lead that starts in the header or the drawer arrives with the same service / emergency context as one from the hero.
 */
export function pageContact(locale: Locale, path: string): PageContact {
  const m = getMessages(locale);
  const wa = m.common.whatsapp;
  const [section = "", slug] = path.replace(/^\/+|\/+$/g, "").split("/");
  const quoteWith = (query?: Record<string, string | undefined>) => {
    const [p = "", hash = ""] = QUOTE_PATH.split("#");
    const params = new URLSearchParams(Object.entries(query ?? {}).filter((e): e is [string, string] => !!e[1]));
    const qs = params.size ? `?${params.toString()}` : "";
    return `${href(locale, p)}${qs}${hash ? `#${hash}` : ""}`;
  };
  const items = (group: unknown) => (group as Record<string, { title?: string; navTitle?: string; cardTitle?: string } | undefined>)[slug ?? ""];
  /* tr / zh messages carry an English line for the team in Egypt: it can name the page in English ({serviceEn},
     {industryEn}, {projectEn} — UX2-24). Unused placeholders are simply ignored by fmt(). */
  const en = getMessages("en");
  if (section === "services" && slug && items(m.services.items)) {
    const it = items(m.services.items)!;
    const serviceEn = items(en.services.items)?.title ?? slug;
    const urgent = slug === "maintenance-support";
    return {
      quote: quoteWith({ service: slug }),
      whatsapp: urgent ? wa.stopped : fmt(wa.service, { service: it.title ?? slug, serviceEn }),
      topic: pageTopic(locale, path),
      urgent,
    };
  }
  if (section === "industries" && slug && items(m.industries.items)) {
    const it = items(m.industries.items)!;
    const industryEn = items(en.industries.items)?.title ?? slug;
    return { quote: quoteWith({ industry: slug }), whatsapp: fmt(wa.industry, { industry: it.title ?? slug, industryEn }), topic: pageTopic(locale, path), urgent: false };
  }
  if (section === "projects" && slug && items(m.projects.items)) {
    const it = items(m.projects.items)!;
    const e = items(en.projects.items);
    const projectEn = e?.cardTitle ?? e?.title ?? slug;
    /* the case study's own service / industry, and the case study named above the form (UX2-22, as the page CTAs) */
    const pr = getProject(slug);
    return {
      quote: quoteWith({ service: pr?.services[0], industry: pr?.industries[0], project: slug }),
      whatsapp: fmt(wa.project, { project: it.cardTitle ?? it.title ?? slug, projectEn }),
      topic: pageTopic(locale, path),
      urgent: false,
    };
  }
  if (section === FOREIGN_PATH) return { quote: quoteWith({ service: "new-factory" }), whatsapp: wa.foreign, topic: m.ui.nav.foreign, urgent: false };
  if (section === "contact" || section === "services") return { quote: quoteWith(), whatsapp: wa.quote, urgent: false };
  return { quote: quoteWith(), whatsapp: wa.default, urgent: false };
}

/**
 * The default "talk to an engineer" CTA — the one place that decides WhatsApp vs email (zh: email, WhatsApp is
 * blocked in mainland China). WhatsApp carries the given message. Email carries the page context when `mail` is given;
 * without it the link is a plain mailto (subject only), which <Hero>/<CtaBand> (placeCtas) complete with the page's
 * topic, body template and URL.
 */
export function contactCta(locale: Locale, opts: { whatsapp?: string; mail?: Omit<MailContext, "locale"> } = {}): Cta {
  const ui = getMessages(locale).ui;
  return prefersEmail(locale)
    ? { label: ui.cta.emailEngineer, href: opts.mail ? mailtoLink(ui.email.subject, { locale, ...opts.mail }) : mailtoLink(ui.email.subject), kind: "email" }
    : { label: ui.cta.whatsapp, href: whatsappLink(opts.whatsapp ?? ui.whatsapp.message), kind: "whatsapp" };
}

/**
 * The locale's short WhatsApp label for narrow containers (VIS2-21: tr "WhatsApp'tan yazın" for "Bir mühendise
 * WhatsApp'tan yazın"), when it is clearly shorter than `label`; undefined when the full label is short enough already.
 */
export function narrowWhatsapp(locale: Locale, label: string): string | undefined {
  const narrow = getMessages(locale).ui.cta.whatsappNarrow;
  return narrow && label.length > narrow.length + 6 ? narrow : undefined;
}

export interface PlacedCta {
  cta: Cta;
  kind: CtaKind;
  /** Filled (primary) button, or outline. */
  filled: boolean;
  icon?: IconName;
  iconEnd?: IconName;
  iconClass?: string;
  external: boolean;
  /** Shorter label for narrow phones (< 400px), when the locale's WhatsApp label would wrap there (tr, VIS2-21). The
   *  button renders both and CSS shows one, so the accessible name is always the visible text. */
  narrow?: string;
}

/**
 * Order and style a primary/secondary pair for the locale. On ar, a "quote form + WhatsApp" pair becomes WhatsApp
 * first (filled) and the form second (outline); any other pair (e.g. "call an engineer" first) keeps its order.
 */
export function placeCtas(
  locale: Locale,
  primary: Cta | false | undefined,
  secondary: Cta | false | undefined,
  /** Page context for email CTAs that arrive as a plain mailto (subject only): they get the topic + body template. */
  mail?: Omit<MailContext, "locale">,
): PlacedCta[] {
  const plainMailto = (c: Cta) => ctaKind(c) === "email" && c.href.startsWith(`mailto:${SITE.email}`) && !c.href.includes("body=");
  const list = [primary, secondary]
    .filter((c): c is Cta => !!c)
    .map((c) => (mail && plainMailto(c) ? { ...c, href: mailtoLink(getMessages(locale).ui.email.subject, { locale, ...mail }) } : c));
  if (prefersWhatsapp(locale) && list.length === 2 && ctaKind(list[0]!) === "form" && ctaKind(list[1]!) === "whatsapp") list.reverse();
  return list.map((cta, i) => {
    const kind = ctaKind(cta);
    const narrow = kind === "whatsapp" ? narrowWhatsapp(locale, cta.label) : undefined;
    const filled = i === 0 && list.length > 0;
    const icon: IconName | undefined = kind === "whatsapp" ? "whatsapp" : kind === "email" ? "mail" : kind === "phone" ? "phone" : undefined;
    return {
      cta,
      kind,
      filled,
      icon,
      iconEnd: !icon ? "arrow" : undefined,
      iconClass: kind === "whatsapp" ? (filled ? "text-white" : "text-whatsapp-500") : filled ? undefined : "text-royal-300",
      external: kind === "whatsapp",
      narrow,
    };
  });
}
