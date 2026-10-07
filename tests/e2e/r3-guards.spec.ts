/**
 * Runtime guards from audit round 3: regressions that only show in a real browser, checked on every run instead of
 * waiting for the next audit. Every test runs in every project, at that project's viewport (chromium-desktop 1440 px,
 * chromium-mobile Pixel 7, webkit-mobile iPhone 15): "desktop and phone" are the projects. All are tagged @phone, so
 * the push CI's phone subset (`--project=chromium-mobile --grep @phone`) runs them at phone width too.
 *
 *  (a) CLS ≤ 0.02 on load. PERF3-01: the service / industry hero art jumped on many desktop loads (CLS 0.05–0.10),
 *      depending on where the HTML parser happened to yield, so each page loads three times and the worst load counts.
 *      Layout Instability API, shifts without recent input, from navigation to the load event + 1 s, no scrolling or
 *      input. 0.02 is a fifth of Google's "good" limit (0.1): every page measured 0.000 in round 2, so anything above
 *      it is a new shift, not noise. WebKit has no layout-shift entries: skipped there (the reason is reported).
 *  (b) The LCP image is not lazy-loaded and is fetched at high priority. PERF3-02: on phones the first /projects/ card
 *      became the LCP while still loading=lazy at Low priority (+0.9 s LCP on slow links). Two oracles: the browser's
 *      own LCP entry when it is an image, and geometry (the largest image in <main> that covers at least 10 % of the
 *      first screen must not be lazy), which also works where the LCP API is missing or the LCP is text.
 *  (c) WCAG 1.4.12 text spacing (the standard bookmarklet's CSS) does not make the page scroll sideways or push header
 *      / footer content off-screen. A11Y3-05: the Turkish utility bar ran 112 px past a 1280 px viewport. en, ar (RTL)
 *      and tr (the longest labels); the home page and an inner page (the home omits one utility link). The desktop
 *      project checks 1280 px, the phone projects 390 px: they keep touch emulation (coarse-pointer targets are larger),
 *      so the phone width is checked there rather than in a narrowed desktop browser.
 *  (d) A status message is announced while a modal dialog is open. A11Y3-01: the phone drawer's "Copy address"
 *      confirmation went to a live region outside the modal <dialog>; the browser drops everything outside an open
 *      modal from the accessibility tree, so screen-reader users heard nothing. Markup-agnostic: whichever live region
 *      receives the confirmation must be inside the open dialog (and, in Chromium, exposed in the accessibility tree).
 */
import type { Page, TestInfo } from "@playwright/test";
import { test, expect } from "./fixtures";
import { PAGE_TYPES, isNarrow } from "./helpers";

/** (a) / (b): one page per guarded type, plus the RTL home. */
const LOAD_PAGES: Array<[string, string]> = [
  ["home", `/en/${PAGE_TYPES.home}`],
  ["service", `/en/${PAGE_TYPES.service}`],
  ["industry", `/en/${PAGE_TYPES.industry}`],
  ["case study", `/en/${PAGE_TYPES.project}`],
  ["projects index", `/en/${PAGE_TYPES.projects}`],
  ["contact", `/en/${PAGE_TYPES.contact}`],
  ["home, RTL", `/ar/${PAGE_TYPES.home}`],
];
const MAX_CLS = 0.02;
const LOADS = 3;
/** (b) geometric oracle: images smaller than this share of the first screen are not LCP candidates (logos, icons). */
const MIN_IMAGE_SHARE = 0.1;
/** (c) the WCAG 1.4.12 text-spacing bookmarklet's rules. */
const TEXT_SPACING_CSS =
  "* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }";

interface Shift {
  value: number;
  input: boolean;
  at: number;
  sources: string[];
}
interface Probe {
  /** the engine reports layout-shift / largest-contentful-paint entries */
  cls: boolean;
  lcpApi: boolean;
  shifts: Shift[];
  lcp: { tag: string; desc: string; url: string; loading: string | null; fetchpriority: string | null } | null;
}
declare global {
  interface Window {
    __r3?: Probe;
  }
}

