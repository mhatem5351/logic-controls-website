/**
 * Round-3 guards for the content pages (package R4-pages), checked in a real browser at the widths where they broke:
 *  (a) Display headings never cut a word without a hyphen and never start a line with punctuation (I18N3-03, VIS3-03,
 *      VIS3-04): "manufacturer|s" (en FAQ, 1024–1100), "Commissionin|g)" (ar H1, 320), "Troubleshooting / , …"
 *      (en H1, 320), "：" leading a zh H1 line (320), "Pharmaceuti|cal" (home tiles, 640–704). A break inside a word is
 *      only allowed at a soft hyphen (Turkish, text engine) or where the browser hyphenates (`hyphens: auto` on card /
 *      tile titles). Phone widths run in the phone projects, the 1024 / 1100 checks in the desktop project.
 *      Round 4 (VI4-01): the industry pages' service tiles, every 2 px from 640 to 700 (the 4-column switch), where
 *      "Troubleshooting / , maintenance" started a line with the comma in WebKit.
 *  (b) Service pages with 3 or 4 platforms show one row of equal logo cells on tablets (VIS3-02).
 *  (c) Touch screens: the closing band's phone / email links are 44px tall (DEV2-07).
 *  (d) The zone card's CTA is one line on phones (VIS3-06).
 *  (e) The swoosh appears only in closing CTA bands (VIS3-08).
 */
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

/** Breaks inside words (no soft hyphen, no auto hyphenation) and lines starting with closing punctuation. */
async function badHeadingBreaks(page: Page): Promise<string[]> {
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => {
    const WORD = /[\p{L}\p{N}\p{M}]/u;
    const HAN = /[\u3400-\u9FFF\uF900-\uFAFF]/;
    const CLOSE = /[、，。：；！？）」』】》”,.:;!?)]/;
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("h1, h2, h3, .lc-tile-title, .lc-card-title")) {
      if (!el.getClientRects().length || el.closest(".sr-only, [hidden], [aria-hidden='true']")) continue;
      const lh = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.2;
      const chars: Array<{ ch: string; top: number; gap: string; auto: boolean }> = [];
      let gap = "";
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n instanceof Element) {
          if (n.tagName === "WBR") gap += "\u200B";
          continue;
        }
        const parent = (n as Text).parentElement!;
        if (parent.closest(".sr-only")) continue;
        const pcs = getComputedStyle(parent);
        if (pcs.display === "none") continue;
        const data = (n as Text).data;
        const range = document.createRange();
        for (let i = 0; i < data.length; i++) {
          const ch = data[i]!;
          if (/[\s\u00AD\u200B\u2060\u2066-\u2069]/.test(ch)) {
            gap += ch;
            continue;
          }
          range.setStart(n, i);
          range.setEnd(n, i + 1);
          // the last box: right after a soft-hyphen break WebKit also reports the hyphen's box on the line above
          const rect = [...range.getClientRects()].filter((r) => r.width > 0.2).pop();
          if (!rect) continue;
          const lang = parent.closest("[lang]")?.getAttribute("lang") ?? "";
          chars.push({ ch, top: rect.top, gap, auto: pcs.hyphens === "auto" && !/^(ar|zh)/.test(lang) });
          gap = "";
        }
      }
      for (let i = 1; i < chars.length; i++) {
        const a = chars[i - 1]!;
        const b = chars[i]!;
        if (b.top <= a.top + lh * 0.5) continue;
        const opportunity = /[^\S\u00A0]|\u200B/.test(b.gap) || b.gap.includes("\u00AD");
        if (opportunity) continue;
        const text = (el.textContent ?? "").replace(/[\u00AD\u200B]/g, "").trim().slice(0, 60);
        if (WORD.test(a.ch) && WORD.test(b.ch) && !HAN.test(a.ch) && !HAN.test(b.ch) && !b.auto) out.push(`cut "${a.ch}|${b.ch}" in "${text}"`);
        else if (CLOSE.test(b.ch) && !b.gap.includes("\u00A0")) out.push(`line starts with "${b.ch}" in "${text}"`);
      }
    }
    return out;
  });
}

