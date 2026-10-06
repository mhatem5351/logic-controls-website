/**
 * prefers-reduced-motion: no CSS animation / transition actually moves on the home page (at load and after scrolling
 * through every reveal), and the hero video does not play. A control run without the preference proves the check
 * would catch motion (the page does animate by default).
 */
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

/** Running animations / transitions that last long enough to be seen (reduced-motion styles use ~0.01 ms). */
const moving = (page: Page) =>
  page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.playState === "running")
      .map((a) => {
        const t = a.effect?.getComputedTiming();
        const name = (a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty ?? a.id;
        const el = (a.effect as KeyframeEffect | null)?.target as Element | null;
        return { name, duration: Number(t?.duration) || 0, iterations: t?.iterations ?? 1, el: el ? `${el.tagName.toLowerCase()}.${String(el.getAttribute("class")).slice(0, 60)}` : "" };
      })
      .filter((a) => a.iterations === Infinity || a.duration > 50),
  );

async function scrollThrough(page: Page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 600) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(60);
  }
}

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  for (const path of ["/en/", "/ar/", "/en/services/process-control/"]) {
    test(`nothing animates on ${path}`, async ({ page }) => {
      await page.goto(path);
      await page.waitForTimeout(300);
      expect(await moving(page), "at load").toEqual([]);
      await scrollThrough(page);
      expect(await moving(page), "after scrolling through the page").toEqual([]);
    });
  }

  test("the hero video stays paused (poster only)", async ({ page }) => {
    await page.goto("/en/");
    await page.waitForTimeout(800);
    const videos = await page.locator("video").evaluateAll((vs) => vs.map((v) => (v as HTMLVideoElement).paused));
    expect(videos.length).toBeGreaterThan(0);
    expect(videos.every(Boolean)).toBe(true);
  });
});

test("control: without the preference the home page does animate", { tag: "@desktop-only" }, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/en/");
  await expect.poll(async () => (await moving(page)).length).toBeGreaterThan(0);
});