/** Runs before the page's own scripts (init script): records layout shifts and the latest LCP entry. Self-contained. */
function installProbe() {
  interface LayoutShiftEntry extends PerformanceEntry {
    value: number;
    hadRecentInput: boolean;
    sources?: Array<{ node: Node | null; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }>;
  }
  const label = (n: Node | null | undefined) => {
    if (!n) return "(removed node)";
    const el = n.nodeType === 1 ? (n as Element) : n.parentElement;
    if (!el) return "(detached text)";
    const one = (e: Element) =>
      e.tagName.toLowerCase() +
      (e.id ? `#${e.id}` : "") +
      [...e.classList]
        .filter((c) => /^[\w-]+$/.test(c))
        .slice(0, 2)
        .map((c) => `.${c}`)
        .join("");
    const path: string[] = [];
    for (let e: Element | null = el, i = 0; e && e !== document.body && i < 4; e = e.parentElement, i++) path.unshift(one(e));
    return (n.nodeType === 3 ? "text in " : "") + path.join(" > ");
  };
  const box = (r: DOMRectReadOnly) => `(${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}×${Math.round(r.height)})`;
  const types = PerformanceObserver.supportedEntryTypes ?? [];
  const probe: Probe = { cls: types.includes("layout-shift"), lcpApi: types.includes("largest-contentful-paint"), shifts: [], lcp: null };
  window.__r3 = probe;
  if (probe.cls)
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as LayoutShiftEntry[])
        probe.shifts.push({
          value: e.value,
          input: e.hadRecentInput,
          at: Math.round(e.startTime),
          sources: (e.sources ?? []).map((s) => `${label(s.node)} ${box(s.previousRect)} → ${box(s.currentRect)}`),
        });
    }).observe({ type: "layout-shift", buffered: true });
  if (probe.lcpApi)
    new PerformanceObserver((list) => {
      const e = list.getEntries().at(-1) as LargestContentfulPaint | undefined;
      if (!e) return;
      const el = e.element;
      const img = el instanceof HTMLImageElement ? el : null;
      probe.lcp = {
        tag: el?.tagName.toLowerCase() ?? "(removed)",
        desc: label(el),
        url: e.url,
        loading: img?.getAttribute("loading") ?? null,
        fetchpriority: img?.getAttribute("fetchpriority") ?? null,
      };
    }).observe({ type: "largest-contentful-paint", buffered: true });
}

/** Load a page and let it settle (fonts, the first idle callbacks, late features): load event + 1 s, no input. */
async function load(page: Page, path: string): Promise<Probe> {
  await page.goto(path, { waitUntil: "load" });
  await page.waitForTimeout(1_000);
  return page.evaluate(() => window.__r3!);
}

const at = (page: Page) => `${page.viewportSize()?.width}×${page.viewportSize()?.height}`;
const note = (testInfo: TestInfo, description: string) => testInfo.annotations.push({ type: "note", description });

/* ------------------------------------------------------------------ (a) layout stability */

for (const [type, path] of LOAD_PAGES) {
  test(
    `(a) no layout shift on load: CLS ≤ ${MAX_CLS} on the ${type} page (${path}), worst of ${LOADS} loads`,
    { tag: "@phone" },
    async ({ page }) => {
      const supported = await page.evaluate(() => (PerformanceObserver.supportedEntryTypes ?? []).includes("layout-shift"));
      test.skip(!supported, "this engine reports no layout-shift entries (Layout Instability API): CLS is measured in Chromium");
      await page.addInitScript(installProbe);
      const loads: Array<{ cls: number; shifts: Shift[] }> = [];
      for (let i = 0; i < LOADS; i++) {
        const shifts = (await load(page, path)).shifts.filter((s) => !s.input);
        loads.push({ cls: shifts.reduce((sum, s) => sum + s.value, 0), shifts });
      }
      const worst = Math.max(...loads.map((l) => l.cls));
      const report = loads
        .map(
          (l, i) =>
            `  load ${i + 1}: CLS ${l.cls.toFixed(4)}${l.shifts.map((s) => `\n    ${s.value.toFixed(4)} at ${s.at} ms: ${s.sources.join("; ")}`).join("")}`,
        )
        .join("\n");
      expect(worst, `layout shifts on ${path} at ${at(page)} (moved node, box before → after):\n${report}`).toBeLessThanOrEqual(MAX_CLS);
    },
  );
}

