/**
 * Motion and script loading, audit round 3 (package R5-motion).
 *
 *  - First tap before a feature's code is in (CODE3-03): site-load.ts holds the tap and replays it once the code has
 *    run. The chunk is held back with a route, so the test always taps before it lands (no other test ever did).
 *  - Small layout-changing features load at idle (PERF3-07); the RFQ form's chunk is preloaded (PERF3-06).
 *  - Detail-hero art is parked after the hero copy (PERF3-01): no requestAnimationFrame before the h1.
 *  - Back / up to an index morphs into a card that has its picture (MOT3-02): the detail page warms the art fragment
 *    and its code; the morph target is filled first (high priority), during the transition.
 *  - Hero video and pause control (MOT3-06 / MOT3-07), Arabic case-study titles (VIS3-05), the home CTA at 320 px
 *    (DEV2-09), the HMI's keys at the fault / recovery beats (MOT3-05), the control loop's first state (MOT3-08) and
 *    the KPI line's number + unit (I18N3-06).
 * A route on any request disables cross-document view transitions in Chromium: the morph test watches requests through
 * CDP instead.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { LOCALES } from "./helpers";

/* ------------------------------------------------------------------ first tap before the code (CODE3-03) */

/** Holds every request for a chunk until `release()`; `requested` resolves when the first one is made. */
async function holdChunk(page: Page, chunk: RegExp) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let requested!: () => void;
  const asked = new Promise<void>((r) => (requested = r));
  await page.route(chunk, async (route) => {
    requested();
    await gate;
    await route.continue();
  });
  return { release, requested: asked };
}

test("gallery: a tap before its code has loaded is held, then opens the lightbox once (no navigation to the image)", async ({ page }) => {
  const hold = await holdChunk(page, /\/Gallery\.astro\.lc(?:\.[\w-]+)?\.(?:js|ts)(?:\?|$)/);
  // WebKit holds the load event for a pending import(): don't wait for it
  await page.goto("/en/projects/pasteurizer-cip-recipes/", { waitUntil: "domcontentloaded" });
  const thumbs = page.locator("[data-gallery] a[data-full]");
  await thumbs.first().scrollIntoViewIfNeeded();
  await hold.requested; // near / idle asked for it; it is held
  await expect(page.locator("[data-gallery][data-ready]")).toHaveCount(0);
  const n = await thumbs.count();
  const url = page.url();
  // count how often the lightbox opens
  await page.evaluate(() => {
    const w = window as unknown as { __opens: number };
    w.__opens = 0;
    const show = HTMLDialogElement.prototype.showModal;
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      w.__opens++;
      return show.call(this);
    };
  });
  await thumbs.first().click();
  const dialog = page.locator(".lc-lightbox");
  // held: the browser did not follow the link to the image file and nothing opened yet
  await expect.poll(() => page.evaluate(() => (window as unknown as { __opens: number }).__opens)).toBe(0);
  expect(page.url()).toBe(url);
  await expect(dialog).toBeHidden();
  hold.release();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("[data-counter]")).toHaveText(`1 / ${n}`);
  expect(page.url()).toBe(url);
  expect(await page.evaluate(() => (window as unknown as { __opens: number }).__opens)).toBe(1);
  // the hold is gone: a later tap is the gallery's own
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await thumbs.nth(1).click();
  await expect(dialog.locator("[data-counter]")).toHaveText(`2 / ${n}`);
  expect(await page.evaluate(() => (window as unknown as { __opens: number }).__opens)).toBe(2);
});

