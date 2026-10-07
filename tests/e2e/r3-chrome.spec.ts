/**
 * Site chrome, audit round 3 (package R1-chrome): header menus, phone drawer, floating button, footer, breadcrumbs,
 * logo, copy buttons and the page-transition head script.
 *
 *  - UX3-01 menu aim: a pointer on its way from "Services" to the right-hand column of its panel crosses
 *    "Industries"; that must not swap the menus. Paced moves (12 steps, 50 ms apart on the page's clock).
 *  - MOT3-01: a same-site arrival with the HTML at hand waits for the whole document (<link rel=expect> to #lc-end,
 *    the last element on every page, the 404 included), so the floating button is there to keep and never dims.
 *    Round 4: only in Chromium, only from 64rem where the button is kept (PSC4-04); a prefetch (which may still be
 *    downloading) waits at most 600 ms (MOT4-01), an arrival from the HTTP cache (only parsing left) is not capped.
 *  - MOT3-04: leaving through the open phone drawer lifts only the drawer's own bar into the transition.
 *  - A11Y3-01 (DOM side; the accessibility-tree side is r3-guards (d)), A11Y3-05 (1366 / 1440; r3-guards (c) does 1280),
 *    PERF3-03 logo candidates, UX3-04 floating button over a wrapped link, VIS3-06 drawer labels, VIS3-07 footer
 *    columns, VIS3-09 / I18N3-04 Arabic phone breadcrumb.
 * Engine-dependent parts (view transitions, render blocking, prefetch) skip with the reason when the engine or the run
 * does not have them, never fail on their absence.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { isNarrow, PAGE_TYPES } from "./helpers";

const TEXT_SPACING_CSS =
  "* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }";

/* ------------------------------------------------------------------ UX3-01 menu aim */

/** Counts every time Industries opens, and keeps where the page last saw the pointer (window, capture phase). */
async function recordMenus(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __lcSwaps: number; __lcAt: [number, number] };
    w.__lcSwaps = 0;
    w.__lcAt = [-1, -1];
    const ind = document.querySelector('button[aria-controls="lc-dd-industries"]')!;
    new MutationObserver(() => ind.getAttribute("aria-expanded") === "true" && w.__lcSwaps++).observe(ind, { attributes: true });
    addEventListener("pointermove", (e) => (w.__lcAt = [e.clientX, e.clientY]), true);
  });
}
/** Moves the mouse and waits until the page has handled the move: a busy browser delivers moves late (at its next
 *  frame), and the page's clock must not run ahead of them. */
async function moveTo(page: Page, x: number, y: number, steps = 1) {
  await page.mouse.move(x, y, { steps });
  await expect
    .poll(() => page.evaluate(([x, y]) => {
      const [px, py] = (window as unknown as { __lcAt: [number, number] }).__lcAt;
      return Math.abs(px - x) <= 1 && Math.abs(py - y) <= 1;
    }, [x, y]), { intervals: [10, 25, 50, 100] })
    .toBe(true);
}
const swaps = (page: Page) => page.evaluate(() => (window as unknown as { __lcSwaps: number }).__lcSwaps);
const resetSwaps = (page: Page) => page.evaluate(() => ((window as unknown as { __lcSwaps: number }).__lcSwaps = 0));

/* The page runs on the test's clock (page.clock), and each move is handled before the clock goes on: the path's 12
   moves are 50 ms apart for the page however slowly a busy runner delivers them, so a stalled runner can never look
   like a pointer resting on Industries (the hover delay is 140 ms; on real time a slow CI runner did exactly that). 50 ms is a slow, human diagonal: without the aim logic
   the paths that cross Industries the longest do swap the menus (checked at the end, so the test cannot go vacuous). */
const STEP_MS = 50;

