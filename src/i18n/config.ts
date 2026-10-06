export const LOCALES = ["en", "ar", "zh", "tr"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

interface LocaleMeta {
  /** Name of the language written in itself — used in the language switcher. */
  native: string;
  /** Value for <html lang>. */
  htmlLang: string;
  /** hreflang value (sitemap + <link rel=alternate>). */
  hreflang: string;
  dir: "ltr" | "rtl";
  /** Open Graph locale. */
  og: string;
  /** Cloudflare Turnstile widget language. */
  turnstile: string;
}

export const LOCALE_META: Record<Locale, LocaleMeta> = {
  en: { native: "English", htmlLang: "en", hreflang: "en", dir: "ltr", og: "en_US", turnstile: "en" },
  ar: { native: "العربية", htmlLang: "ar", hreflang: "ar", dir: "rtl", og: "ar_EG", turnstile: "ar-eg" },
  zh: { native: "中文", htmlLang: "zh-Hans", hreflang: "zh-Hans", dir: "ltr", og: "zh_CN", turnstile: "zh-cn" },
  tr: { native: "Türkçe", htmlLang: "tr", hreflang: "tr", dir: "ltr", og: "tr_TR", turnstile: "tr" },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}