test.describe(() => {
  // WebKit: with the chunk held, the load event stays pending, and only with the pages' speculation rules does that
  // WebKit render meanwhile (the E2E WebKit project drops them otherwise: fixtures.ts)
  test.use({ keepSpeculationRules: true });
  test("quote form: a submit before the form's code has loaded is held, then validated by it (no native submit)", async ({ page }) => {
    const hold = await holdChunk(page, /\/RfqForm\.astro\.lc(?:\.[\w-]+)?\.(?:js|ts)(?:\?|$)/);
    await page.goto("/en/contact/", { waitUntil: "domcontentloaded" });
    await hold.requested;
    await expect(page.locator("form[data-rfq][data-enhanced]")).toHaveCount(0);
    await page.evaluate(() => {
      const w = window as unknown as { __submits: number };
      w.__submits = 0;
      document.addEventListener("submit", () => w.__submits++, true);
    });
    const submit = page.locator("form[data-rfq] [data-submit]").last(); // the no-JS submit, shown until the form is enhanced
    await submit.scrollIntoViewIfNeeded();
    await submit.click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __submits: number }).__submits)).toBe(0);
    await expect(page.locator("[data-alert]")).toBeHidden();
    hold.release();
    await expect(page.locator("form[data-rfq][data-enhanced]")).toHaveCount(1);
    // the replayed tap reaches the enhanced form: its own error summary, focus on the first invalid field
    await expect(page.locator("[data-alert]")).toBeVisible();
    await expect(page.locator("#rfq-name")).toBeFocused();
    await expect(page).toHaveURL(/\/en\/contact\/$/);
    expect(await page.evaluate(() => (window as unknown as { __submits: number }).__submits)).toBe(1);
  });
});

/* ------------------------------------------------------------------ loading (PERF3-06 / PERF3-07) */

test("the gallery's code loads at idle, without scrolling to it", async ({ page }) => {
  await page.goto("/en/projects/pasteurizer-cip-recipes/");
  await expect(page.locator("[data-gallery][data-ready]").first()).toBeAttached({ timeout: 10_000 });
});