for (const locale of ["en", "ar"] as const)
  for (const width of [1440, 1024])
    test(`[${locale} ${width}px] Services menu: a diagonal path from the label (or chevron) to any item keeps it open (UX3-01)`, async ({ page }) => {
      test.skip(isNarrow(page), "desktop navigation is ≥ 1024px");
      test.setTimeout(120_000); // 13 paths of 12 moves, each one handled before the clock goes on
      await page.setViewportSize({ width, height: 900 });
      await page.clock.install();
      await page.goto(`/${locale}/about/`);
      // from here the page's time only moves with runFor (an installed clock otherwise follows real time)
      await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
      const services = page.locator('header nav button[aria-controls="lc-dd-services"]');
      const industries = page.locator('header nav button[aria-controls="lc-dd-industries"]');
      const label = page.locator("header nav [data-dd]").first().locator("a").first();
      await recordMenus(page);
      const items = page.locator("#lc-dd-services .lc-dd-link");
      const n = await items.count();
      /** From the start (label or chevron) to item i in 12 paced moves; how often Industries opened on the way. */
      const walk = async (i: number, from: typeof label) => {
        await moveTo(page, width / 2, 860);
        await page.clock.runFor(400); // a menu that hover opened closes once the pointer has left it
        await expect(services).toHaveAttribute("aria-expanded", "false");
        await expect(industries).toHaveAttribute("aria-expanded", "false");
        const o = (await from.boundingBox())!;
        await moveTo(page, o.x + o.width / 2, o.y + o.height / 2, 3);
        await page.clock.runFor(200); // hover intent
        await expect(services).toHaveAttribute("aria-expanded", "true");
        await expect(items.nth(i)).toBeVisible();
        const t = (await items.nth(i).boundingBox())!;
        const [sx, sy, tx, ty] = [o.x + o.width / 2, o.y + o.height / 2, t.x + t.width / 2, t.y + t.height / 2];
        await resetSwaps(page);
        for (let s = 1; s <= 12; s++) {
          await moveTo(page, sx + ((tx - sx) * s) / 12, sy + ((ty - sy) * s) / 12);
          await page.clock.runFor(STEP_MS);
        }
        await page.clock.runFor(250);
        return swaps(page);
      };
      // every item from the label; the right-hand column (odd items) also from the chevron, the closest start
      const fromChevron = [...Array(n).keys()].filter((i) => i % 2);
      const paths = [...Array(n).keys()].map((i) => ({ i, from: label })).concat(fromChevron.map((i) => ({ i, from: services })));
      for (const { i, from } of paths) {
        const opened = await walk(i, from);
        const what = `item ${i + 1} (${(await items.nth(i).innerText()).trim()}) from the ${from === label ? "label" : "chevron"}`;
        expect(opened, `${what}: Industries opened on the way`).toBe(0);
        await expect(services, `${what}: Services closed`).toHaveAttribute("aria-expanded", "true");
        await expect(industries).toHaveAttribute("aria-expanded", "false");
      }
      // a deliberate move to Industries still swaps the menus once the pointer rests there
      const ind = (await page.locator("header nav [data-dd]").nth(1).locator("a").first().boundingBox())!;
      await moveTo(page, ind.x + ind.width / 2, ind.y + ind.height / 2, 4);
      await page.clock.runFor(300);
      await expect(industries).toHaveAttribute("aria-expanded", "true");
      await expect(services).toHaveAttribute("aria-expanded", "false");
      // control: the chevron path that crosses Industries the longest, with the menu aim switched off (the header never
      // sees the moves), does swap the menus at this pace: the test is not vacuous
      await page.evaluate(() => addEventListener("pointermove", (e) => e.stopPropagation(), true));
      expect(await walk(fromChevron[0]!, services), "without the menu aim, Industries opens on the way").toBeGreaterThan(0);
    });

/* ------------------------------------------------------------------ MOT3-01 render blocking + kept button */

/** "ok" when #lc-end is a child of <body> with nothing of the page after it (only scripts / styles / custom elements
 *  that a host or tool may inject), else what is wrong. */
