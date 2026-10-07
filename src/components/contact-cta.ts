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
import { getMessages, type Locale } from "~/i18n";
import type { IconName } from "./Icon.astro";
import { mailtoLink, prefersEmail, prefersWhatsapp, whatsappLink, type MailContext } from "./nav";

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
  const [section, slug] = path.split("/");
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

export interface PlacedCta {
  cta: Cta;
  kind: CtaKind;
  /** Filled (primary) button, or outline. */
  filled: boolean;
  icon?: IconName;
  iconEnd?: IconName;
  iconClass?: string;
  external: boolean;
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
    };
  });
}