test("contact page preloads the form's chunk from its <head>", { tag: "@desktop-only" }, async ({ page }) => {
  // the served HTML, not the live DOM (Vite's import helper adds modulepreload links of its own when the import runs)
  const head = async (path: string) => {
    const html = await (await page.request.get(path)).text();
    return [...html.slice(0, html.indexOf("</head>")).matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map((m) => m[1]!);
  };
  for (const l of LOCALES) {
    const hrefs = await head(`/${l}/contact/`);
    expect(
      hrefs.some((h) => /^\/_astro\/RfqForm\.astro\.lc\.[\w-]+\.js$/.test(h)),
      `${l}: ${hrefs.join(" ")}`,
    ).toBe(true);
    for (const h of hrefs) expect((await page.request.get(h)).status(), h).toBe(200);
  }
  expect(await head("/en/services/")).toEqual([]);
});

/* ------------------------------------------------------------------ detail-hero art (PERF3-01) */

test("service / industry heroes: no requestAnimationFrame script before the h1", { tag: "@desktop-only" }, async ({ page }) => {
  for (const l of LOCALES) {
    for (const path of ["services/plc-hmi-programming/", "industries/food-beverage/"]) {
      await page.goto(`/${l}/${path}`);
      const bad = await page.evaluate(() => {
        const h1 = document.querySelector(".lc-hero h1")!;
        return [...document.querySelectorAll(".lc-hero script:not([src])")]
          .filter((s) => /requestAnimationFrame/.test(s.textContent ?? ""))
          .filter((s) => s.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).length;
      });
      expect(bad, `${l}/${path}`).toBe(0);
      // the art is still parked on its rest frame before it plays (never the server's still pose with motion on)
      await expect(page.locator("[data-hero-art] svg[data-lca]")).not.toHaveAttribute("data-play", "rest");
    }
  }
});

/* ------------------------------------------------------------------ back / up morph into a filled card (MOT3-02) */

test(
  "going up from a detail page morphs into a card whose picture is filled first, during the transition",
  { tag: "@desktop-only" },
  async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "cross-document view transitions and request priorities: Chromium");
    const warm = page.waitForResponse(/\/en\/art\/services\/\?v=/);
    const code = page.waitForResponse(/\/LazyArt\.astro\.lc\.[\w-]+\.js$/);
    await page.goto("/en/services/control-panels/");
    await Promise.all([warm, code]); // fetched at idle by the detail page
    await page.addInitScript(() => {
      const w = window as unknown as { __m: { vt?: boolean; fin?: boolean; fill?: { named: string; vting: boolean } } };
      w.__m = {};
      addEventListener("pagereveal", (e) => {
        const t = (e as Event & { viewTransition?: ViewTransition }).viewTransition;
        w.__m.vt = !!t;
        t?.finished.then(() => (w.__m.fin = true));
      });
      new MutationObserver((ms) => {
        for (const m of ms) {
          const el = m.target as SVGElement;
          if (!w.__m.fill && !el.hasAttribute("data-art-src") && el.style.viewTransitionName)
            w.__m.fill = { named: el.style.viewTransitionName, vting: document.documentElement.hasAttribute("data-vting") };
        }
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ["data-art-src"] });
    });
    /* The index page's fragment request: the morph target is filled first, at high priority (the observer path asks
       at low priority, after the load event). No network throttling here: the E2E server's self-signed certificate
       keeps Chromium from caching anything, so the detail page's warm-up cannot pay off in this environment (on a
       slow link with a cache, the fill lands 45–305 ms into the morph: measured on a plain-http build). Request
       interception is not an option either: it switches cross-document view transitions off. */
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    const priorities: string[] = [];
    cdp.on("Network.requestWillBeSent", (e) => {
      if (/\/en\/art\/services\/\?v=/.test(e.request.url)) priorities.push(e.request.initialPriority);
    });
    await page.locator(".lc-hero nav a[href$='/en/services/']").first().click();
    await page.waitForURL(/\/en\/services\/$/);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __m: { fin?: boolean } }).__m.fin), { timeout: 20_000 }).toBe(true);
    const m = await page.evaluate(() => (window as unknown as { __m: { vt?: boolean; fill?: { named: string; vting: boolean } } }).__m);
    expect(m.vt, "a view transition ran").toBe(true);
    expect(m.fill, "the card the morph lands on was filled during the transition").toEqual({ named: "lc-media", vting: true });
    expect(priorities, "one fragment request, at high priority (the morph target first)").toEqual(["High"]);
  },
);

/* ------------------------------------------------------------------ HMI demo, control loop, demo teaser (MOT3-05, MOT3-08, I18N3-06, PERF3-04, CODE3-05, MOT3-09) */

/** Home page demo (expanded from its phone teaser when collapsed), controller ready. */
async function openHomeHmi(page: Page, locale: string) {
  await page.goto(`/${locale}/#hmi-demo`);
  const teaser = page.locator("#hmi-demo .lc-teaser[data-collapsed] .lc-teaser-cta button");
  if (await teaser.isVisible()) await teaser.click();
  const fig = page.locator("#hmi-demo [data-hmi]");
  await fig.scrollIntoViewIfNeeded();
  await expect(fig).toHaveAttribute("data-ready", "1");
  await page.evaluate(() => document.fonts.ready);
  return fig;
}