/* ------------------------------------------------------------------ (b) the LCP image is requested early */

/** The largest image in <main> by its area inside the first screen (null below `minShare` of the screen). */
function largestFirstScreenImage(minShare: number) {
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  let best: { area: number; img: HTMLImageElement } | null = null;
  for (const img of document.querySelectorAll<HTMLImageElement>("main img")) {
    if (img.checkVisibility && !img.checkVisibility({ visibilityProperty: true })) continue;
    const r = img.getBoundingClientRect();
    const w = Math.min(r.right, vw) - Math.max(r.left, 0);
    const h = Math.min(r.bottom, vh) - Math.max(r.top, 0);
    if (w <= 0 || h <= 0) continue;
    if (!best || w * h > best.area) best = { area: w * h, img };
  }
  if (!best || best.area < minShare * vw * vh) return null;
  const { img, area } = best;
  const cls = [...img.classList]
    .filter((c) => /^[\w-]+$/.test(c))
    .slice(0, 3)
    .join(".");
  return {
    desc: `<img${cls ? ` class=…${cls}` : ""}> ${img.currentSrc.split("/").pop()}`,
    share: Math.round((area / (vw * vh)) * 100),
    loading: img.getAttribute("loading"),
    fetchpriority: img.getAttribute("fetchpriority"),
  };
}

for (const [type, path] of LOAD_PAGES) {
  test(
    `(b) the LCP image is not lazy and has fetchpriority=high on the ${type} page (${path})`,
    { tag: "@phone" },
    async ({ page }, testInfo) => {
      await page.addInitScript(installProbe);
      const probe = await load(page, path);
      const where = `${path} at ${at(page)}`;
      const lcp = probe.lcp;
      if (lcp?.tag === "img") {
        expect
          .soft(lcp.loading, `the LCP image on ${where} is loading="lazy" (requested late, at Low priority): ${lcp.desc} ${lcp.url}`)
          .not.toBe("lazy");
        expect.soft(lcp.fetchpriority, `the LCP image on ${where} needs fetchpriority="high": ${lcp.desc} ${lcp.url}`).toBe("high");
      } else {
        note(
          testInfo,
          !probe.lcpApi
            ? "no LCP API in this engine: geometric check only"
            : lcp
              ? `the LCP is a <${lcp.tag}> (${lcp.desc}), not an image`
              : "no LCP entry",
        );
      }
      const big = await page.evaluate(largestFirstScreenImage, MIN_IMAGE_SHARE);
      if (big)
        expect
          .soft(big.loading, `the largest image on the first screen of ${where} (${big.share} % of it) is loading="lazy": ${big.desc}`)
          .not.toBe("lazy");
      else note(testInfo, `no image covers ${MIN_IMAGE_SHARE * 100} % of the first screen`);
    },
  );
}

/* ------------------------------------------------------------------ (c) text spacing */

/** Horizontal overflow: the page scrolling sideways, and visible header / footer content outside the viewport. */
function overflowReport() {
  const vw = document.documentElement.clientWidth;
  const out: string[] = [];
  const name = (e: Element) =>
    e.tagName.toLowerCase() +
    [...e.classList]
      .filter((c) => /^[\w-]+$/.test(c))
      .slice(0, 3)
      .map((c) => `.${c}`)
      .join("");
  const sw = document.scrollingElement?.scrollWidth ?? 0;
  if (sw > vw + 1) out.push(`the page scrolls sideways: scrollWidth ${sw} > viewport ${vw}`);
  const chrome = [...document.querySelectorAll("header, footer")].filter((e) => !e.closest("main, article, dialog"));
  for (const root of chrome)
    for (const el of [root, ...root.querySelectorAll("*")]) {
      if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      const r = el.getBoundingClientRect();
      if (r.width && r.height && (r.right > vw + 1 || r.left < -1))
        out.push(`${root.tagName.toLowerCase()}: ${name(el)} spans ${Math.round(r.left)} → ${Math.round(r.right)} (viewport 0 → ${vw})`);
    }
  return out.slice(0, 15);
}

