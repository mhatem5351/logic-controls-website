/**
 * "Where we work" map (ZonesBlock.astro + src/scripts/zones-map.ts) on the home page:
 * hover / keyboard focus → tooltip with the straight-line distance; click / tap / Enter → detail card with a
 * "Plan a project" CTA that preselects the location on the quote form; Escape / close button deselect.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { ZONES } from "../../src/data/zones";

/** Pin order on the map toolbar = src/data/zones.ts order (home base first). */
const PINS = ZONES.map((z) => z.slug);

// Reduced motion: the signal travel animation is skipped, so the tooltip shows at once (behaviour is otherwise equal).
test.use({ reducedMotion: "reduce" });

async function openMap(page: Page, locale = "en") {
  await page.goto(`/${locale}/`);
  const block = page.locator("[data-zones]").first();
  await block.scrollIntoViewIfNeeded();
  // the map script is running (it marks the map once it has scrolled into view)
  await expect(block.locator("[data-zm]")).toHaveAttribute("data-intro", "");
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
  // compact: name + distance only (governorate · region and the SCZONE chip stay in the card and the list)
  await expect(tip.locator(".lc-zm-meta")).toBeHidden();
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
  await pin(block, PINS[0]!).focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(pin(block, PINS[0]!)).toBeFocused();
  await expect(block.locator('button.lc-zm-pin[tabindex="0"]')).toHaveCount(1);
  // the arrow-key hint is visible while the pins have keyboard focus (in the legend's place), and it describes the map
  const kbd = block.locator(".lc-zm-kbd");
  await expect(kbd).toHaveCSS("opacity", "1");
  await expect(block.locator(".lc-zm-lg-base")).toHaveCSS("opacity", "0");
  await expect(block.locator("[data-zm-pins]")).toHaveAccessibleDescription(/Arrow keys/);
  // arrows / End move between the zones (roving tabindex) and preview them
  await page.keyboard.press("ArrowRight");
  await expect(pin(block, PINS[1]!)).toBeFocused();
  await expect(tip).toBeVisible();
  await expect(mark(block, PINS[1]!)).toHaveAttribute("data-hl", "");
  await page.keyboard.press("End");
  await expect(pin(block, PINS.at(-1)!)).toBeFocused();
  await expect(pin(block, PINS.at(-1)!)).toHaveAttribute("tabindex", "0");
  // Tab leaves the toolbar (next: the zone list)
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => (document.activeElement as HTMLElement).dataset.zone);
  expect(focused).toBeTruthy();
  await expect(page.locator(":focus")).toHaveAttribute("data-zm-row", "");
  await expect(tip).toBeVisible();
  // focus left the pins: the legend is back
  await expect(kbd).toHaveCSS("opacity", "0");
  await page.keyboard.press("Escape");
  await expect(tip).toBeHidden();
});

test("keyboard on the Arabic page: the arrows follow the reading direction (ArrowLeft = next), Up / Down do not flip", { tag: "@desktop-only" }, async ({ page }) => {
  const block = await openMap(page, "ar");
  await expect(block.locator("[data-zm-pins]")).toHaveCSS("direction", "rtl");
  const at = async (i: number) => {
    const z = PINS[(i + PINS.length) % PINS.length]!;
    await expect(pin(block, z)).toBeFocused();
    await expect(block.locator('button.lc-zm-pin[tabindex="0"]')).toHaveAttribute("data-zone", z);
  };
  await pin(block, PINS[0]!).focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await at(0);
  await page.keyboard.press("ArrowLeft");
  await at(1);
  await expect(mark(block, PINS[1]!)).toHaveAttribute("data-hl", "");
  await page.keyboard.press("ArrowLeft");
  await at(2);
  await page.keyboard.press("ArrowRight");
  await at(1);
  await page.keyboard.press("ArrowDown");
  await at(2);
  await page.keyboard.press("ArrowUp");
  await at(1);
  await page.keyboard.press("End");
  await at(-1);
  await page.keyboard.press("ArrowLeft"); // next from the last pin wraps to the first
  await at(0);
  await page.keyboard.press("ArrowRight"); // previous from the first wraps to the last
  await at(-1);
  await page.keyboard.press("Home");
  await at(0);
});