test.describe("MOT3-05: the HMI keys stay put through the Try-it story", () => {
  // Every state the list goes through (step 1 current → step 3 current → + hint → step 3 done / step 4 current → all
  // done), forced: the list height and the keys' page position must be identical in all of them.
  for (const locale of ["ar", "tr"] as const) {
    for (const width of [360, 390]) {
      test(`[${locale} ${width}px] list height and key position identical in every Try-it state`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        const fig = await openHomeHmi(page, locale);
        const states = await fig.evaluate((f) => {
          const tour = f.querySelector(".lc-hmi-tour")!;
          const lis = [...tour.querySelectorAll<HTMLElement>("li[data-step]")];
          const hint = f.querySelector<HTMLElement>("[data-step-hint]")!;
          const keys = ["start", "fault", "ack"].map((c) => f.querySelector<HTMLElement>(`button[data-c="${c}"]`)!);
          const set = (cur: number, done: number, on: boolean) => {
            lis.forEach((li, i) => {
              li.toggleAttribute("data-done", i < done);
              if (i === cur) li.setAttribute("aria-current", "step");
              else li.removeAttribute("aria-current");
            });
            hint.toggleAttribute("data-on", on);
          };
          const snap = () => ({
            tour: Math.round(tour.getBoundingClientRect().height * 10) / 10,
            keys: keys.map((k) => Math.round((k.getBoundingClientRect().top + scrollY) * 10) / 10).join(","),
            hintShown: getComputedStyle(hint).visibility === "visible",
          });
          const out = [];
          for (const [cur, done, on] of [
            [0, 0, false],
            [2, 2, false],
            [2, 2, true],
            [3, 3, false],
            [-1, 4, false],
          ] as const) {
            set(cur, done, on);
            out.push(snap());
          }
          return out;
        });
        expect(new Set(states.map((s) => s.tour)).size).toBe(1);
        expect(new Set(states.map((s) => s.keys)).size).toBe(1);
        expect(states.map((s) => s.hintShown)).toEqual([false, false, true, false, false]);
      });
    }
  }

  // The real story once (it takes ~25 s): every frame from Start to Acknowledge, the keys never move.
  for (const [locale, width] of [
    ["ar", 360],
    ["tr", 390],
  ] as const) {
    test(
      `[${locale} ${width}px] Start → fault → recovery → Acknowledge: keys sampled every frame never move`,
      { tag: "@desktop-only" },
      async ({ page }) => {
        test.slow();
        await page.setViewportSize({ width, height: 800 });
        const fig = await openHomeHmi(page, locale);
        const scr = fig.locator(".lc-hmi-screen");
        await fig.evaluate((f) => {
          const keys = ["start", "fault", "ack"].map((c) => f.querySelector<HTMLElement>(`button[data-c="${c}"]`)!);
          const w = window as unknown as { __keys: Set<string>; __stop: boolean };
          w.__keys = new Set();
          const tick = () => {
            w.__keys.add(keys.map((k) => Math.round((k.getBoundingClientRect().top + scrollY) * 2) / 2).join(","));
            if (!w.__stop) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        const btn = (c: string) => scr.locator(`button[data-c="${c}"]`);
        await btn("start").click();
        await expect(scr).toHaveAttribute("data-fdv", "fwd", { timeout: 30_000 });
        await expect(btn("fault")).not.toHaveAttribute("aria-disabled", "true");
        await btn("fault").click();
        await expect(fig.locator("[data-step-hint]")).toHaveAttribute("data-on", "");
        await expect(scr).toHaveAttribute("data-fdv", "div", { timeout: 30_000 });
        await expect(scr).toHaveAttribute("data-fdv", "fwd", { timeout: 40_000 });
        await expect(fig.locator("[data-step-hint]")).not.toHaveAttribute("data-on", "");
        await btn("ack").click();
        await expect(fig.locator("[data-step][data-done]")).toHaveCount(4);
        const positions = await page.evaluate(() => {
          const w = window as unknown as { __keys: Set<string>; __stop: boolean };
          w.__stop = true;
          return [...w.__keys];
        });
        expect(positions).toHaveLength(1);
      },
    );
  }
});

test.describe("MOT3-08: the control loop is wired right from the first frame", () => {
  test("phone layout: no HMI → Actuator wire, the PLC → Actuator arc ends on the two icons, before and after the script", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en/technologies/");
    const body = page.locator("[data-loop] .lc-loop-body").first();
    const geometry = () =>
      body.evaluate((b) => {
        const centre = (k: string) => {
          const r = b.querySelector(`[data-k="${k}"] .lc-loop-ic`)!.getBoundingClientRect();
          return r.top + r.height / 2;
        };
        const arc = b.querySelector(".lc-loop-byp")!;
        const r = arc.getBoundingClientRect();
        return {
          anchors: CSS.supports("anchor-name: --a"),
          skip: getComputedStyle(b.querySelector('.lc-loop-wire[data-w="skip"]')!).display,
          arc: getComputedStyle(arc).display,
          top: Math.abs(r.top - (centre("plc") - 1)),
          bottom: Math.abs(r.bottom - (centre("actuator") + 1)),
        };
      });
    // the diagram is far below the first screen: its on-demand script has normally not run yet (data-vis unset)
    const before = await geometry();
    expect(before.skip).toBe("none");
    if (before.anchors) {
      expect(before.arc).toBe("block");
      expect(before.top).toBeLessThan(1);
      expect(before.bottom).toBeLessThan(1);
    }
    await body.evaluate((b) => b.scrollIntoView({ block: "center" }));
    await expect(page.locator("[data-loop]").first()).toHaveAttribute("data-vis", /[01]/);
    await expect.poll(async () => (await geometry()).arc).toBe("block");
    const after = await geometry();
    expect(after.skip).toBe("none");
    expect(after.top).toBeLessThan(1);
    expect(after.bottom).toBeLessThan(1);
  });
});

test.describe("I18N3-06: the HMI KPI line keeps numbers with their units", () => {
  test("[ar 1024px] '≥ 72.0 °C' and '15 s' are one line each, before and after the controller rewrites them", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/ar/services/plc-hmi-programming/");
    const values = page.locator("[data-hmi] .hs-sub b");
    const check = async () => {
      for (const b of await values.all()) {
        expect(await b.textContent()).toMatch(/ /);
        expect(await b.evaluate((el) => el.getClientRects().length)).toBe(1);
      }
    };
    await expect(values).toHaveCount(2);
    const fig = page.locator("[data-hmi]");
    await fig.scrollIntoViewIfNeeded();
    await check();
    await expect(fig).toHaveAttribute("data-ready", "1");
    await check();
  });
});

