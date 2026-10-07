/**
 * Every URL of the production sitemap: 200, <html lang dir>, one <h1>, title / description, canonical, hreflang,
 * no console errors (fixture). Desktop runs the full sitemap; the mobile projects run one page of every type in en + ar
 * (the rest is tagged @desktop-only — the markup checks do not depend on the viewport).
 */
import { test, expect } from "./fixtures";
import { LOCALES, META, PAGE_TYPES, SITE, sitemapPaths, titleWidth, type Locale } from "./helpers";

const paths = sitemapPaths();
/** Phones: one page of every type in English and Arabic (LTR + RTL). */
const sample = new Set((["en", "ar"] as const).flatMap((l) => Object.values(PAGE_TYPES).map((p) => `/${l}/${p}`)));

test("the sitemap lists every page in every locale", { tag: "@desktop-only" }, () => {
  expect(paths.length).toBeGreaterThanOrEqual(150);
  for (const l of LOCALES) {
    const rests = new Set(paths.filter((p) => p.startsWith(`/${l}/`)).map((p) => p.slice(l.length + 1)));
    expect(rests.size, l).toBe(paths.length / LOCALES.length);
  }
});

for (const path of paths) {
  const locale = path.split("/")[1] as Locale;
  const rest = path.slice(locale.length + 2);
  const tag = sample.has(path) ? [] : ["@desktop-only"];

  test(`smoke ${path}`, { tag }, async ({ page }) => {
    const res = await page.goto(path, { waitUntil: "load" });
    expect(res?.status()).toBe(200);

    const head = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      h1: document.querySelectorAll("h1").length,
      h1Text: document.querySelector("h1")?.textContent?.trim() ?? "",
      title: document.title,
      description: document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ?? "",
      canonical: document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.getAttribute("href"),
      robots: document.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content ?? "",
      alternates: [...document.querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]')].map((l) => [l.hreflang, l.getAttribute("href")]),
    }));

    expect(head.lang).toBe(META[locale].lang);
    expect(head.dir).toBe(META[locale].dir);
    expect(head.h1, "exactly one <h1>").toBe(1);
    expect(head.h1Text).not.toBe("");
    expect(head.title).toMatch(/\S/);
    // Search results cut titles by rendered width (~600px of 20px Arial), not by characters: the content rules
    // (src/i18n/CONTENT.md) size titles that way, so a 62-character Arabic title can fit where a CJK one cannot.
    const titlePx = await page.evaluate((t) => {
      const c = document.createElement("canvas").getContext("2d")!;
      c.font = "20px Arial";
      return Math.round(c.measureText(t).width);
    }, head.title);
    expect(titlePx, `title "${head.title}" rendered width (20px Arial)`).toBeLessThanOrEqual(600);
    expect(head.description.trim()).not.toBe("");
    expect(titleWidth(head.description), "meta description width").toBeLessThanOrEqual(160);
    expect(head.robots).not.toMatch(/noindex/);
    expect(head.canonical).toBe(SITE + path);

    // x-default: the language-negotiating root for the home pages, the English page elsewhere.
    const xDefault = rest ? `${SITE}/en/${rest}` : `${SITE}/`;
    const expected = [...LOCALES.map((l) => [META[l].hreflang, `${SITE}/${l}/${rest}`]), ["x-default", xDefault]];
    expect(head.alternates).toHaveLength(5);
    expect([...head.alternates].sort()).toEqual([...expected].sort());
  });
}

test("thanks pages are noindex, out of the sitemap, and localized", { tag: "@desktop-only" }, async ({ page }) => {
  for (const l of LOCALES) {
    const res = await page.goto(`/${l}/contact/thanks/`);
    expect(res?.status()).toBe(200);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.locator("html")).toHaveAttribute("lang", META[l].lang);
    expect(paths).not.toContain(`/${l}/contact/thanks/`);
  }
});
