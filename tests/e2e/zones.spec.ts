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

test("keyboard: the pins are one Tab stop (arrow keys move along them); focus previews; Escape hides the tooltip", { tag: "@desktop-only" }, async ({ page }) => {
  const block = await openMap(page);
  const tip = block.locator("[data-zm-tip]");
  // reach the pins with the keyboard (focus-visible): one stop, on the home base
  await pin(block, "6th-of-october").focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(pin(block, "6th-of-october")).toBeFocused();
  await expect(block.locator('button.lc-zm-pin[tabindex="0"]')).toHaveCount(1);
  // arrows / End move between the zones (roving tabindex) and preview them
  await page.keyboard.press("ArrowRight");
  await expect(pin(block, "obour")).toBeFocused();
  await expect(tip).toBeVisible();
  await expect(mark(block, "obour")).toHaveAttribute("data-hl", "");
  await page.keyboard.press("End");
  await expect(pin(block, "east-port-said")).toBeFocused();
  await expect(pin(block, "east-port-said")).toHaveAttribute("tabindex", "0");
  // Tab leaves the toolbar (next: the zone list)
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => (document.activeElement as HTMLElement).dataset.zone);
  expect(focused).toBeTruthy();
  await expect(page.locator(":focus")).toHaveAttribute("data-zm-row", "");
  await expect(tip).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tip).toBeHidden();
});

test("pins are named with the number drawn on them (WCAG 2.5.3)", { tag: "@desktop-only" }, async ({ page }) => {
  const block = await openMap(page);
  await expect(pin(block, "obour")).toHaveAttribute("aria-label", /^2\. Obour City/);
  await expect(row(block, "obour")).toHaveAccessibleName(/^2\s*\.\s*Obour City/);
});

test("select a zone → detail card, CTA with ?location=, two-way list linking, Escape deselects", async ({ page, browserName }) => {
  const block = await openMap(page);
  const panel = block.locator("[data-zm-panel]");
  const card = block.locator('[data-card="obour"]');

  await pin(block, "obour").click();
  await expect(panel).toHaveAttribute("data-open", "");
  await expect(card).toBeVisible();
  await expect(pin(block, "obour")).toHaveAttribute("aria-expanded", "true");
  // the list row lights with the pin (its own disclosure stays closed)
  await expect(row(block, "obour")).toHaveAttribute("data-sel", "");
  await expect(row(block, "obour")).toHaveAttribute("aria-expanded", "false");
  // the trace from our base switches on (amber, solid)
  await expect(block.locator('.lc-map-links path[data-zone="obour"]')).toHaveCSS("stroke", "rgba(255, 198, 75, 0.9)");
  await expect(block.locator("[data-zm-live]")).not.toBeEmpty();
  const cta = card.locator("a.lc-zm-cta");
  await expect(cta).toHaveAttribute("href", "/en/contact/?location=obour#quote");

  // a list row is a disclosure: its own detail (distance + CTA) opens right under it, the map card closes
  await row(block, "ain-sokhna").click();
  const detail = block.locator('[data-zm-detail="ain-sokhna"]');
  await expect(detail).toBeVisible();
  await expect(row(block, "ain-sokhna")).toHaveAttribute("aria-expanded", "true");
  await expect(detail.locator("a.lc-zm-cta")).toHaveAttribute("href", "/en/contact/?location=ain-sokhna#quote");
  await expect(panel).not.toHaveAttribute("data-open", "");
  await expect(mark(block, "ain-sokhna")).toHaveAttribute("data-sel", "");
  await expect(pin(block, "obour")).toHaveAttribute("aria-expanded", "false");
  // the CTA is the next Tab stop after the row (WebKit, like Safari, reaches links with Option+Tab)
  await row(block, "ain-sokhna").focus();
  await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
  await expect(detail.locator("a.lc-zm-cta")).toBeFocused();

  // Escape (focus inside the block) deselects, focus back on the row
  await page.keyboard.press("Escape");
  await expect(detail).toBeHidden();
  await expect(row(block, "ain-sokhna")).toHaveAttribute("aria-expanded", "false");
  await expect(row(block, "ain-sokhna")).toBeFocused();

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
  await pin(block, "badr").focus();
  await page.keyboard.press("Enter");
  await expect(panel).toHaveAttribute("data-open", "");
  await settle(strip);
  // from the pin, the next Tab stop is the card's close button
  await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
  const close = block.locator("[data-zm-close]");
  await expect(close).toBeFocused();
  await expect(close).toHaveAccessibleName(/zone details/i);
  await page.keyboard.press("Enter");
  await expect(panel).not.toHaveAttribute("data-open", "");
  await expect(pin(block, "badr")).toBeFocused();
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