test.describe("PERF3-04: the HMI stylesheet never holds the parser", () => {
  test("no in-body stylesheet + parser guard; the sheet is requested from <head>; the demo is styled and visible", async ({ page }) => {
    await page.goto("/en/services/plc-hmi-programming/");
    // the server HTML has no in-body stylesheet outside <noscript> and no inline script next to it
    const html = await (await page.request.get("/en/services/plc-hmi-programming/")).text();
    const body = html.slice(html.indexOf("<body"));
    expect(body.replace(/<noscript>[\s\S]*?<\/noscript>/g, "")).not.toMatch(/<link[^>]+rel="?stylesheet[^>]+hmi-demo/);
    expect(body).not.toContain("parser waits");
    await expect(page.locator('head link[rel="stylesheet"][href*="hmi-demo"]')).toHaveCount(1);
    const wrap = page.locator(".lc-hmi-wrap");
    await wrap.scrollIntoViewIfNeeded();
    await expect(wrap).toHaveAttribute("data-styled", "");
    expect(await wrap.evaluate((w) => getComputedStyle(w).visibility)).toBe("visible");
    // styled, and the mimic was fitted once the sheet applied
    await expect(page.locator("[data-hmi] .hs-mimic")).toHaveAttribute("data-fit", /fine|mid|coarse/);
  });

  test.describe("without JavaScript", () => {
    test.use({ javaScriptEnabled: false });
    test("the <noscript> sheet styles the static panel", async ({ page }) => {
      await page.goto("/en/services/plc-hmi-programming/");
      const wrap = page.locator(".lc-hmi-wrap");
      await expect(wrap).toBeVisible();
      expect(await wrap.evaluate((w) => getComputedStyle(w).visibility)).toBe("visible");
      // hmi-demo.css applied: the Try-it list is its flex row, not a bare block
      expect(await page.locator(".lc-hmi-tour").evaluate((t) => getComputedStyle(t).display)).toBe("flex");
    });
  });
});

test.describe("CODE3-05: the HMI controller chunk is gone (a tab opened before a deploy)", () => {
  test.use({
    allowConsole: [
      /Failed to load resource|status of 404|dynamically imported module|Importing a module script failed|ERR_FAILED|MIME type/i,
    ],
  });

  test(
    "a press reloads the page once; after that the static panel stays, with no uncaught errors",
    { tag: "@desktop-only" },
    async ({ page }) => {
      let hits = 0;
      // the built chunk (/_astro/hmi-demo.<hash>.js; the dev server serves the source module)
      await page.route(/\/(?:_astro\/hmi-demo\.[\w-]+\.js|src\/scripts\/motion\/hmi-demo\.ts)(?:\?.*)?$/, (route) => {
        hits++;
        return route.fulfill({ status: 404, contentType: "text/html", body: "<!doctype html><title>404</title>" });
      });
      await page.goto("/en/technologies/");
      const fig = page.locator("[data-hmi]");
      await fig.scrollIntoViewIfNeeded();
      // background loads (near the viewport) fail quietly: no reload
      await expect.poll(() => hits).toBeGreaterThan(0);
      await page.waitForTimeout(500);
      expect(await page.evaluate(() => sessionStorage.getItem("lcReload"))).toBeNull();
      // a press: one reload to get the current build
      const reloaded = page.waitForEvent("load");
      await fig.locator('button[data-c="start"]').click();
      await reloaded;
      expect(await page.evaluate(() => sessionStorage.getItem("lcReload"))).toBe("1");
      // still gone after the reload: a press does nothing more (no loop), the panel stays
      let navigations = 0;
      page.on("framenavigated", (f) => f === page.mainFrame() && navigations++);
      const again = page.locator('[data-hmi] button[data-c="start"]');
      await again.scrollIntoViewIfNeeded();
      await again.click();
      await page.waitForTimeout(1500);
      expect(navigations).toBe(0);
      await expect(page.locator("[data-hmi]")).not.toHaveAttribute("data-ready");
    },
  );
});

test.describe("MOT3-09: short phones see the whole command row after 'Try the live demo'", () => {
  for (const [locale, width, height] of [
    ["en", 360, 640],
    ["ar", 360, 640],
    ["en", 320, 568],
  ] as const) {
    test(`[${locale} ${width}×${height}] Start, Fault and Acknowledge are on screen`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto(`/${locale}/`);
      const btn = page.locator("#hmi-demo .lc-teaser-cta button");
      await btn.scrollIntoViewIfNeeded();
      await btn.click();
      const start = page.locator('#hmi-demo button[data-c="start"]');
      await expect(start).toBeFocused();
      // the (smooth) scroll has settled
      await expect
        .poll(async () => {
          const a = await page.evaluate(() => scrollY);
          await page.waitForTimeout(150);
          return (await page.evaluate(() => scrollY)) === a;
        })
        .toBe(true);
      for (const c of ["start", "fault", "ack"]) {
        const box = (await page.locator(`#hmi-demo button[data-c="${c}"]`).boundingBox())!;
        expect(box.y, c).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height, c).toBeLessThanOrEqual(height);
      }
    });
  }
});