test("the tooltip never hides a neighbouring pin (eastern cluster included)", { tag: "@desktop-only" }, async ({ page }) => {
  const block = await openMap(page);
  await page.evaluate(() => document.fonts.ready);
  const tip = block.locator("[data-zm-tip]");
  const zones = await block.locator("button.lc-zm-pin").evaluateAll((bs) => bs.map((b) => (b as HTMLElement).dataset.zone!));
  for (const z of zones) {
    await page.mouse.move(2, 2);
    await expect(tip).toBeHidden();
    const dot = await mark(block, z).locator(":is(.lc-map-dot, .lc-map-home-dot)").boundingBox();
    await page.mouse.move(dot!.x + dot!.width / 2, dot!.y + dot!.height / 2);
    await expect(tip).toBeVisible();
    // a face the tooltip is the first to use (bold) may still be loading (the script places it again once loaded),
    // and the reduced-motion catch-all turns every property change into a 0.01 ms transition: measure once settled
    await page.evaluate(() => document.fonts.ready);
    await settle(tip);
    // share of every other pin's dot under the tooltip: grazing an edge is fine, hiding a quarter of a pin is not
    const hidden = await tip.evaluate((t, z) => {
      const tr = t.getBoundingClientRect();
      return [...document.querySelectorAll<SVGGElement>("[data-zones] g.lc-map-pin")]
        .filter((g) => g.dataset.zone !== z)
        .filter((g) => {
          const r = g.querySelector(":is(.lc-map-dot, .lc-map-home-dot)")!.getBoundingClientRect();
          const a = Math.max(0, Math.min(r.right, tr.right) - Math.max(r.left, tr.left)) * Math.max(0, Math.min(r.bottom, tr.bottom) - Math.max(r.top, tr.top));
          return a / (r.width * r.height) > 0.25;
        })
        .map((g) => g.dataset.zone);
    }, z);
    expect(hidden, `tooltip of ${z}`).toEqual([]);
  }
});

test("phones: pin hit squares never overlap (all locales, 320 / 360 / 390, Arabic's larger root size included)", { tag: "@desktop-only" }, async ({ page }) => {
  for (const locale of ["en", "ar", "zh", "tr"]) {
    for (const width of [320, 360, 390]) {
      await page.setViewportSize({ width, height: 760 });
      const block = await openMap(page, locale);
      const overlaps = await block.locator("button.lc-zm-pin").evaluateAll((bs) => {
        const r = bs.map((b) => [(b as HTMLElement).dataset.zone, b.getBoundingClientRect()] as const);
        const out: string[] = [];
        for (let i = 0; i < r.length; i++)
          for (let j = i + 1; j < r.length; j++) {
            const [a, b] = [r[i][1], r[j][1]];
            if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.05 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.05) out.push(`${r[i][0]}∩${r[j][0]}`);
          }
        return out;
      });
      expect(overlaps, `${locale} @ ${width}px`).toEqual([]);
    }
  }
});

test("touch: a tap goes to the pin nearest the finger (44px targets overlap in the cluster)", { tag: "@phone" }, async ({ page, isMobile }) => {
  test.skip(!isMobile, "touch screens only");
  const block = await openMap(page);
  const centre = async (z: string) => {
    const b = (await mark(block, z).locator(".lc-map-dot").boundingBox())!;
    return [b.x + b.width / 2, b.y + b.height / 2];
  };
  const [o, b] = [await centre("obour"), await centre("badr")];
  // 62% of the way from Obour to Badr: nearer Badr (whatever hit square lies on top there)
  await page.touchscreen.tap(o[0] + (b[0] - o[0]) * 0.62, o[1] + (b[1] - o[1]) * 0.62);
  await expect(pin(block, "badr")).toHaveAttribute("aria-expanded", "true");
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
  // the trace from our base switches on: it is the one selected trace, drawn solid and unlike an idle trace
  const trace = (z: string) => block.locator(`.lc-map-links path[data-zone="${z}"]`);
  await expect(block.locator(".lc-map-links path[data-sel]")).toHaveCount(1);
  await expect(trace("obour")).toHaveAttribute("data-sel", "");
  await expect(trace("obour")).toHaveCSS("stroke-dasharray", "none");
  await expect(trace("badr")).not.toHaveCSS("stroke-dasharray", "none");
  const stroke = (z: string) => trace(z).evaluate((p) => getComputedStyle(p).stroke);
  expect(await stroke("obour"), "the selected trace is lit").not.toBe(await stroke("badr"));
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