function endMarker() {
  const end = document.getElementById("lc-end");
  if (!end || end.parentElement !== document.body) return "no #lc-end in <body>";
  const after: string[] = [];
  for (let el = end.nextElementSibling; el; el = el.nextElementSibling)
    if (!/^(SCRIPT|STYLE|TEMPLATE|LINK)$/.test(el.tagName) && !el.tagName.includes("-")) after.push(el.tagName.toLowerCase());
  return after.length ? `page content after #lc-end: ${after.join(", ")}` : "ok";
}

test("every page ends with #lc-end, the render-blocking target (MOT3-01)", async ({ page }) => {
  for (const path of [`/en/${PAGE_TYPES.home}`, `/ar/${PAGE_TYPES.project}`, `/zh/${PAGE_TYPES.contact}`]) {
    await page.goto(path);
    expect(await page.evaluate(endMarker), path).toBe("ok");
  }
});

test.describe("404", () => {
  test.use({ allowConsole: [/status of 404/] });
  test("the 404 page has the #lc-end target too (rendering can never wait for an element that is not there)", async ({ page }) => {
    const r = await page.goto("/en/no-such-page-r3/");
    expect(r?.status()).toBe(404);
    expect(await page.evaluate(endMarker)).toBe("ok");
  });
});

/** Records when the head script adds the render-blocking link (with what the navigation entry said then) and when
 *  it is taken out again (sessionStorage.__r3expect, MOT4-01). Runs before the page's scripts. */
function watchExpect() {
  const life = { added: -1, removed: -1, responseEnd: -1, deliveryType: "" };
  (window as unknown as { __life: typeof life }).__life = life;
  const isExpect = (n: Node) => n instanceof HTMLLinkElement && n.rel === "expect";
  const save = () => (sessionStorage.__r3expect = JSON.stringify(life));
  new MutationObserver((ms) => {
    for (const m of ms) {
      if ([...m.addedNodes].some(isExpect)) {
        const n = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming & { deliveryType?: string };
        Object.assign(life, { added: performance.now(), responseEnd: n.responseEnd, deliveryType: n.deliveryType ?? "" });
        save();
      }
      if ([...m.removedNodes].some(isExpect)) {
        life.removed = performance.now();
        save();
      }
    }
  }).observe(document, { childList: true, subtree: true });
}
type Life = { added: number; removed: number; responseEnd: number; deliveryType: string };