/* ------------------------------------------------------------------ hero video: rest and pause control (MOT3-06 / MOT3-07) */

/** Logs the clip's lifecycle from document start: data-playing flips (with currentTime / paused at that moment),
 *  ended and seeked. */
async function logHeroVideo(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __hv: { k: string; ct: number; paused?: boolean }[] };
    w.__hv = [];
    document.addEventListener("DOMContentLoaded", () => {
      const v = document.querySelector<HTMLVideoElement>("video.lc-hero-video");
      if (!v) return;
      new MutationObserver(() =>
        w.__hv.push({ k: v.hasAttribute("data-playing") ? "on" : "off", ct: v.currentTime, paused: v.paused }),
      ).observe(v, {
        attributes: true,
        attributeFilter: ["data-playing"],
      });
      for (const e of ["ended", "seeked"]) v.addEventListener(e, () => w.__hv.push({ k: e, ct: v.currentTime }));
    });
  });
}
const heroVideoLog = (page: Page) =>
  page.evaluate(() => (window as unknown as { __hv: { k: string; ct: number; paused?: boolean }[] }).__hv);

test.describe("hero video (desktop)", { tag: "@desktop-only" }, () => {
  test("plays once, then rests on the poster by jumping back to its first frame, not by fading over it", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await logHeroVideo(page);
    await page.goto("/en/");
    const video = page.locator("video.lc-hero-video");
    const pause = page.locator("[data-hero-pause]");
    await expect(video).toHaveAttribute("data-playing", "", { timeout: 15_000 });
    await expect(pause).toHaveAttribute("data-shown", "");
    // fast-forward the ~14 s clip
    await video.evaluate((v: HTMLVideoElement) => (v.playbackRate = 16));
    await expect(video).not.toHaveAttribute("data-playing", { timeout: 15_000 });
    const log = await heroVideoLog(page);
    const kinds = log.map((e) => e.k);
    // one play (no second play: no seam); at the end it seeks back to frame 0 (= the poster) and only hands over to the
    // poster from there (frame 0 presented: rVFC, which may run before the 'seeked' event task)
    expect(kinds.filter((k) => k === "ended")).toHaveLength(1);
    expect(kinds).toContain("seeked");
    expect(kinds.indexOf("off")).toBeGreaterThan(kinds.indexOf("ended"));
    const off = log.find((e) => e.k === "off")!;
    expect(off.ct, "position when the video hands over to the poster").toBe(0);
    expect(off.paused).toBe(true);
    // resting: the pause control fades out with the clip
    await expect(pause).not.toHaveAttribute("data-shown");
    await expect(pause).toBeHidden();
    // a mouse entering the hero (from the header bar, which is not part of it) plays it once more, from the start
    await page.mouse.move(700, 8);
    await page.mouse.move(400, 400, { steps: 4 });
    await expect(video).toHaveAttribute("data-playing", "", { timeout: 10_000 });
    expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  });

  for (const lang of ["en", "ar"]) {
    test(`${lang}: the pause control is on the first screen of a 1280×720 laptop and fades in and out`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.goto(`/${lang}/`);
      const pause = page.locator("[data-hero-pause]");
      // before the clip plays: in the layout but invisible (so out of the tab order)
      const before = await pause.evaluate((b) => ({ shown: b.hasAttribute("data-shown"), visibility: getComputedStyle(b).visibility }));
      if (!before.shown) expect(before.visibility).toBe("hidden");
      await expect(page.locator("video.lc-hero-video")).toHaveAttribute("data-playing", "", { timeout: 15_000 });
      await expect(pause).toHaveAttribute("data-shown", "");
      await expect(pause).toBeVisible();
      const r = await pause.evaluate((b) => {
        const q = b.getBoundingClientRect();
        const header = document.querySelector(".lc-header")!.getBoundingClientRect();
        const copy = document.querySelector(".lc-hero-copy")!.getBoundingClientRect();
        const cs = getComputedStyle(b);
        return {
          top: q.top,
          bottom: q.bottom,
          headerBottom: header.bottom,
          clearOfCopy: document.documentElement.dir === "rtl" ? q.right <= copy.left : q.left >= copy.right,
          hit: !!document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2)?.closest("[data-hero-pause]"),
          fades: cs.transitionProperty.includes("opacity") && cs.transitionDuration.split(",").some((d) => parseFloat(d) > 0),
        };
      });
      expect(r.bottom).toBeLessThanOrEqual(720);
      expect(r.top).toBeGreaterThanOrEqual(r.headerBottom);
      expect(r.clearOfCopy).toBe(true);
      expect(r.hit, "nothing covers the control").toBe(true);
      expect(r.fades).toBe(true);
      await pause.click();
      await expect(pause).toHaveAttribute("aria-pressed", "true");
      await expect(pause).toBeVisible(); // stays, to resume
    });
  }
});

