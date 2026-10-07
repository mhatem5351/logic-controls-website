/**
 * Site chrome, audit round 3 (package R1-chrome): header menus, phone drawer, floating button, footer, breadcrumbs,
 * logo, copy buttons and the page-transition head script.
 *
 *  - UX3-01 menu aim: a pointer on its way from "Services" to the right-hand column of its panel crosses
 *    "Industries"; that must not swap the menus. Paced moves (12 steps, 25 ms apart), recorded in the page.
 *  - MOT3-01: a same-site arrival with the HTML at hand waits for the whole document (<link rel=expect> to #lc-end,
 *    the last element on every page, the 404 included), so the floating button is there to keep and never dims.
 *    Round 4: never for more than 200 ms (a prefetch still downloading, MOT4-01), only in Chromium, only from 64rem
 *    where the button is kept (PSC4-04).
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

/** Counts every time Industries opens, and the longest pause between pointer moves (a stalled run is retried). */
async function recordMenus(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __lcSwaps: number; __lcGap: number; __lcLast: number };
    w.__lcSwaps = 0;
    w.__lcGap = 0;
    w.__lcLast = 0;
    const ind = document.querySelector('button[aria-controls="lc-dd-industries"]')!;
    new MutationObserver(() => ind.getAttribute("aria-expanded") === "true" && w.__lcSwaps++).observe(ind, { attributes: true });
    addEventListener("pointermove", () => {
      const now = performance.now();
      if (w.__lcLast) w.__lcGap = Math.max(w.__lcGap, now - w.__lcLast);
      w.__lcLast = now;
    });
  });
}
const resetRecord = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __lcSwaps: number; __lcGap: number; __lcLast: number };
    w.__lcSwaps = 0;
    w.__lcGap = 0;
    w.__lcLast = 0;
  });
const record = (page: Page) => page.evaluate(() => ({ swaps: (window as unknown as { __lcSwaps: number }).__lcSwaps, gap: (window as unknown as { __lcGap: number }).__lcGap }));

for (const locale of ["en", "ar"] as const)
  for (const width of [1440, 1024])
    test(`[${locale} ${width}px] Services menu: a diagonal path from the label (or chevron) to any item keeps it open (UX3-01)`, async ({ page }) => {
      test.skip(isNarrow(page), "desktop navigation is ≥ 1024px");
      test.setTimeout(60_000);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${locale}/about/`);
      const services = page.locator('header nav button[aria-controls="lc-dd-services"]');
      const industries = page.locator('header nav button[aria-controls="lc-dd-industries"]');
      const label = page.locator("header nav [data-dd]").first().locator("a").first();
      await recordMenus(page);
      const items = page.locator("#lc-dd-services .lc-dd-link");
      const n = await items.count();
      // every item from the label; the right-hand column (odd items) also from the chevron, the closest start
      const paths = [...Array(n).keys()].map((i) => ({ i, from: label })).concat([...Array(n).keys()].filter((i) => i % 2).map((i) => ({ i, from: services })));
      for (const { i, from } of paths) {
        let result = { swaps: 0, gap: 0 };
        for (let attempt = 0; attempt < 3; attempt++) {
          await page.mouse.move(width / 2, 860);
          await expect(services).toHaveAttribute("aria-expanded", "false");
          const o = (await from.boundingBox())!;
          await page.mouse.move(o.x + o.width / 2, o.y + o.height / 2, { steps: 3 });
          await expect(services).toHaveAttribute("aria-expanded", "true");
          const t = (await items.nth(i).boundingBox())!;
          const [sx, sy, tx, ty] = [o.x + o.width / 2, o.y + o.height / 2, t.x + t.width / 2, t.y + t.height / 2];
          await resetRecord(page);
          for (let s = 1; s <= 12; s++) {
            await page.mouse.move(sx + ((tx - sx) * s) / 12, sy + ((ty - sy) * s) / 12);
            await page.waitForTimeout(25);
          }
          await page.waitForTimeout(250);
          result = await record(page);
          // a pause of > 120 ms between two moves is a resting pointer (the swap is then right): a stalled run, retry
          if (!result.swaps || result.gap < 120) break;
        }
        const what = `item ${i + 1} (${(await items.nth(i).innerText()).trim()}) from the ${from === label ? "label" : "chevron"}`;
        expect(result.swaps, `${what}: Industries opened on the way`).toBe(0);
        await expect(services, `${what}: Services closed`).toHaveAttribute("aria-expanded", "true");
        await expect(industries).toHaveAttribute("aria-expanded", "false");
      }
      // a deliberate move to Industries still swaps the menus once the pointer rests there
      const ind = (await page.locator("header nav [data-dd]").nth(1).locator("a").first().boundingBox())!;
      await page.mouse.move(ind.x + ind.width / 2, ind.y + ind.height / 2, { steps: 4 });
      await expect(industries).toHaveAttribute("aria-expanded", "true");
      await expect(services).toHaveAttribute("aria-expanded", "false");
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

test("same-site navigation (desktop): the floating button exists at the reveal and stays fully shown through the transition (MOT3-01)", async ({ page }) => {
  test.skip(isNarrow(page), "the button is carried across pages from 1024px");
  await page.addInitScript(() => {
    try {
      sessionStorage.lcIntro = 1;
      sessionStorage.lcPing = 1;
    } catch {}
    // when the head script adds the render-blocking link, and when it is taken out again (MOT4-01: capped at 200 ms)
    const life = { added: -1, removed: -1 };
    const isExpect = (n: Node) => n instanceof HTMLLinkElement && n.rel === "expect";
    new MutationObserver((ms) => {
      for (const m of ms) {
        if ([...m.addedNodes].some(isExpect)) life.added = performance.now();
        if ([...m.removedNodes].some(isExpect)) {
          life.removed = performance.now();
          sessionStorage.__r3expect = JSON.stringify(life);
        }
      }
    }).observe(document, { childList: true, subtree: true });
    addEventListener("pagereveal", (e) => {
      const t = (e as Event & { viewTransition?: ViewTransition | null }).viewTransition;
      const J = {
        vt: !!t,
        expect: life.added >= 0,
        // the 200 ms cap lifted the block before the end of the document was parsed (a slow machine)
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
  // the wait is capped (MOT4-01): the link is taken out 200 ms after it was added, whether or not the HTML is all here
  await expect.poll(() => page.evaluate(() => sessionStorage.__r3expect ?? ""), { timeout: 2_000 }).not.toBe("");
  const life = JSON.parse(await page.evaluate(() => sessionStorage.__r3expect!)) as { added: number; removed: number };
  expect(life.removed - life.added, "the render-blocking link's lifetime (ms)").toBeLessThanOrEqual(300);
  expect(await page.locator('link[rel="expect"]').count()).toBe(0);
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
