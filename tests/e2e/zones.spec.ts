/**
 * "Where we work" map (ZonesBlock.astro + src/scripts/zones-map.ts) on the home page:
 * hover / keyboard focus → tooltip with the straight-line distance; click / tap / Enter → detail card with a
 * "Plan a project" CTA that preselects the location on the quote form; Escape / close button deselect.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

// Reduced motion: the signal travel animation is skipped, so the tooltip shows at once (behaviour is otherwise equal).
test.use({ reducedMotion: "reduce" });

async function openMap(page: Page, locale = "en") {
  await page.goto(`/${locale}/`);
  const block = page.locator("[data-zones]").first();
  await block.scrollIntoViewIfNeeded();
  return block;
}
const pin = (block: ReturnType<Page["locator"]>, zone: string) => block.locator(`button.lc-zm-pin[data-zone="${zone}"]`);
/** The drawn SVG pin (carries data-hl / data-sel); the button above is its hit area. */
const mark = (block: ReturnType<Page["locator"]>, zone: string) => block.locator(`g.lc-map-pin[data-zone="${zone}"]`);
/** Wait until no CSS transition / animation runs inside the element for 3 frames (transitions can chain). */
const settle = (el: ReturnType<Page["locator"]>) =>
  el.evaluate(async (n) => {
    for (let calm = 0, frames = 0; calm < 3 && frames < 180; frames++) {
      await new Promise(requestAnimationFrame);
      calm = n.getAnimations({ subtree: true }).some((a) => a.playState === "running") ? 0 : calm + 1;
    }
  });
const row = (block: ReturnType<Page["locator"]>, zone: string) => block.locator(`button[data-zm-row][data-zone="${zone}"]`);

test("hover a pin → tooltip with name and distance; leaving hides it", { tag: "@desktop-only" }, async ({ page }) => {
  const block = await openMap(page);
  const tip = block.locator("[data-zm-tip]");
  await pin(block, "borg-el-arab").hover();
  await expect(tip).toBeVisible();
  await expect(tip.locator(".lc-zm-name")).toHaveText(/Borg El Arab/);
  await expect(tip.locator(".lc-zm-dist b")).toHaveText(/^\d+$/);
  await expect(mark(block, "borg-el-arab")).toHaveAttribute("data-hl", "");
  await expect(row(block, "borg-el-arab")).toHaveAttribute("data-hl", "");
  // the tooltip stays inside the map box
  const [t, m] = [await tip.boundingBox(), await block.locator("[data-zm]").boundingBox()];
  expect(t!.x).toBeGreaterThanOrEqual(m!.x - 1);
  expect(t!.x + t!.width).toBeLessThanOrEqual(m!.x + m!.width + 1);

  await page.mouse.move(5, 5);
  await expect(tip).toBeHidden();
});

test("keyboard focus on a pin previews it; Escape hides the tooltip", { tag: "@desktop-only" }, async ({ page }) => {
  const block = await openMap(page);
  const tip = block.locator("[data-zm-tip]");
  // reach the first pin with the keyboard (focus-visible), then move along the pins
  await pin(block, "6th-of-october").focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(pin(block, "6th-of-october")).toBeFocused();
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => (document.activeElement as HTMLElement).dataset.zone);
  expect(focused).toBeTruthy();
  await expect(tip).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tip).toBeHidden();
});

test("select a zone → detail card, CTA with ?location=, two-way list linking, Escape deselects", async ({ page }) => {
  const block = await openMap(page);
  const panel = block.locator("[data-zm-panel]");
  const card = block.locator('[data-card="obour"]');

  await pin(block, "obour").click();
  await expect(panel).toHaveAttribute("data-open", "");
  await expect(card).toBeVisible();
  await expect(pin(block, "obour")).toHaveAttribute("aria-expanded", "true");
  await expect(row(block, "obour")).toHaveAttribute("aria-expanded", "true");
  await expect(row(block, "obour")).toHaveAttribute("data-sel", "");
  await expect(block.locator("[data-zm-live]")).not.toBeEmpty();
  const cta = card.locator("a.lc-zm-cta");
  await expect(cta).toHaveAttribute("href", "/en/contact/?location=obour#quote");

  // selecting from the list switches the card
  await row(block, "ain-sokhna").click();
  await expect(block.locator('[data-card="ain-sokhna"]')).toBeVisible();
  await expect(card).toBeHidden();
  await expect(mark(block, "ain-sokhna")).toHaveAttribute("data-sel", "");
  await expect(pin(block, "obour")).toHaveAttribute("aria-expanded", "false");

  // Escape (focus inside the block) deselects
  await row(block, "ain-sokhna").focus();
  await page.keyboard.press("Escape");
  await expect(panel).not.toHaveAttribute("data-open", "");
  await expect(pin(block, "ain-sokhna")).toHaveAttribute("aria-expanded", "false");

  // the same control again toggles off; the close button too, returning focus to the control.
  // (The card opens / closes with transitions; each step waits for them, as a person would, so no step lands in the
  // middle of an interrupted visibility transition.)
  const strip = block.locator("[data-zm-card]");
  await pin(block, "badr").click();
  await expect(panel).toHaveAttribute("data-open", "");
  await settle(strip);
  await pin(block, "badr").click();
  await expect(panel).not.toHaveAttribute("data-open", "");
  await settle(strip);
  await row(block, "badr").focus();
  await page.keyboard.press("Enter");
  await expect(panel).toHaveAttribute("data-open", "");
  await settle(strip);
  const close = block.locator("[data-zm-close]");
  await close.focus();
  await expect(close).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(panel).not.toHaveAttribute("data-open", "");
  await expect(row(block, "badr")).toBeFocused();
});

test("the CTA opens the quote form with the plant location preselected (Arabic)", async ({ page }) => {
  const block = await openMap(page, "ar");
  await pin(block, "10th-of-ramadan").click();
  const cta = block.locator('[data-card="10th-of-ramadan"] a.lc-zm-cta');
  await expect(cta).toHaveAttribute("href", "/ar/contact/?location=10th-of-ramadan#quote");
  await cta.click();
  await expect(page).toHaveURL("/ar/contact/?location=10th-of-ramadan#quote");
  await expect(page.locator("#rfq-location")).toHaveValue("10th-of-ramadan");
});

test("the home base has no distance and a plain contact CTA", { tag: "@desktop-only" }, async ({ page }) => {
  const block = await openMap(page);
  await pin(block, "6th-of-october").click();
  const card = block.locator('[data-card="6th-of-october"]');
  await expect(card).toBeVisible();
  await expect(card.locator(".lc-zm-dist")).toHaveCount(0);
  await expect(card.locator("a.lc-zm-cta")).toHaveAttribute("href", "/en/contact/");
});
