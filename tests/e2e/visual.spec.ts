/**
 * Visual regression (optional, local): `npm run test:visual`. Tagged @visual, excluded from the default run and CI.
 * Screenshots differ per OS / font rendering, so baselines are machine-local (tests/e2e/__screenshots__/, git-ignored):
 *   1. on the commit you trust:  npm run test:visual -- --update-snapshots
 *   2. after your change:        npm run test:visual            (diffs land in playwright-report/)
 */
import { test, expect } from "./fixtures";

test.use({ reducedMotion: "reduce" });

const PAGES = [
  ["home-en", "/en/"],
  ["home-ar", "/ar/"],
  ["service-zh", "/zh/services/process-control/"],
  ["projects-tr", "/tr/projects/"],
  ["project-en", "/en/projects/pasteurizer-cip-recipes/"],
  ["contact-en", "/en/contact/"],
  ["contact-ar", "/ar/contact/"],
] as const;

for (const [name, path] of PAGES) {
  test(`${name}`, { tag: "@visual" }, async ({ page }) => {
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    const mask = [page.locator(".cf-turnstile"), page.locator("video"), page.locator('[data-v="clock"]')];
    await expect(page).toHaveScreenshot(`${name}-fold.png`, { mask });
    await expect(page).toHaveScreenshot(`${name}-full.png`, { mask, fullPage: true, timeout: 20_000 });
  });
}

test.describe("404", () => {
  test.use({ allowConsole: [/status of 404/] });
  test("404", { tag: "@visual" }, async ({ page }) => {
    await page.goto("/en/missing/");
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot("404.png", { fullPage: true });
  });
});
