/**
 * ControlLoop (src/components/motion/ControlLoop.astro) on /technologies/: the 3-cycle explainer starts when its node
 * row (not the intro above it) is on screen, restarts from the Sensor at each new showing until it has played, and
 * after resting replays one cycle on hover. Static under reduced motion.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

const state = (page: Page) =>
  page.locator("[data-loop]").first().evaluate((el) => {
    const a = el.getAnimations({ subtree: true });
    return { play: (el as HTMLElement).dataset.play, n: a.length, running: a.filter((x) => x.playState === "running").length, t: Math.max(0, ...a.map((x) => Number(x.currentTime) || 0)) };
  });

test.describe("motion allowed", () => {
  test.use({ reducedMotion: "no-preference" });

  test("plays only once the node row is on screen; a new showing restarts from the Sensor", { tag: "@desktop-only" }, async ({ page }) => {
    await page.goto("/en/technologies/");
    const loop = page.locator("[data-loop]").first();
    const body = loop.locator(".lc-loop-body");
    // the heading is on screen, the diagram itself mostly below the fold: not yet
    await loop.locator(".lc-loop-head").evaluate((h) => h.scrollIntoView({ block: "start" }));
    await page.evaluate(() => scrollBy(0, -(innerHeight - 260)));
    await expect.poll(async () => (await state(page)).play).toBe("0");
    // the row is on screen: cycle 1 starts there, with the Sensor visible
    await body.evaluate((b) => b.scrollIntoView({ block: "center" }));
    await expect.poll(async () => (await state(page)).play).toBe("1");
    const sensor = await loop.locator('[data-k="sensor"] .lc-loop-ic').boundingBox();
    expect(sensor!.y + sensor!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    await page.waitForTimeout(1200);
    expect((await state(page)).t).toBeGreaterThan(900);
    // away for a while, then back: from the start again
    await page.evaluate(() => scrollTo(0, 0));
    await expect.poll(async () => (await state(page)).play).toBe("0");
    await page.waitForTimeout(800);
    await body.evaluate((b) => b.scrollIntoView({ block: "center" }));
    await expect.poll(async () => (await state(page)).play).toBe("1");
    expect((await state(page)).t).toBeLessThan(600);
  });

  test("after its three cycles it rests; hovering the diagram replays one cycle", { tag: "@desktop-only" }, async ({ page }) => {
    await page.goto("/en/technologies/");
    const body = page.locator("[data-loop] .lc-loop-body").first();
    await body.evaluate((b) => b.scrollIntoView({ block: "center" }));
    await expect.poll(async () => (await state(page)).play).toBe("1");
    // fast-forward to the rest
    await page.locator("[data-loop]").first().evaluate((el) => el.getAnimations({ subtree: true }).forEach((a) => a.finish()));
    expect((await state(page)).running).toBe(0);
    const box = (await body.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect.poll(async () => (await state(page)).running).toBeGreaterThan(10);
    // the last cycle of the timeline (2 × 7.5 s in), i.e. one cycle from the Sensor
    const t = (await state(page)).t;
    expect(t).toBeGreaterThanOrEqual(15000);
    expect(t).toBeLessThan(17000);
  });
});

test("reduced motion: the diagram is static and hover does not start it", { tag: "@desktop-only" }, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/en/technologies/");
  const body = page.locator("[data-loop] .lc-loop-body").first();
  await body.evaluate((b) => b.scrollIntoView({ block: "center" }));
  await expect.poll(async () => (await state(page)).play).toBe("0");
  const box = (await body.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);
  expect((await state(page)).n).toBe(0);
});