/* ------------------------------------------------------------------ phones: titles and the first CTA (VIS3-05, DEV2-09) */

test.describe("Arabic case-study titles on a 360×740 phone", () => {
  test.use({ viewport: { width: 360, height: 740 } });
  // the longest Arabic titles (6 lines of 49 px before VIS3-05, intro below the first screen)
  for (const slug of ["milk-pasteurizer", "pasteurizer-cip-recipes", "shampoo-filling-delta-wecon"]) {
    test(`${slug}: at most 5 lines and the intro starts on the first screen`, async ({ page }) => {
      await page.goto(`/ar/projects/${slug}/`);
      await page.evaluate(() => document.fonts.ready);
      const r = await page.evaluate(() => {
        const h1 = document.querySelector(".lc-hero h1")!;
        const lead = document.querySelector(".lc-hero-copy > p.type-lead")!;
        const h = getComputedStyle(h1);
        const l = getComputedStyle(lead);
        return {
          lines: Math.round(h1.getBoundingClientRect().height / parseFloat(h.lineHeight)),
          h1: parseFloat(h.fontSize),
          lead: parseFloat(l.fontSize),
          leadLine1: lead.getBoundingClientRect().top + parseFloat(l.lineHeight),
        };
      });
      expect(r.lines).toBeLessThanOrEqual(5);
      expect(r.leadLine1).toBeLessThanOrEqual(740);
      expect(r.h1 / r.lead, "the title stays clearly above the intro").toBeGreaterThan(1.6);
    });
  }
  test("a short Arabic page title keeps the full h1 size", async ({ page }) => {
    await page.goto("/ar/services/plc-hmi-programming/");
    const sizes = await page.evaluate(() => {
      const h1 = document.querySelector(".lc-hero h1")!;
      const probe = document.createElement("div");
      probe.style.fontSize = "var(--text-h1)";
      h1.parentElement!.append(probe);
      const full = parseFloat(getComputedStyle(probe).fontSize);
      probe.remove();
      return { h1: parseFloat(getComputedStyle(h1).fontSize), full };
    });
    expect(sizes.h1).toBeCloseTo(sizes.full, 1);
  });
});

test.describe("home hero on a 320×568 phone", () => {
  test.use({ viewport: { width: 320, height: 568 } });
  for (const lang of ["en", "ar", "zh", "tr"]) {
    test(`${lang}: the first call to action is entirely on the first screen`, async ({ page }) => {
      await page.goto(`/${lang}/`);
      await page.evaluate(() => document.fonts.ready);
      const cta = page.locator(".lc-hero-copy .lc-btn").first();
      await expect(cta).toBeVisible();
      const box = (await cta.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(568);
    });
  }
});

test.describe("home hero on a 390×844 phone (unchanged by the 320 px fit)", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("full eyebrow, full-size title, CTA on the first screen", async ({ page }) => {
    await page.goto("/en/");
    const r = await page.evaluate(() => {
      const chips = [...document.querySelectorAll(".lc-hero-copy > ul")].filter((u) => u.getClientRects().length);
      return { chips: chips.length, h1: parseFloat(getComputedStyle(document.querySelector(".lc-hero h1")!).fontSize) };
    });
    expect(r.chips).toBe(1);
    expect(r.h1).toBeCloseTo(30, 0);
    const box = (await page.locator(".lc-hero-copy .lc-btn").first().boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(844);
  });
});
