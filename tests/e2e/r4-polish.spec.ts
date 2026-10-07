/**
 * Round 4 (final polish): the fixes these tests pin.
 *   VI4-02  contact sidebar: "Send drawings on WhatsApp" is one line on phones (a short label where the card is narrow)
 *   VI4-03  home hero, below 360 px: the short eyebrow keeps the place name on one line ("6th of October City")
 *   VI4-04  Arabic team strip: the title keeps "لا" with the word it negates; the body never ends a line with a lone "و"
 *   VI4-05  Arabic phone breadcrumb: the clamped crumb has room for descenders (WebKit drew "في" as "فى")
 *   menus   keyboard focus inside the open Services panel: the mouse resting on Industries does not swap the menus
 *   print   project-card photos print (the shade over them made an empty white frame)
 * (AUD4-01 / AUD4-02: r3-contact.spec.ts; AUD4-03: r3-motion.spec.ts; VI4-01: r3-r4-pages.spec.ts.)
 */
import type { Locator } from "@playwright/test";
import { test, expect } from "./fixtures";
import { isNarrow } from "./helpers";

/** Visible characters of an element in DOM (logical) order, with the top of the line each one is drawn on. */
async function charTops(el: Locator) {
  return el.evaluate((el) => {
    const out: { ch: string; top: number; space: string }[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let space = "";
    for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
      if (n.parentElement?.closest(".sr-only")) continue;
      for (let i = 0; i < n.data.length; i++) {
        const ch = n.data[i]!;
        if (/[\s­​⁠⁦-⁩]/.test(ch)) {
          space += ch;
          continue;
        }
        range.setStart(n, i);
        range.setEnd(n, i + 1);
        const r = [...range.getClientRects()].filter((q) => q.width > 0.2).pop();
        if (r) out.push({ ch, top: Math.round(r.top), space });
        space = "";
      }
    }
    return out;
  });
}

test("contact sidebar: the WhatsApp button is one line from 320 px (short label where the card is narrow)", { tag: "@desktop-only" }, async ({
  page,
}) => {
  for (const l of ["en", "ar", "tr"]) {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`/${l}/contact/`);
    const btn = page.locator("aside .lc-btn[href^='https://wa.me']");
    for (const width of [320, 360, 390, 414, 768, 1024, 1100, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const lines = await btn.evaluate((a) => {
        const label = a.querySelector(".lc-btn-label")!;
        return Math.round(label.getBoundingClientRect().height / parseFloat(getComputedStyle(label).lineHeight));
      });
      expect(lines, `${l} ${width}px`).toBe(1);
      // the accessible name is the label on screen (the other one is display: none)
      const shown = await btn.locator(".lc-btn-label > span:not(.sr-only)").evaluateAll((s) => s.filter((e) => getComputedStyle(e).display !== "none").map((e) => e.textContent));
      expect(shown, `${l} ${width}px`).toHaveLength(1);
      await expect(btn).toHaveAccessibleName(new RegExp(`^${shown[0]!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\(`));
    }
  }
});

test("home hero below 360 px: the short eyebrow keeps the place name on one line", { tag: "@desktop-only" }, async ({ page }) => {
  for (const l of ["en", "ar", "zh", "tr"]) {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto(`/${l}/`);
    for (let width = 320; width <= 358; width += 2) {
      await page.setViewportSize({ width, height: 700 });
      const chip = page.locator(".lc-hero li:visible", { hasText: "·" });
      await expect(chip).toHaveCount(1);
      const chars = await charTops(chip);
      const place = chars.slice(chars.map((c) => c.ch).lastIndexOf("·") + 1);
      expect(place.length, `${l} ${width}px`).toBeGreaterThan(3);
      expect(new Set(place.map((c) => c.top)).size, `${l} ${width}px: "${place.map((c) => c.space + c.ch).join("")}" on one line`).toBe(1);
    }
  }
});

