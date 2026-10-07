import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const SITE = "https://logic-controls.com";

export const LOCALES = ["en", "ar", "zh", "tr"] as const;
export type Locale = (typeof LOCALES)[number];
export const META: Record<Locale, { lang: string; dir: "ltr" | "rtl"; hreflang: string }> = {
  en: { lang: "en", dir: "ltr", hreflang: "en" },
  ar: { lang: "ar", dir: "rtl", hreflang: "ar" },
  zh: { lang: "zh-Hans", dir: "ltr", hreflang: "zh-Hans" },
  tr: { lang: "tr", dir: "ltr", hreflang: "tr" },
};

/** Every URL path of the production sitemap (dist/sitemap-0.xml). */
export function sitemapPaths(): string[] {
  const xml = readFileSync(join(ROOT, "dist", "sitemap-0.xml"), "utf8");
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname);
}

/** One page of every page type (path without the locale prefix). */
export const PAGE_TYPES: Record<string, string> = {
  home: "",
  about: "about/",
  services: "services/",
  service: "services/process-control/",
  industries: "industries/",
  industry: "industries/food-beverage/",
  projects: "projects/",
  project: "projects/beverage-syrup-jet-mixing/",
  technologies: "technologies/",
  foreign: "foreign-manufacturers/",
  contact: "contact/",
  thanks: "contact/thanks/",
  privacy: "privacy/",
};

/** Display width of a title: CJK / full-width characters count as 2 (what fits a search result line). */
export const titleWidth = (s: string) => [...s].reduce((n, c) => n + (/[　-鿿豈-﫿＀-￯]/.test(c) ? 2 : 1), 0);

/** Email files the local send_email binding wrote (wrangler dev → .wrangler/tmp/email/<session>/email-{text,html}/). */
export function emailFiles(kind: "text" | "html"): string[] {
  const out: string[] = [];
  const dir = join(ROOT, ".wrangler", "tmp", "email");
  const walk = (d: string) => {
    if (!existsSync(d)) return;
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (new RegExp(`[\\\\/]email-${kind}[\\\\/]`).test(p)) out.push(p);
    }
  };
  walk(dir);
  return out;
}

/** The email (text + html) whose text part contains `stamp`; polls because the binding writes asynchronously. */
export async function findEmail(stamp: string, timeoutMs = 10_000): Promise<{ text: string; html: string }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const f of emailFiles("text")) {
      const text = readFileSync(f, "utf8");
      if (!text.includes(stamp)) continue;
      const htmlFile = f.replace(/email-text([/\\])/, "email-html$1").replace(/\.txt$/, ".html");
      // The binding writes the text part first, then the HTML part: wait until the HTML part is there AND written (a
      // file that exists can still be empty for a moment; it carries the same stamp), unless time is up.
      const html = existsSync(htmlFile) ? readFileSync(htmlFile, "utf8") : "";
      if (!html.includes(stamp) && Date.now() - start < timeoutMs - 500) continue;
      return { text, html };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No email containing ${stamp} under .wrangler/tmp/email/`);
}

/** Is the viewport below the desktop navigation breakpoint (lg = 1024px)? */
export const isNarrow = (page: Page) => (page.viewportSize()?.width ?? 1440) < 1024;
