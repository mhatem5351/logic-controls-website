import { LOCALES, LOCALE_META, type Locale } from "./config";

export * from "./config";

/**
 * Messages live in src/i18n/messages/<locale>/<namespace>.json.
 * English is the source of truth; every other locale must have the same shape (scripts/check-i18n.mjs).
 */
const files = import.meta.glob<Record<string, unknown>>("./messages/*/*.json", { eager: true, import: "default" });

import type enUi from "./messages/en/ui.json";
import type enSeo from "./messages/en/seo.json";

/** Extend this as namespaces are added (keeps `t.<ns>.<key>` fully typed from the English files). */
export interface Messages {
  ui: typeof enUi;
  seo: typeof enSeo;
  [namespace: string]: any;
}

const MESSAGES = Object.fromEntries(
  LOCALES.map((locale) => {
    const entries = Object.entries(files)
      .filter(([path]) => path.startsWith(`./messages/${locale}/`))
      .map(([path, json]) => [path.split("/").pop()!.replace(/\.json$/, ""), json]);
    return [locale, Object.fromEntries(entries)];
  }),
) as Record<Locale, Messages>;

export function getMessages(locale: Locale): Messages {
  return MESSAGES[locale];
}

/** Locale-prefixed path with a trailing slash: localePath("ar", "services/control-panels") → "/ar/services/control-panels/". */
export function localePath(locale: Locale, path = ""): string {
  const clean = path.replace(/^\/+|\/+$/g, "");
  return clean ? `/${locale}/${clean}/` : `/${locale}/`;
}

/** Strip the locale prefix from a pathname: "/ar/services/" → "services". */
export function pathWithoutLocale(pathname: string): string {
  return pathname.replace(/^\/(en|ar|zh|tr)(\/|$)/, "").replace(/\/+$/, "");
}

/** Static paths for a page that exists in every locale. */
export function localeStaticPaths() {
  return LOCALES.map((lang) => ({ params: { lang } }));
}

export function dirOf(locale: Locale) {
  return LOCALE_META[locale].dir;
}