test("Arabic team strip: 'لا' stays with the word it negates; no line ends with a lone 'و'", { tag: "@desktop-only" }, async ({ page }) => {
  await page.goto("/ar/");
  const heading = page.locator(":is(h2, h3)", { hasText: "تجّار معدات" });
  await expect(heading).toHaveCount(1);
  const strip = heading.locator("xpath=../.."); // TeamStrip.astro: the strip > (eyebrow + heading), text, link
  for (const width of [320, 360, 390, 410, 768]) {
    await page.setViewportSize({ width, height: 800 });
    await strip.scrollIntoViewIfNeeded();
    const title = await heading.evaluate((h) => {
      const text = h.firstChild as Text;
      const at = text.data.indexOf("لا");
      const r = document.createRange();
      const top = (i: number) => (r.setStart(text, i), r.setEnd(text, i + 1), Math.round(r.getClientRects()[0]!.top));
      return { negation: top(at), next: top(at + 3) };
    });
    expect(title.negation, `${width}px: "لا" and the next word`).toBe(title.next);
    // body: a "و" written apart is on the line of the word after it
    const chars = await charTops(strip.locator(":scope > p"));
    const waws = chars.flatMap((c, i) => (c.ch === "و" && (i === 0 || /\s/.test(c.space)) && chars[i + 1]?.space ? [[c, chars[i + 1]!] as const] : []));
    expect(waws.length).toBeGreaterThan(0);
    for (const [w, next] of waws) expect(w.top, `${width}px: "و" before "${next.ch}…"`).toBe(next.top);
  }
});

test("Arabic phone breadcrumb: the clamped crumb has room below the line for descenders, the row keeps its height", { tag: "@phone" }, async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "the crumb is clamped below 640 px");
  await page.goto("/ar/services/process-control/");
  const m = await page.locator(".lc-crumb-cur").evaluate((el) => {
    const cs = getComputedStyle(el);
    const em = parseFloat(cs.fontSize);
    const out = { overflow: cs.overflowY, below: parseFloat(cs.paddingBottom) / em, margin: parseFloat(cs.marginBottom) / em };
    const ol = el.closest("ol")!;
    const h = ol.getBoundingClientRect().height;
    el.style.padding = el.style.margin = "0";
    const without = ol.getBoundingClientRect().height;
    el.style.padding = el.style.margin = "";
    return { ...out, sameRow: Math.abs(h - without) < 0.5 };
  });
  expect(m.overflow).toBe("hidden");
  expect(m.below).toBeGreaterThanOrEqual(0.15);
  expect(m.margin).toBeCloseTo(-m.below, 2);
  expect(m.sameRow).toBe(true);
});

test("desktop menus: keyboard focus in the open Services panel, the mouse resting on Industries does not swap them", async ({ page }) => {
  test.skip(isNarrow(page), "desktop navigation is ≥ 1024px");
  await page.goto("/en/about/");
  await page.mouse.move(10, 700);
  const services = page.locator('header nav button[aria-controls="lc-dd-services"]');
  await services.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#lc-dd-services")).toBeVisible();
  const focused = page.locator("#lc-dd-services a").first();
  await expect(focused).toBeFocused();
  // the mouse comes to rest on Industries' label
  const label = (await page.locator("header nav [data-dd]").nth(1).locator("a").first().boundingBox())!;
  await page.mouse.move(label.x + label.width / 2, label.y + label.height / 2, { steps: 5 });
  await page.waitForTimeout(600);
  await expect(services).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator('header nav button[aria-controls="lc-dd-industries"]')).toHaveAttribute("aria-expanded", "false");
  await expect(focused).toBeFocused();
  // without focus in a panel, resting on it still opens it
  await page.keyboard.press("Escape");
  await page.locator("main a").first().focus();
  await page.mouse.move(10, 700);
  await page.mouse.move(label.x + label.width / 2, label.y + label.height / 2, { steps: 5 });
  await expect(page.locator("#lc-dd-industries")).toBeVisible();
});

test("print: project-card photos are not covered by their screen shade", { tag: "@desktop-only" }, async ({ page }) => {
  await page.goto("/en/projects/");
  await page.emulateMedia({ media: "print" });
  const photo = page.locator(".lc-card-photo:has(img)").first();
  const shades = await photo.locator(":scope > span[aria-hidden]").evaluateAll((s) => s.map((e) => getComputedStyle(e).display));
  expect(shades.length).toBeGreaterThan(0);
  expect(shades.every((d) => d === "none")).toBe(true);
  await expect(photo.locator("img")).toBeVisible();
});
