/**
 * prefers-reduced-motion: no CSS animation / transition actually moves on the home page (at load and after scrolling
 * through every reveal), and the hero video does not play. A control run without the preference proves the check
 * would catch motion (the page does animate by default).
 * No fixed sleeps before "nothing moves": a recorder samples document.getAnimations() on every frame from the start of
 * the navigation, and the checks run once the page's deferred work has had its turn, so motion that starts late still
 * fails the test.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

type Moving = { name: string; duration: number; iterations: number; el: string };

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

/** Records every animation that is running and long enough to be seen, on every frame from document start. */
async function recordMotion(page: Page) {
  await page.addInitScript(() => {
    const seen = new Map<string, Moving>();
    (window as unknown as { __lcMotionSeen: Map<string, Moving> }).__lcMotionSeen = seen;
    const tick = () => {
      for (const a of document.getAnimations()) {
        if (a.playState !== "running") continue;
        const t = a.effect?.getComputedTiming();
        const duration = Number(t?.duration) || 0;
        const iterations = t?.iterations ?? 1;
        if (iterations !== Infinity && duration <= 50) continue;
        const name = (a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty ?? a.id;
        const target = (a.effect as KeyframeEffect | null)?.target as Element | null;
        const el = target ? `${target.tagName.toLowerCase()}.${String(target.getAttribute("class")).slice(0, 60)}` : "";
        seen.set(`${name} ${el}`, { name, duration, iterations, el });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
const everMoved = (page: Page) => page.evaluate(() => [...(window as unknown as { __lcMotionSeen: Map<string, Moving> }).__lcMotionSeen.values()]);

/** Two frames: whatever the last step changed is painted and IntersectionObserver callbacks have been delivered. */
const frames = (page: Page) => page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));

/** After the load event and the idle moment deferred features wait for (src/scripts/site-load.ts idle()), plus frames. */
const settled = async (page: Page) => {
  await page.waitForLoadState("load");
  await page.evaluate(
    () =>
      new Promise<void>((done) => {
        const next = () => requestAnimationFrame(() => requestAnimationFrame(() => done()));
        if ("requestIdleCallback" in window) requestIdleCallback(next, { timeout: 2000 });
        else setTimeout(next, 1);
      }),
  );
};

async function scrollThrough(page: Page) {
  await page.evaluate(async () => {
    const frame = () => new Promise(requestAnimationFrame);
    for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await frame();
      await frame();
    }
  });
  await frames(page);
}

/**
 * Counts the hero clip's start checks (Hero.astro sync(): it rewrites its pause button's aria-pressed on every check —
 * once when the script begins at first paint + 2.4 s + an idle moment, again when the IntersectionObserver reports the
 * clip on screen). Two checks = the clip has decided whether to play with the hero in view.
 */
async function countHeroChecks(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __lcHeroChecks: number };
    w.__lcHeroChecks = 0;
    new MutationObserver((records) => {
      for (const r of records) if ((r.target as Element).matches?.("[data-hero-pause]")) w.__lcHeroChecks++;
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ["aria-pressed"] });
  });
}
const heroChecks = (page: Page) => page.evaluate(() => (window as unknown as { __lcHeroChecks: number }).__lcHeroChecks);

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  for (const path of ["/en/", "/ar/", "/en/services/process-control/"]) {
    test(`nothing animates on ${path}`, async ({ page }) => {
      await recordMotion(page);
      await countHeroChecks(page);
      await page.goto(path);
      // the OS setting is applied before first paint (BaseLayout head script → motion-pref contract)
      await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
      await settled(page);
      expect(await moving(page), "at load").toEqual([]);
      await scrollThrough(page);
      await settled(page);
      expect(await moving(page), "after scrolling through the page").toEqual([]);
      // the latest scheduled start on a page is the hero clip's (first paint + 2.4 s, then idle): observe past it
      if (await page.locator("video.lc-hero-video").count()) await expect.poll(() => heroChecks(page), { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
      await frames(page);
      expect(await everMoved(page), "on any frame since the navigation started").toEqual([]);
    });
  }

  test("the hero video stays on its poster (no source, nothing downloaded); lifting the setting starts it", { tag: "@desktop-only" }, async ({ page }) => {
    await countHeroChecks(page);
    await page.goto("/en/");
    await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
    const video = page.locator("video.lc-hero-video");
    await expect(video).toHaveCount(1);
    await expect.poll(() => heroChecks(page), { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
    await expect(video).not.toHaveAttribute("src");
    await expect(video).not.toHaveAttribute("data-playing");
    expect(await video.evaluate((v: HTMLVideoElement) => ({ paused: v.paused, readyState: v.readyState }))).toEqual({ paused: true, readyState: 0 });
    // control: the same page plays the clip once the OS setting allows motion (so the checks above can fail)
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(video).toHaveAttribute("data-playing", "", { timeout: 15_000 });
    expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  });
});

test("control: without the preference the home page does animate (and the recorder sees it)", { tag: "@desktop-only" }, async ({ page }) => {
  await recordMotion(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/en/");
  await expect.poll(async () => (await moving(page)).length).toBeGreaterThan(0);
  await expect.poll(async () => (await everMoved(page)).length).toBeGreaterThan(0);
});

test("control: with motion allowed the hero video plays on desktop (unless the visitor paused it)", { tag: "@desktop-only" }, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/en/");
  const video = page.locator("video.lc-hero-video");
  await expect(video).toHaveAttribute("data-playing", "", { timeout: 15_000 });
  expect(await video.evaluate((v: HTMLVideoElement) => ({ paused: v.paused, hasSource: !!v.currentSrc }))).toEqual({ paused: false, hasSource: true });
  // the hero's own pause button (WCAG 2.2.2) is remembered: the next page load stays on the poster
  const pause = page.locator("[data-hero-pause]");
  await expect(pause).toBeVisible();
  await pause.click();
  await expect(pause).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => localStorage.getItem("lcHeroVideo"))).toBe("paused");
  await countHeroChecks(page);
  await page.reload();
  await expect.poll(() => heroChecks(page), { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
  await expect(video).not.toHaveAttribute("data-playing");
  await expect(pause).toHaveAttribute("aria-pressed", "true");
});

/* ---------------------------------------------------------------- round 2: transitions, illustrations, motion switch */

/** pagereveal log of every document in the tab (sessionStorage survives the navigations): URL, whether a view
 *  transition ran, its types, and how long it took to finish. */
async function logReveals(page: Page) {
  await page.addInitScript(() => {
    addEventListener("pagereveal", (e) => {
      const t = (e as Event & { viewTransition?: ViewTransition & { types?: Set<string> } }).viewTransition;
      const t0 = performance.now();
      const save = (r: Record<string, unknown>) => {
        const log = JSON.parse(sessionStorage.__vtlog || "[]");
        log.push(r);
        sessionStorage.__vtlog = JSON.stringify(log);
      };
      if (!t) return save({ url: location.pathname, vt: false });
      t.finished.then(
        () => save({ url: location.pathname, vt: true, types: [...(t.types ?? [])], ms: Math.round(performance.now() - t0) }),
        () => save({ url: location.pathname, vt: true, skipped: true }),
      );
    });
  });
}
const reveals = (page: Page) => page.evaluate(() => JSON.parse(sessionStorage.__vtlog || "[]") as { url: string; vt: boolean; ms?: number; types?: string[] }[]);
const namesLeft = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[style*='view-transition-name']")].map((e) => e.style.viewTransitionName).filter(Boolean));

test.describe("page transitions", { tag: "@desktop-only" }, () => {
  test.use({ reducedMotion: "no-preference" });

  test("back up to a card grid: the morph runs to the end and no name is left behind (MOT2-01)", async ({ page }) => {
    await logReveals(page);
    await page.goto("/en/services/");
    const cards = page.locator("article:has([data-vt-href]) :is(h2,h3) a");
    await cards.first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    const [a, b] = await cards.evaluateAll((els) => els.slice(0, 2).map((x) => x.getAttribute("href")!));
    await page.locator(`main a[href="${a}"]`).first().click();
    await page.waitForURL(`**${a}`);
    await page.waitForTimeout(800);
    await page.getByRole("navigation", { name: /breadcrumb/i }).getByRole("link", { name: "Services" }).click();
    await page.waitForURL("**/en/services/");
    await page.waitForTimeout(900);
    expect(await namesLeft(page), "no view-transition-name survives the transition").toEqual([]);
    await page.locator(`main a[href="${b}"]`).first().scrollIntoViewIfNeeded();
    await page.locator(`main a[href="${b}"]`).first().click();
    await page.waitForURL(`**${b}`);
    await page.waitForTimeout(800);
    const log = await reveals(page);
    const up = log.find((r) => r.url === "/en/services/" && r.vt);
    expect(up?.ms ?? 0, "the morph back to the grid is not cut short (it was ~60 ms)").toBeGreaterThan(380);
    expect(log.at(-1), "the next card still transitions (a stale duplicate name used to cancel it)").toMatchObject({ url: b, vt: true });
    // 'Unexpected duplicate view-transition-name' would also fail the console-error fixture
  });

  test("a project filter does not fade or move the page (MOT2-02)", async ({ page }) => {
    await page.goto("/en/projects/");
    await page.waitForTimeout(500);
    const rootAnims = await page.evaluate(async () => {
      const chip = [...document.querySelectorAll<HTMLElement>("[data-pf-key][data-pf-value]")].find((b) => b.dataset.pfValue)!;
      chip.click();
      const seen = new Set<string>();
      const t0 = performance.now();
      while (performance.now() - t0 < 400) {
        for (const x of document.getAnimations()) {
          const pe = (x.effect as KeyframeEffect | null)?.pseudoElement ?? "";
          if (/-(old|new)\(root\)/.test(pe)) seen.add(`${pe} ${(x as CSSAnimation).animationName ?? "?"}`);
        }
        await new Promise(requestAnimationFrame);
      }
      return [...seen];
    });
    expect(rootAnims, "the page's own snapshots swap at once; only the cards animate").toEqual([]);
  });
});

test.describe("illustrations", () => {
  test.use({ reducedMotion: "no-preference" });

  test("decorative illustrations never take keyboard focus (A11Y2-01)", async ({ page }) => {
    for (const path of ["/en/services/control-panels/", "/ar/industries/food-beverage/", "/en/about/", "/en/services/"]) {
      await page.goto(path);
      await page.waitForTimeout(600);
      const focusable = await page.evaluate(
        () => [...document.querySelectorAll<SVGElement>('svg[aria-hidden="true"]')].filter((s) => (s.focus(), document.activeElement === s)).length,
      );
      expect(focusable, path).toBe(0);
    }
  });

  test("with motion on, a piece is never shown in its still pose: it rests on a frame of its own loop (MOT2-03)", async ({ page }) => {
    await page.goto("/en/services/");
    await page.locator("main [data-lca]").first().waitFor({ state: "attached" });
    await page.waitForTimeout(800);
    const states = await page.evaluate(() =>
      [...document.querySelectorAll("main [data-lca]")]
        .filter((e) => e.getBoundingClientRect().width > 0)
        .map((e) => [e.getAttribute("data-play"), (e as HTMLElement).dataset.restAt] as const),
    );
    expect(states.length).toBeGreaterThan(0);
    for (const [play, restAt] of states) {
      expect(["1", "0", "hold"], "playing, or parked on a loop frame").toContain(play);
      expect(restAt, "every piece declares its rest frame").toBeDefined();
    }
  });
});

test.describe("Pause animations switch", () => {
  test.use({ reducedMotion: "no-preference" });

  test("pauses everything, persists, and switching back on does not replay the entrances (MOT2-20)", async ({ page }) => {
    await page.goto("/en/");
    const toggle = page.locator("footer [data-motion-toggle]");
    await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
    await expect(page.locator("[data-motion-toggle]").first()).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => localStorage.getItem("lcMotion"))).toBe("off");
    expect(await page.evaluate(() => [...document.querySelectorAll("[data-lca]")].every((e) => e.getAttribute("data-play") === "rest"))).toBe(true);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
    await page.locator("footer [data-motion-toggle]").click();
    await expect(page.locator("html")).not.toHaveAttribute("data-motion", "off");
    await page.waitForTimeout(150);
    const drawn = await page.evaluate(() =>
      [...document.querySelectorAll(".lc-hero .lc-traces .trace, .lc-hero-edge")].map((p) => parseFloat(getComputedStyle(p).strokeDashoffset)),
    );
    expect(drawn.every((v) => v === 0), "traces and the hero edge stay drawn").toBe(true);
    await expect(page.locator("html")).not.toHaveAttribute("data-intro");
  });

  test("the OS reduced-motion lock shows its reason and follows the setting live (A11Y2-18, CODE2-06)", async ({ page }) => {
    await page.goto("/en/privacy/");
    const toggle = page.locator("footer [data-motion-toggle]");
    const note = page.locator("footer [data-mt-note]");
    await expect(note).toBeHidden();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(toggle).toHaveAttribute("aria-disabled", "true");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(note).toBeVisible();
    await expect(toggle).toHaveAccessibleDescription(/reduce motion/i);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(toggle).not.toHaveAttribute("aria-disabled", "true");
    await expect(note).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
  });
});