test.describe("(a) display headings break between words only", () => {
  const PHONE: Array<[string, number]> = [
    ["/ar/services/testing-commissioning/", 320],
    ["/en/services/maintenance-support/", 320],
    ["/zh/projects/shampoo-filling-delta-wecon/", 320],
    ["/en/about/", 320],
    ["/tr/services/machine-retrofits/", 320],
    ["/en/", 640],
    ["/en/", 704],
  ];
  for (const [path, width] of PHONE)
    test(`${path} at ${width}px`, { tag: "@phone" }, async ({ page, isMobile }) => {
      test.skip(!isMobile, "phone widths run in the phone projects (touch emulation)");
      await page.setViewportSize({ width, height: 800 });
      await page.goto(path, { waitUntil: "load" });
      expect(await badHeadingBreaks(page)).toEqual([]);
    });

  for (const path of ["/en/industries/cosmetics-personal-care/", "/en/industries/packaging-labeling/", "/en/industries/building-materials/", "/en/industries/commercial-laundry/"])
    test(`${path} from 640 to 700px (every 2px)`, { tag: "@phone" }, async ({ page, isMobile }) => {
      test.skip(!isMobile, "phone widths run in the phone projects (touch emulation)");
      test.slow();
      await page.setViewportSize({ width: 640, height: 800 });
      await page.goto(path, { waitUntil: "load" });
      const bad: string[] = [];
      for (let width = 640; width <= 700; width += 2) {
        await page.setViewportSize({ width, height: 800 });
        bad.push(...(await badHeadingBreaks(page)).map((b) => `${width}px: ${b}`));
      }
      expect(bad).toEqual([]);
    });

  for (const width of [1024, 1100])
    test(`foreign manufacturers FAQ title at ${width}px`, { tag: "@desktop-only" }, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/en/foreign-manufacturers/", { waitUntil: "load" });
      expect(await badHeadingBreaks(page)).toEqual([]);
    });
});

test("(b) a service wall of 3 or 4 platforms is one row of equal cells on tablets", { tag: "@desktop-only" }, async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  for (const [path, n] of [
    ["/en/services/testing-commissioning/", 3],
    ["/en/services/control-panels/", 4],
  ] as const) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    const cells = await page.locator(".lc-logos li").evaluateAll((lis) => lis.map((li) => li.getBoundingClientRect()).map((r) => ({ top: Math.round(r.top), w: Math.round(r.width) })));
    expect(cells, path).toHaveLength(n);
    expect(new Set(cells.map((c) => c.top)).size, `${path}: one row`).toBe(1);
    expect(Math.max(...cells.map((c) => c.w)) - Math.min(...cells.map((c) => c.w)), `${path}: equal cells`).toBeLessThanOrEqual(1);
  }
});

test("(c) touch screens: the closing band's phone and email links are 44px tall", { tag: "@phone" }, async ({ page, isMobile }) => {
  test.skip(!isMobile, "coarse pointers only");
  for (const path of ["/en/", "/ar/about/"]) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    const links = page.locator('.lc-band a[href^="tel:"]:not(.lc-btn), .lc-band a[href^="mailto:"]:not(.lc-btn)');
    expect(await links.count(), path).toBeGreaterThanOrEqual(2);
    for (const h of await links.evaluateAll((as) => as.map((a) => a.getBoundingClientRect().height))) expect(h, path).toBeGreaterThanOrEqual(44);
  }
});

test("(d) phones: the zone card's CTA is one line (Arabic)", { tag: "@phone" }, async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone layout");
  await page.goto("/ar/about/", { waitUntil: "load" });
  await page.locator('[data-zm-pin][data-zone="10th-of-ramadan"]').click();
  const label = page.locator('.lc-zm-card [data-card="10th-of-ramadan"] .lc-zm-cta .lc-btn-label');
  await expect(label).toBeVisible();
  const { height, lh } = await label.evaluate((el) => ({ height: el.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(el).lineHeight) }));
  expect(height).toBeLessThan(lh * 1.5);
});

test("(e) the swoosh is only in closing CTA bands", { tag: "@desktop-only" }, async ({ page }) => {
  for (const path of ["/en/", "/en/about/", "/ar/about/"]) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(await page.locator(".lc-swoosh").count(), path).toBeGreaterThan(0);
    expect(await page.locator(".lc-swoosh:not(.lc-band .lc-swoosh)").count(), path).toBe(0);
  }
});
