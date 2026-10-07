/**
 * Accessibility: axe-core (WCAG 2.0 / 2.1 / 2.2, levels A + AA) on one page of every type in every locale (phones:
 * en + ar), plus the 404 page and open UI states — zero violations. Reduced motion, so entrance animations never leave text mid-fade during the scan.
 * The Turnstile iframe is third-party and excluded.
 */
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { LOCALES, PAGE_TYPES } from "./helpers";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
test.use({ reducedMotion: "reduce" });

async function scan(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).exclude(".cf-turnstile").analyze();
  return violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.slice(0, 5).map((n) => `${n.target.join(" ")} — ${n.failureSummary?.split("\n")[1]?.trim() ?? ""}`),
  }));
}

for (const locale of LOCALES) {
  // Phones scan both scripts / directions (en, ar); desktop scans all four locales.
  const tag = locale === "en" || locale === "ar" ? [] : ["@desktop-only"];
  for (const [type, rest] of Object.entries(PAGE_TYPES)) {
    test(`axe ${type} (/${locale}/${rest})`, { tag }, async ({ page }) => {
      await page.goto(`/${locale}/${rest}`);
      expect(await scan(page)).toEqual([]);
    });
  }
}

test.describe("404", () => {
  test.use({ allowConsole: [/status of 404/] });
  test("axe 404 page", async ({ page }) => {
    await page.goto("/en/missing-page/");
    expect(await scan(page)).toEqual([]);
  });
});

// One scan per open state: each axe pass on WebKit mobile takes several seconds on a 2-vCPU CI runner, so four
// scans in one test exceeded the 30 s budget there.
test.describe("axe: open states", () => {
  test("form with validation errors", async ({ page }) => {
    await page.goto("/en/contact/");
    await page.locator("[data-next]").click();
    await expect(page.locator("[data-alert]")).toBeVisible();
    expect(await scan(page), "form with validation errors").toEqual([]);
  });

  test("zone card open", async ({ page }) => {
    test.slow(); // full-page axe on the long Arabic home page is slow on WebKit mobile in CI
    await page.goto("/ar/");
    const zones = page.locator("[data-zones]").first();
    await zones.scrollIntoViewIfNeeded();
    await zones.locator('button.lc-zm-pin[data-zone="obour"]').click();
    await expect(zones.locator('[data-card="obour"]')).toBeVisible();
    expect(await scan(page), "zone card open").toEqual([]);
  });

  test("phone drawer open", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 1440) >= 1024, "the drawer only exists below 1024px");
    await page.goto("/ar/");
    await page.locator(".lc-menu-open").click();
    await expect(page.locator("#lc-drawer")).toBeVisible();
    expect(await scan(page), "drawer open").toEqual([]);
  });

  test("lightbox open", async ({ page }) => {
    await page.goto("/zh/projects/pasteurizer-cip-recipes/");
    await page.locator("[data-gallery] a[data-full]").first().click();
    const lightbox = page.locator(".lc-lightbox");
    await expect(lightbox).toBeVisible();
    // axe cannot see ::backdrop: the full-size dialog is transparent over a navy-950/95 backdrop, so paint that
    // same colour on the dialog itself for the scan (otherwise axe measures the text against the white page behind).
    await lightbox.evaluate((d) => (d.style.backgroundColor = getComputedStyle(d, "::backdrop").backgroundColor));
    expect(await scan(page), "lightbox open").toEqual([]);
  });
});

test("axe self-check: an injected violation is reported (the scan is really running)", { tag: "@desktop-only" }, async ({ page }) => {
  await page.goto("/en/about/");
  await page.evaluate(() => {
    const img = document.createElement("img");
    img.src = "/favicon.svg";
    document.querySelector("main")!.append(img); // no alt
  });
  expect((await scan(page)).map((v) => v.id)).toContain("image-alt");
});
