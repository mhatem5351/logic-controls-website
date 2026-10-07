/**
 * Site navigation model shared by Header, Footer and Breadcrumbs, plus the contact-link builders (mailto / WhatsApp).
 * Paths are locale-less (pass through `localePath(locale, path)`); labels are keys of `ui.nav`.
 * Service and industry lists are data-driven: every slug in src/data/{services,industries}.ts, labelled with its
 * `items[slug].navTitle` (one source of truth for the header menus, the mobile drawer and the footer).
 */
import { LOCALES, LOCALE_META, getMessages, localePath, type Locale, type Messages } from "~/i18n";
import { SITE, whatsappLink } from "~/data/site";
import { SERVICE_SLUGS, type ServiceSlug } from "~/data/services";
import { INDUSTRY_SLUGS, type IndustrySlug } from "~/data/industries";
import { fmt } from "~/lib/format";

export const MAIN_NAV = [
  { key: "services", path: "services", menu: "services" },
  { key: "industries", path: "industries", menu: "industries" },
  { key: "projects", path: "projects" },
  { key: "about", path: "about" },
  { key: "contact", path: "contact" },
] as const satisfies ReadonlyArray<{ key: keyof Messages["ui"]["nav"]; path: string; menu?: "services" | "industries" }>;

export const FOREIGN_PATH = "foreign-manufacturers";
export const QUOTE_PATH = "contact/#quote";

export interface NavLink<S extends string = string> {
  slug: S;
  /** Locale-less path, e.g. "services/control-panels". */
  path: string;
  label: string;
}

/** All services, in catalogue order, labelled with their short navigation title. */
export function serviceNav(locale: Locale): NavLink<ServiceSlug>[] {
  const items = getMessages(locale).services.items as Record<string, { navTitle?: string; title?: string } | undefined>;
  return SERVICE_SLUGS.filter((slug) => items[slug]).map((slug) => ({
    slug,
    path: `services/${slug}`,
    label: items[slug]?.navTitle ?? items[slug]?.title ?? slug,
  }));
}

/** All industries, in display order, labelled with their short navigation title. */
export function industryNav(locale: Locale): NavLink<IndustrySlug>[] {
  const items = getMessages(locale).industries.items as Record<string, { navTitle?: string; title?: string } | undefined>;
  return INDUSTRY_SLUGS.filter((slug) => items[slug]).map((slug) => ({
    slug,
    path: `industries/${slug}`,
    label: items[slug]?.navTitle ?? items[slug]?.title ?? slug,
  }));
}

/**
 * @deprecated The first four services / industries keyed to `ui.nav.servicesList` / `industriesList` (styleguide only).
 * Use serviceNav(locale) / industryNav(locale), which list every slug.
 */
export const SERVICE_LINKS = [
  { key: "controlPanels", path: "services/control-panels" },
  { key: "plcHmi", path: "services/plc-hmi-programming" },
  { key: "machineAutomation", path: "services/machine-automation" },
  { key: "commissioning", path: "services/testing-commissioning" },
] as const;

/** @deprecated See SERVICE_LINKS. */
export const INDUSTRY_LINKS = [
  { key: "foodBeverage", path: "industries/food-beverage", icon: "bottle" },
  { key: "pharma", path: "industries/pharmaceutical", icon: "flask" },
  { key: "cosmetics", path: "industries/cosmetics-personal-care", icon: "droplet" },
  { key: "packaging", path: "industries/packaging-labeling", icon: "box" },
] as const;

/** Locale-prefixed href that keeps an optional #hash: href("ar", "contact/#quote") → "/ar/contact/#quote". */
export function href(locale: Locale, path = ""): string {
  const [p = "", hash] = path.split("#");
  return localePath(locale, p) + (hash ? `#${hash}` : "");
}

/** Is `itemPath` the current page ("page") or an ancestor section ("true")? */
export function currentState(itemPath: string, currentPath: string): "page" | "true" | undefined {
  const a = itemPath.replace(/^\/+|\/+$/g, "");
  const b = currentPath.replace(/^\/+|\/+$/g, "");
  if (a === b) return "page";
  if (a && b.startsWith(`${a}/`)) return "true";
  return undefined;
}

/** All four language versions of the current page, for the switcher and hreflang. */
export function languageLinks(path: string) {
  return LOCALES.map((l) => ({ locale: l, href: localePath(l, path), ...LOCALE_META[l] }));
}

/** Replace {placeholders} in a message (re-exported from ~/lib/format, the site's one placeholder engine). */
export { fmt };

/** WhatsApp is blocked in mainland China: zh pages use email instead. */
export function prefersEmail(locale: Locale) {
  return locale === "zh";
}

/** Arabic pages lead with WhatsApp (how Egyptian plant teams reach suppliers); the others lead with the quote form. */
export function prefersWhatsapp(locale: Locale) {
  return locale === "ar";
}

/** zh / tr visitors are mostly foreign investors and machine builders: their home page leads with the "setting up in
 *  Egypt" path (hero secondary action, foreign door first), and the header does not repeat it there. */
export function investorFirst(locale: Locale) {
  return locale === "zh" || locale === "tr";
}

/** The machine-builder (OEM) block of the foreign-manufacturers page. */
export const OEM_PATH = `${FOREIGN_PATH}#oem`;

/** Page context for an email link: what the visitor was reading, so the team knows what the email is about. */
export interface MailContext {
  locale: Locale;
  /** Service, industry or case-study title. Appended to the subject ("Automation project inquiry: Control panels"). */
  topic?: string;
  /** Locale-less path of the page the link sits on ("services/control-panels"): its URL goes into the body. */
  path?: string;
  /** Pre-fill the short "what to include" body template (default true). */
  body?: boolean;
}

/**
 * mailto: link to the main address.
 *  - mailtoLink(subject?) — as before: optional subject only.
 *  - mailtoLink(subject?, context) — localised subject with the page topic, plus a short body template
 *    (machine / location / need / timeline, a nudge to attach photos, and the page URL).
 * Line breaks are CRLF (RFC 6068); everything is percent-encoded.
 */
export function mailtoLink(subject?: string, context?: MailContext): string {
  if (!context) return `mailto:${SITE.email}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`;
  const m = getMessages(context.locale).ui.email;
  const base = subject ?? m.subject;
  const topic = context.topic?.trim();
  const finalSubject = topic ? fmt(m.subjectTopic, { subject: base, topic }) : base;
  const params = [`subject=${encodeURIComponent(finalSubject)}`];
  if (context.body !== false) {
    /* RTL bodies ("الصفحة: https://…/ar/…/"): the line is an RTL paragraph, so the URL's trailing "/" (neutral, before
       the paragraph end) would be drawn at the URL's visual start. A LEFT-TO-RIGHT MARK after it keeps it in place. */
    const lrm = LOCALE_META[context.locale].dir === "rtl" ? "‎" : "";
    const url = context.path !== undefined ? new URL(localePath(context.locale, context.path), SITE.url).href : undefined;
    const page = url === undefined ? undefined : url + lrm;
    const body = m.body
      .split("\n")
      .filter((line) => page !== undefined || !line.includes("{page}"))
      .map((line) => fmt(line, { page }))
      .join("\r\n");
    params.push(`body=${encodeURIComponent(body)}`);
  }
  return `mailto:${SITE.email}?${params.join("&")}`;
}

export { whatsappLink };