test("same-site navigation (desktop): the floating button exists at the reveal and stays fully shown through the transition (MOT3-01)", async ({ page }) => {
  test.skip(isNarrow(page), "the button is carried across pages from 1024px");
  await page.addInitScript(watchExpect);
  await page.addInitScript(() => {
    try {
      sessionStorage.lcIntro = 1;
      sessionStorage.lcPing = 1;
    } catch {}
    addEventListener("pagereveal", (e) => {
      const t = (e as Event & { viewTransition?: ViewTransition | null }).viewTransition;
      const life = (window as unknown as { __life: Life }).__life;
      const J = {
        vt: !!t,
        expect: life.added >= 0,
        // the cap lifted the block before the end of the document was parsed (a slow machine)
        capped: life.removed >= 0,
        parsed: !!document.getElementById("lc-end"),
        fabAtReveal: !!document.querySelector(".lc-fab"),
        fab: [] as number[],
      };
      const save = () => (sessionStorage.__r3mot = JSON.stringify(J));
      if (!t) return save();
      let done = false;
      const frame = () => {
        const f = document.querySelector(".lc-fab");
        J.fab.push(f ? +getComputedStyle(f).opacity : -1);
        if (!done) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
      t.finished.finally(() => ((done = true), save()));
    });
  });
  await page.goto("/en/about/");
  const fab = page.locator(".lc-fab");
  await expect(fab).not.toHaveAttribute("data-hidden");
  // a real pointer rests on the link first (the speculation rules prefetch it), then clicks
  const home = page.locator('header a[href="/en/"]').first();
  await home.hover();
  await page.waitForTimeout(700);
  await page.evaluate(() => (delete sessionStorage.__r3mot, delete sessionStorage.__r3expect)); // this page's own (first) reveal
  await home.click();
  await page.waitForURL("**/en/");
  await expect.poll(() => page.evaluate(() => sessionStorage.__r3mot ?? ""), { timeout: 5_000 }).not.toBe("");
  const J = JSON.parse(await page.evaluate(() => sessionStorage.__r3mot!)) as {
    vt: boolean;
    expect: boolean;
    capped: boolean;
    parsed: boolean;
    fabAtReveal: boolean;
    fab: number[];
  };
  test.skip(!J.vt, "no cross-document view transition in this engine");
  test.skip(!J.expect, "the HTML was not prefetched in this run, or not Chromium: no render blocking (by design)");
  if (!J.capped) {
    expect(J.parsed, "the first frame waited for the end of the document").toBe(true);
    expect(J.fabAtReveal, "the floating button exists when the transition starts").toBe(true);
    expect(Math.min(...J.fab), "the kept button never dims or disappears during the transition").toBeGreaterThan(0.99);
  }
  /* A prefetch reports no responseEnd (finished or still downloading), so the wait is capped (MOT4-01): the link is
     taken out 600 ms after it was added. Never sooner (a 200 ms cap showed half-parsed heroes on slow machines); the
     upper bound only proves there is a cap (a timer runs late while a slow machine parses). */
  const life = JSON.parse(await page.evaluate(() => sessionStorage.__r3expect!)) as Life;
  test.skip(life.deliveryType !== "navigational-prefetch", "the HTML came from the cache in this run: no cap there (next test)");
  expect(life.responseEnd).toBe(0);
  await expect
    .poll(async () => (JSON.parse(await page.evaluate(() => sessionStorage.__r3expect!)) as Life).removed, { timeout: 10_000 })
    .toBeGreaterThan(0);
  const done = JSON.parse(await page.evaluate(() => sessionStorage.__r3expect!)) as Life;
  expect(done.removed - done.added, "the render-blocking link's lifetime (ms)").toBeGreaterThanOrEqual(580);
  expect(done.removed - done.added, "the render-blocking link's lifetime (ms)").toBeLessThan(5_000);
  expect(await page.locator('link[rel="expect"]').count()).toBe(0);
});

test("an arrival from the HTTP cache (only parsing left) waits for the whole document, with no cap (MOT3-01 / MOT4-01)", async ({ page }) => {
  test.skip(isNarrow(page), "render blocking is only used from 64rem");
  await page.addInitScript(watchExpect);
  await page.addInitScript(() =>
    addEventListener("pagereveal", () => (sessionStorage.__r3parsed = String(!!document.getElementById("lc-end")))),
  );
  await page.goto("/ar/");
  await page.evaluate(() => (delete sessionStorage.__r3expect, delete sessionStorage.__r3parsed));
  await page.goto("/ar/"); // same-site, the HTML from the HTTP cache (revalidated)
  const life = JSON.parse((await page.evaluate(() => sessionStorage.__r3expect)) ?? "null") as Life | null;
  test.skip(!life || life.deliveryType !== "cache", "the HTML did not come from the cache in this run: no render blocking (by design)");
  expect(life!.responseEnd, "the whole response was here when the head script ran").toBeGreaterThan(0);
  expect(await page.evaluate(() => sessionStorage.__r3parsed), "the first frame waited for the end of the document").toBe("true");
  await page.waitForTimeout(800); // past where a cap would have fired
  expect((JSON.parse(await page.evaluate(() => sessionStorage.__r3expect!)) as Life).removed, "not taken out by a timer").toBe(-1);
});

test("phones: a same-site arrival never waits for the whole document (no render-blocking link below 64rem, PSC4-04)", { tag: "@phone" }, async ({
  page,
}) => {
  test.skip(!isNarrow(page), "phone widths");
  await page.addInitScript(() => {
    new MutationObserver((ms) => {
      if (ms.some((m) => [...m.addedNodes].some((n) => n instanceof HTMLLinkElement && n.rel === "expect"))) sessionStorage.__r4expect = "added";
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto("/en/about/");
  await page.evaluate(() => delete sessionStorage.__r4expect);
  const home = page.locator('main a[href="/en/"], footer a[href="/en/"]').first();
  await home.scrollIntoViewIfNeeded();
  await home.tap();
  await page.waitForURL("**/en/");
  await page.waitForLoadState("load");
  expect(await page.evaluate(() => sessionStorage.__r4expect ?? "")).toBe("");
});

/* ------------------------------------------------------------------ MOT3-04 drawer → page */

test("phone drawer: following a link from it names only the drawer's bar (no header / floating button over the sheet, MOT3-04)", { tag: "@phone" }, async ({ page }) => {
  test.skip(!isNarrow(page), "the drawer is < 1024px");
  await page.addInitScript(() => {
    // registered after the head script's own pageswap listener, so it sees the names that one set
    addEventListener("DOMContentLoaded", () =>
      addEventListener("pageswap", (e) => {
        const name = (sel: string) => document.querySelector<HTMLElement>(sel)?.style.viewTransitionName ?? "";
        sessionStorage.__r3swap = JSON.stringify({
          vt: !!(e as Event & { viewTransition?: unknown }).viewTransition,
          header: name(".lc-header"),
          fab: name(".lc-fab"),
          bar: name(".lc-drawer-bar"),
          lcFab: sessionStorage.lcFab ?? null,
        });
      }),
    );
  });
  await page.goto("/en/about/");
  await page.evaluate(() => scrollTo(0, 1600));
  await page.locator(".lc-menu-open").click();
  const drawer = page.locator("#lc-drawer");
  await expect(drawer).toBeVisible();
  // the logo sits at the bar's start edge (it was centred by an empty <source> box in Chromium)
  // (one measurement for both: the sheet may still be sliding in)
  const inset = await drawer.locator(".lc-drawer-bar").evaluate((bar) => bar.querySelector("img")!.getBoundingClientRect().left - bar.getBoundingClientRect().left);
  expect(Math.abs(inset - 20)).toBeLessThanOrEqual(2);
  await drawer.getByRole("link", { name: "Projects", exact: true }).click();
  await page.waitForURL("**/en/projects/");
  const swap = JSON.parse((await page.evaluate(() => sessionStorage.__r3swap)) ?? "null") as { vt: boolean; header: string; fab: string; bar: string; lcFab: string | null } | null;
  test.skip(!swap?.vt, "no cross-document view transition in this engine");
  expect(swap!.header, "the page header is not lifted above the closing sheet").toBe("");
  expect(swap!.fab, "the floating button is not lifted above the closing sheet").toBe("");
  expect(swap!.bar, "the sheet's own bar crossfades into the new header").toBe("lc-header");
  expect(swap!.lcFab, "the next page does not force the button on").toBe("");
});

/* ------------------------------------------------------------------ A11Y3-01 / A11Y3-05 */

test("every 'Copy address' button has its own status region next to it, in the same container (A11Y3-01)", async ({ page }) => {
  for (const path of ["/en/about/", "/zh/"]) {
    await page.goto(path);
    const bad = await page.evaluate(() =>
      [...document.querySelectorAll("button[data-copy]")]
        .filter((b) => !b.parentElement?.querySelector(':scope > [data-copy-live][role="status"]'))
        .map((b) => b.closest("dialog, footer, [popover], main, header")?.tagName ?? "?"),
    );
    expect(bad, `${path}: copy buttons without their own region`).toEqual([]);
  }
});

for (const width of [1366, 1440])
  test(`[tr ${width}px] text spacing: the utility bar steps down to its compact forms and stays on screen (A11Y3-05)`, async ({ page }) => {
    test.skip(isNarrow(page), "the utility bar is ≥ 1024px");
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/tr/about/");
    const util = page.locator(".lc-util");
    await expect(util).not.toHaveAttribute("data-tight"); // default text: unchanged
    await page.addStyleTag({ content: TEXT_SPACING_CSS });
    await expect(util).toHaveAttribute("data-tight", /^[12]$/);
    const r = await page.evaluate(() => {
      const t = document.querySelector(".lc-util-mt [data-motion-toggle]")!.getBoundingClientRect();
      return { over: document.documentElement.scrollWidth - document.documentElement.clientWidth, right: t.right, vw: document.documentElement.clientWidth };
    });
    expect(r.over, "no sideways scroll").toBeLessThanOrEqual(0);
    expect(r.right, "the pause switch is on screen").toBeLessThanOrEqual(r.vw);
    // the label is visually hidden, not removed: the switch keeps its name
    await expect(page.locator(".lc-util-mt [data-motion-toggle]")).toHaveAccessibleName(/Animasyonları duraklat/);
  });

/* ------------------------------------------------------------------ PERF3-03 logo candidates */

test("logo: the AVIF <source> carries the same sizes as the <img>, so each screen density gets its own file (PERF3-03)", async ({ page }) => {
  await page.goto("/en/about/");
  const r = await page.evaluate(() => {
    const img = document.querySelector<HTMLImageElement>("header img")!;
    const src = img.closest("picture")!.querySelector("source")!;
    const cands = src.srcset.split(",").map((c) => {
      const [url, w] = c.trim().split(/\s+/);
      return { url: new URL(url!, location.href).href, w: parseInt(w!, 10) };
    });
    return { sizes: src.getAttribute("sizes"), imgSizes: img.getAttribute("sizes"), cur: img.currentSrc, cands, dpr: devicePixelRatio, cssW: parseInt(img.getAttribute("width")!, 10) };
  });
  expect(r.sizes).toBe(r.imgSizes);
  expect(r.sizes).toBe(`${r.cssW}px`);
  // the smallest candidate that covers the image at this density (the largest one above 3x)
  const need = r.cssW * r.dpr;
  const want = r.cands.find((c) => c.w >= need - 0.5) ?? r.cands.at(-1)!;
  expect(r.cur).toBe(want.url);
});

/* ------------------------------------------------------------------ UX3-04 floating button over a wrapped link */

test("phone: the floating button steps aside when a wrapped case-study link's line is under it (UX3-04)", { tag: "@phone" }, async ({ page }) => {
  test.skip(!isNarrow(page), "phone layout");
  await page.addInitScript(() => {
    try {
      sessionStorage.lcIntro = 1;
      sessionStorage.lcPing = 1;
    } catch {}
  });
  await page.goto("/en/technologies/");
  const fab = page.locator(".lc-fab");
  const target = await page.evaluate(() => {
    const f = document.querySelector<HTMLElement>(".lc-fab")!;
    const b = f.getBoundingClientRect();
    const ty = parseFloat(getComputedStyle(f).translate.split(" ")[1] ?? "0") || 0;
    const mid = (b.top + b.bottom) / 2 - ty;
    for (const a of document.querySelectorAll<HTMLAnchorElement>("main li a[href*='/projects/']")) {
      const rects = [...a.getClientRects()].filter((r) => r.width > 0);
      if (rects.length < 2) continue;
      // a later line of the wrapped link that reaches under the button
      const line = rects.slice(1).findLast((r) => r.right > b.left + 8 && r.left < b.right - 8);
      if (line) return { dy: line.top + line.height / 2 - mid, href: a.getAttribute("href") };
    }
    return null;
  });
  test.skip(!target, "no wrapped case-study link reaches under the button at this width");
  await page.evaluate((dy) => scrollBy(0, dy), target!.dy);
  await expect(fab, `the button covers ${target!.href}`).toHaveAttribute("data-hidden", "", { timeout: 4_000 });
});

/* ------------------------------------------------------------------ VIS3-06 drawer labels */

test("phone drawer: the action labels stay on one line (tr short WhatsApp label; 320 px in en / ar) (VIS3-06)", { tag: "@phone" }, async ({ page }) => {
  test.skip(!isNarrow(page), "the drawer is < 1024px");
  for (const [locale, width] of [["tr", 0], ["en", 320], ["ar", 320], ["tr", 320]] as const) {
    if (width) await page.setViewportSize({ width, height: 700 });
    await page.goto(`/${locale}/about/`);
    await page.locator(".lc-menu-open").click();
    const drawer = page.locator("#lc-drawer");
    await expect(drawer).toBeVisible();
    const lines = await drawer.evaluate((d) =>
      [...d.querySelectorAll<HTMLElement>(".lc-btn[data-size='lg'] .lc-btn-label, .lc-tel-label")].map((el) => {
        const tops = new Set<number>();
        const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let n = walk.nextNode(); n; n = walk.nextNode()) {
          if (!n.textContent?.trim() || n.parentElement?.closest(".sr-only")) continue;
          const range = document.createRange();
          range.selectNodeContents(n);
          for (const r of range.getClientRects()) if (r.width > 1) tops.add(Math.round(r.top / 6));
        }
        return { text: el.textContent!.trim().replace(/\s+/g, " "), lines: tops.size };
      }),
    );
    for (const l of lines) expect.soft(l.lines, `${locale} ${width || "device"}px: "${l.text}"`).toBe(1);
    await page.keyboard.press("Escape");
  }
});

/* ------------------------------------------------------------------ VIS3-07 footer columns */

for (const width of [1280, 1440])
  test(`[${width}px] footer: every service and industry name stays on one line (VIS3-07)`, async ({ page }) => {
    test.skip(isNarrow(page), "desktop footer");
    await page.setViewportSize({ width, height: 900 });
    for (const locale of ["en", "tr", "ar"]) {
      await page.goto(`/${locale}/about/`);
      const wrapped = await page.evaluate(() => {
        const cols = [...document.querySelectorAll(".lc-foot-nav > div")].slice(0, 2);
        return cols.flatMap((c) =>
          [...c.querySelectorAll("a")]
            .filter((a) => {
              const tops = new Set<number>();
              const walk = document.createTreeWalker(a, NodeFilter.SHOW_TEXT);
              for (let n = walk.nextNode(); n; n = walk.nextNode()) {
                if (!n.textContent?.trim()) continue;
                const range = document.createRange();
                range.selectNodeContents(n);
                for (const r of range.getClientRects()) if (r.width > 1) tops.add(Math.round(r.top / 6));
              }
              return tops.size > 1;
            })
            .map((a) => a.textContent!.trim()),
        );
      });
      expect(wrapped, `${locale} ${width}px`).toEqual([]);
    }
  });

/* ------------------------------------------------------------------ VIS3-09 / I18N3-04 Arabic phone breadcrumb */

test("Arabic phone breadcrumb: a Latin brand name in the clamped crumb is whole or left out, never cut (VIS3-09)", { tag: "@phone" }, async ({ page }) => {
  test.skip(!isNarrow(page), "the crumb is clamped below 640px");
  await page.goto("/ar/projects/concrete-batching-plant-scada/");
  const cur = page.locator('nav [aria-current="page"]').first();
  const r = await cur.evaluate((el) => ({
    clamped: el.scrollWidth > el.clientWidth,
    isolates: [...el.querySelectorAll("bdi, [dir='ltr']")].map((b) => getComputedStyle(b).display),
  }));
  expect(r.isolates.length).toBeGreaterThan(0);
  for (const d of r.isolates) expect(d, "Latin runs are atomic in the clamped crumb").toBe("inline-block");
});