for (const locale of ["en", "ar", "tr"] as const) {
  test(
    `(c) WCAG text spacing keeps the ${locale} pages inside the viewport (1280 px desktop, 390 px phone)`,
    { tag: "@phone" },
    async ({ page }) => {
      const width = isNarrow(page) ? 390 : 1280;
      await page.setViewportSize({ width, height: isNarrow(page) ? (page.viewportSize()?.height ?? 800) : 800 });
      for (const path of [`/${locale}/`, `/${locale}/about/`]) {
        await page.goto(path, { waitUntil: "load" });
        await page.addStyleTag({ content: TEXT_SPACING_CSS });
        // polled: a layout that adapts to its real width (ResizeObserver, fonts.ready) gets a moment to settle
        await expect
          .poll(() => page.evaluate(overflowReport), { message: `${path} at ${width} px with WCAG 1.4.12 text spacing`, timeout: 2_000 })
          .toEqual([]);
      }
    },
  );
}

/* ------------------------------------------------------------------ (d) live region inside the modal drawer */

/** Live regions by role or aria-live (not "off"). */
const LIVE = '[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"], output';

test(
  "(d) phone drawer (modal dialog): the 'Copy address' confirmation is announced from a live region inside the dialog",
  { tag: "@phone" },
  async ({ page, context, browserName }) => {
    test.skip(!isNarrow(page), "the drawer is < 1024px");
    if (browserName === "chromium") await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/en/about/");
    await page.locator(".lc-menu-open").click();
    const drawer = page.locator("#lc-drawer");
    await expect(drawer).toBeVisible();
    expect(await drawer.evaluate((d: HTMLDialogElement) => d.open && d.matches(":modal")), "the drawer opens as a modal dialog").toBe(true);
    const copy = drawer.locator("button[data-copy]");
    await expect(copy).toHaveCount(1);

    // Remember every live region's text, click, then find the region(s) the confirmation was written to.
    await page.evaluate((sel) => {
      for (const el of document.querySelectorAll<HTMLElement>(sel)) el.dataset.r3Before = el.textContent ?? "";
    }, LIVE);
    await copy.click();
    const announced = async () =>
      page.evaluate((sel) => {
        const dialog = document.querySelector("#lc-drawer");
        return [...document.querySelectorAll<HTMLElement>(sel)]
          .filter((el) => (el.textContent ?? "").trim() && el.textContent !== el.dataset.r3Before)
          .map((el, i) => {
            el.dataset.r3Live = String(i);
            const where = el.parentElement
              ? `${el.parentElement.tagName.toLowerCase()}${el.parentElement.id ? `#${el.parentElement.id}` : ""}`
              : "?";
            return {
              i,
              text: (el.textContent ?? "").trim(),
              inDialog: !!dialog?.contains(el),
              where: `<${el.tagName.toLowerCase()}> in <${where}>`,
            };
          });
      }, LIVE);
    await expect
      .poll(async () => (await announced()).length, { message: "no live region received the copy confirmation" })
      .toBeGreaterThan(0);
    const regions = await announced();
    for (const r of regions)
      expect
        .soft(
          r.inDialog,
          `the confirmation "${r.text}" is written to a live region outside the open modal drawer (${r.where}): screen readers ignore it while the dialog is open`,
        )
        .toBe(true);

    // Chromium: the region is really exposed (not "ignored" because of the active modal dialog).
    if (browserName === "chromium") {
      const cdp = await context.newCDPSession(page);
      const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
      for (const r of regions) {
        const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: `[data-r3-live="${r.i}"]` });
        const { nodes } = await cdp.send("Accessibility.getPartialAXTree", { nodeId, fetchRelatives: false });
        const ax = nodes[0];
        const why = (ax?.ignoredReasons ?? []).map((x) => x.name).join(", ");
        expect
          .soft(ax?.ignored, `the live region with "${r.text}" is ignored in the accessibility tree${why ? ` (${why})` : ""}`)
          .toBe(false);
      }
    }
  },
);
