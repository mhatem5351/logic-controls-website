/**
 * Site navigation model shared by Header, Footer and Breadcrumbs.
 * Paths are locale-less (pass through `localePath(locale, path)`); labels are keys of `ui.nav`.
 */
import { LOCALES, LOCALE_META, localePath, type Locale, type Messages } from "~/i18n";
import { SITE, whatsappLink } from "~/data/site";

export const MAIN_NAV = [
  { key: "services", path: "services" },
  { key: "industries", path: "industries" },
  { key: "projects", path: "projects" },
  { key: "about", path: "about" },
  { key: "contact", path: "contact" },
] as const satisfies ReadonlyArray<{ key: keyof Messages["ui"]["nav"]; path: string }>;

export const FOREIGN_PATH = "foreign-manufacturers";
export const QUOTE_PATH = "contact/#quote";

export const SERVICE_LINKS = [
  { key: "controlPanels", path: "services/control-panels" },
  { key: "plcHmi", path: "services/plc-hmi-programming" },
  { key: "machineAutomation", path: "services/machine-automation" },
  { key: "commissioning", path: "services/testing-commissioning" },
] as const;

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

/** Replace {placeholders} in a message. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/** WhatsApp is blocked in mainland China: zh pages use email instead. */
export function prefersEmail(locale: Locale) {
  return locale === "zh";
}

export function mailtoLink(subject?: string) {
  return `mailto:${SITE.email}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`;
}

export { whatsappLink };
