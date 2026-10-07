/**
 * "/" language redirect (Worker), legacy URLs (public/_redirects), trailing-slash handling, response headers
 * (public/_headers) and the multilingual 404 page — against the real Workers runtime (wrangler dev).
 * HTTP-level checks use the request fixture (no browser, run once: @desktop-only); the browser checks run everywhere.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test as base } from "@playwright/test";
import { test, expect } from "./fixtures";
import { LOCALES, ROOT } from "./helpers";

const location = (h: Record<string, string>) => {
  const u = new URL(h["location"]!, "https://x");
  return u.pathname + u.search;
};

base.describe("HTTP", { tag: "@desktop-only" }, () => {
  for (const [header, target] of [
    ["ar-EG,ar;q=0.9,en;q=0.8", "/ar/"],
    ["zh-CN,zh;q=0.9", "/zh/"],
    ["zh-TW,zh;q=0.8,en;q=0.5", "/zh/"],
    ["tr-TR,tr;q=0.9,en-US;q=0.8", "/tr/"],
    ["en-US,en;q=0.9", "/en/"],
    ["fr-FR,fr;q=0.9,de;q=0.8", "/en/"],
    ["", "/en/"],
  ] as const) {
    base(`GET / with Accept-Language "${header}" → 302 ${target}`, async ({ request }) => {
      const res = await request.get("/", { headers: { "Accept-Language": header }, maxRedirects: 0 });
      expect(res.status()).toBe(302);
      expect(location(res.headers())).toBe(target);
      expect(res.headers()["cache-control"]).toBe("private, no-store");
      expect(res.headers()["vary"]).toBe("Accept-Language, Cookie");
    });
  }

  base("the lang cookie beats Accept-Language; the query string survives", async ({ request }) => {
    const res = await request.get("/?utm_source=test", { headers: { "Accept-Language": "ar", Cookie: "lang=tr" }, maxRedirects: 0 });
    expect(res.status()).toBe(302);
    expect(location(res.headers())).toBe("/tr/?utm_source=test");
  });

  // Every rule of public/_redirects, so a typo in the file (or a dropped rule) fails here.
  const rules = readFileSync(join(ROOT, "public", "_redirects"), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split(/\s+/) as [string, string, string]);

  base("public/_redirects has the legacy rules", () => {
    expect(rules.length).toBeGreaterThanOrEqual(20);
  });

  // A real page below each splat target: locale aliases (`/zh-cn/*  /zh/:splat`) get a section, a section splat
  // (`/services/*  /en/services/:splat`) one of its pages — the target must answer 200.
  const SPLAT_SAMPLE: Record<string, string> = {
    "/en/services/": "process-control/",
    "/en/industries/": "food-beverage/",
    "/en/projects/": "milk-pasteurizer/",
    "/en/contact/": "thanks/",
  };
  const seen = new Set<string>();
  for (const [rawFrom, rawTo, status] of rules) {
    // Splat rules are checked with a real page below the prefix, and with the bare prefix.
    const samples = rawFrom.endsWith("/*") ? [SPLAT_SAMPLE[rawTo.replace(":splat", "")] ?? "services/", ""] : [null];
    for (const rest of samples) {
      const from = rest === null ? rawFrom : rawFrom.replace("*", rest);
      const to = rest === null ? rawTo : rawTo.replace(":splat", rest);
      // `/services/` is both an exact rule and the bare prefix of `/services/*`: test it once.
      if (seen.has(from)) continue;
      seen.add(from);
      base(`legacy ${from} → ${status} ${to}`, async ({ request }) => {
        const res = await request.get(from, { maxRedirects: 0 });
        expect(res.status()).toBe(Number(status));
        expect(location(res.headers())).toBe(to);
        if (to !== "/") expect((await request.get(to, { maxRedirects: 0 })).status()).toBe(200);
      });
    }
  }

  base("a locale-less section page reaches the English page; locale paths are never redirected", async ({ request }) => {
    // Without the trailing slash too (the splat rule, then the trailing-slash redirect).
    const res = await request.get("/services/control-panels");
    expect(res.status()).toBe(200);
    expect(new URL(res.url()).pathname).toBe("/en/services/control-panels/");
    for (const path of ["/ar/services/control-panels/", "/zh/industries/", "/tr/projects/milk-pasteurizer/", "/en/contact/"]) {
      expect((await request.get(path, { maxRedirects: 0 })).status(), path).toBe(200);
    }
    // An unknown page below a section is a 404 in its own locale, not a redirect.
    expect((await request.get("/ar/services/unknown-service/", { maxRedirects: 0 })).status()).toBe(404);
  });

  base("a page URL without the trailing slash redirects to the canonical one", async ({ request }) => {
    const res = await request.get("/en/services/process-control", { maxRedirects: 0 });
    expect([301, 307, 308]).toContain(res.status());
    expect(location(res.headers())).toBe("/en/services/process-control/");
  });

  base("unknown paths answer 404 with the multilingual 404 page (noindex)", async ({ request }) => {
    for (const path of ["/does-not-exist/", "/en/nope/", "/ar/services/unknown-service/"]) {
      const res = await request.get(path, { headers: { "Sec-Fetch-Mode": "navigate", Accept: "text/html" } });
      expect(res.status(), path).toBe(404);
      const html = await res.text();
      expect(html).toContain('name="robots" content="noindex');
      for (const l of LOCALES) expect(html, l).toContain(`href="/${l}/"`);
    }
  });

  base("/api/rfq answers 405 to GET", async ({ request }) => {
    const res = await request.get("/api/rfq", { maxRedirects: 0 });
    expect(res.status()).toBe(405);
    expect(res.headers()["allow"]).toBe("POST");
  });

  base("security headers on pages, immutable caching on hashed assets", async ({ request }) => {
    const page = await request.get("/en/");
    const h = page.headers();
    expect(h["content-security-policy"]).toContain("default-src 'self'");
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["strict-transport-security"]).toContain("max-age=31536000");
    const css = /href="(\/_astro\/[^"]+\.css)"/.exec(await page.text())?.[1];
    expect(css).toBeTruthy();
    expect((await request.get(css!)).headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
  });

  base("robots.txt and the sitemap index are served", async ({ request }) => {
    const robots = await request.get("/robots.txt");
    expect(robots.status()).toBe(200);
    expect(await robots.text()).toContain("Sitemap: https://logic-controls.com/sitemap-index.xml");
    expect((await request.get("/sitemap-index.xml")).status()).toBe(200);
  });
});

test.describe("browser", () => {
  test.use({ locale: "ar-EG" });

  test("a browser set to Arabic lands on /ar/ from /", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/ar\/$/);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });

  test.describe("404", () => {
    test.use({ allowConsole: [/status of 404/] });

    test("the 404 page offers every language's home page and key pages", async ({ page }) => {
      const res = await page.goto("/en/this-page-does-not-exist/");
      expect(res?.status()).toBe(404);
      await expect(page.locator("h1")).toHaveText(/404/);
      for (const l of LOCALES) {
        const block = page.locator(`li[lang]`).filter({ has: page.locator(`a[href="/${l}/"]`) });
        await expect(block).toHaveCount(1);
        await expect(block.locator(`a[href="/${l}/contact/#quote"]`)).toHaveCount(1);
      }
      await page.locator('a[href="/ar/"]').first().click();
      await expect(page).toHaveURL(/\/ar\/$/);
    });

    test("the 404 page names itself and suggests the closest real page in the picked language", async ({ page }) => {
      const msg = (locale: string, ns: string) =>
        JSON.parse(readFileSync(join(ROOT, `src/i18n/messages/${locale}/${ns}.json`), "utf8")) as {
          items: Record<string, { navTitle: string }>;
          breadcrumbs: Record<string, string>;
          notFound: { title: string };
        };
      const cases = [
        // typo in the section and the slug
        ["/en/servics/control-panel/", "/en/services/control-panels/", msg("en", "services").items["control-panels"]!.navTitle, "en"],
        // typo in the slug: a project is labelled with its path
        ["/ar/projects/milk-pasturizer/", "/ar/projects/milk-pasteurizer/", "/ar/projects/milk-pasteurizer/", "ar"],
        [
          "/zh/industries/pharmaceutcal/",
          "/zh/industries/pharmaceutical/",
          msg("zh", "industries").items["pharmaceutical"]!.navTitle,
          "zh",
        ],
        // no locale (and no redirect rule): the visitor's language — this browser is set to Arabic
        ["/servics/", "/ar/services/", msg("ar", "common").breadcrumbs["services"]!, "ar"],
      ] as const;
      for (const [path, href, label, locale] of cases) {
        expect((await page.goto(path))?.status(), path).toBe(404);
        await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName(`404 — ${msg(locale, "ui").notFound.title}`);
        const dym = page.locator("[data-suggest]:visible");
        await expect(dym, path).toHaveCount(1);
        await expect(page.locator(`#nf-list > li[data-l="${locale}"][data-primary] [data-suggest]`), path).toBeVisible();
        await expect(dym.locator("a"), path).toHaveAttribute("href", href);
        await expect(dym.locator("a"), path).toHaveText(label);
      }
      // Nothing close: no suggestion at all.
      expect((await page.goto("/en/qqqqq/"))?.status()).toBe(404);
      await expect(page.locator("[data-suggest]:visible")).toHaveCount(0);
      // The suggestion is a plain same-origin link.
      await page.goto("/en/servics/control-panel/");
      await page.locator("[data-suggest] a").first().click();
      await expect(page).toHaveURL(/\/en\/services\/control-panels\/$/);
    });
  });
});
