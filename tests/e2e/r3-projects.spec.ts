/**
 * Round 3, projects area:
 *  - case-study galleries (VIS3-01): a screen capture is shown whole, at its own aspect, never wider than its own pixels;
 *    photos are cropped at build time to the 4:3 box; the image a framed hero already shows is not repeated below
 *  - one reference promise per page (CS3-04): the confidentiality note stops at its first sentence next to the offer
 *  - projects index: the first card photo is not lazy (PERF3-02)
 *  - phone filter: a sticky "Show N projects" closes the panel onto the results (UX3-02); the panel's open state comes
 *    back on a Back that reloads the page (DEV3-05); the Arabic summary keeps each label's own direction (I18N3-01);
 *    Chinese labels break between words only (I18N3-05)
 *  - forced colors: the pressed chip stays distinct (A11Y3-06)
 *  - structured data: case studies mention brands by the site-wide Brand @id (CS3-05)
 */
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

const isDesktop = (page: Page) => page.viewportSize()!.width >= 1024;
/** The gallery script and its lazy images load when the gallery comes near: scroll to it, load every thumbnail. */
async function galleryLoaded(page: Page) {
  const gallery = page.locator("[data-gallery]");
  await gallery.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      gallery
        .locator("a[data-full] img")
        .evaluateAll((imgs) => imgs.every((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0)),
    )
    .toBe(true);
}

test.describe("case-study galleries", () => {
  for (const slug of ["concrete-batching-plant-scada", "pipe-make-break-test-rig"]) {
    test(`${slug}: the framed hero capture is the case study's one image, not repeated in a gallery; the notes stay`, async ({ page }) => {
      await page.goto(`/en/projects/${slug}/`);
      await expect(page.locator("[data-gallery]")).toHaveCount(0);
      await expect(page.locator("#media")).toHaveCount(0);
      await expect(page.locator("section:has(#facts-title)")).toContainText("Client names are withheld for confidentiality.");
      await expect(page.locator("section:has(#facts-title)")).toContainText("Photos are from the actual projects.");
    });
  }

  for (const slug of ["cheese-cooker-recipes", "olive-autoclave-sterilization", "hotel-washer-extractor-control"]) {
    test(`${slug}: screen captures are whole, at their own aspect and never wider than their pixels`, async ({ page }) => {
      await page.goto(`/en/projects/${slug}/`);
      await galleryLoaded(page);
      const screens = page.locator("[data-gallery] a[data-full]:has(.lc-card-bezel)");
      expect(await screens.count()).toBeGreaterThan(0);
      for (const a of await screens.all()) {
        const r = await a.evaluate((link) => {
          const img = link.querySelector("img")!;
          const box = img.getBoundingClientRect();
          const cell = link.getBoundingClientRect();
          /* the largest candidate is the capture itself (widths stop at its own width) */
          const widest = Math.max(
            ...(img.closest("picture")!.querySelector("source")!.getAttribute("srcset") ?? "")
              .split(",")
              .map((c) => parseFloat(c.trim().split(/\s+/)[1] ?? "0")),
          );
          return {
            width: box.width,
            ratio: box.width / box.height,
            natural: Number(img.getAttribute("width")) / Number(img.getAttribute("height")),
            widest,
            inside:
              box.left >= cell.left - 0.5 && box.right <= cell.right + 0.5 && box.top >= cell.top - 0.5 && box.bottom <= cell.bottom + 0.5,
          };
        });
        expect(r.width).toBeLessThanOrEqual(r.widest + 0.5);
        expect(Math.abs(r.ratio / r.natural - 1)).toBeLessThan(0.02);
        expect(r.inside).toBe(true);
      }
    });
  }

  test("photos are cropped to the 4:3 box at build time (the srcset describes the pixels shown)", async ({ page }) => {
    await page.goto("/en/projects/labeling-machine-delta-wecon/");
    await galleryLoaded(page);
    const ratios = await page
      .locator("[data-gallery] a[data-full]:not(:has(.lc-card-bezel)) img")
      .evaluateAll((imgs) => imgs.map((i) => Number(i.getAttribute("width")) / Number(i.getAttribute("height"))));
    expect(ratios.length).toBe(2);
    for (const r of ratios) expect(r).toBeCloseTo(4 / 3, 2);
  });

  for (const slug of ["cheese-cooker-recipes", "milk-pasteurizer", "beverage-syrup-jet-mixing"]) {
    test(`${slug}: the framed hero's image is not repeated in the gallery`, async ({ page }) => {
      await page.goto(`/en/projects/${slug}/`);
      const heroAlt = await page.locator(".lc-hero img[alt]:not([alt=''])").first().getAttribute("alt");
      const alts = await page.locator("[data-gallery] a[data-full] img").evaluateAll((imgs) => imgs.map((i) => i.getAttribute("alt")));
      expect(alts.length).toBeGreaterThan(0);
      expect(alts).not.toContain(heroAlt);
    });
  }
});

for (const path of ["/en/projects/", "/en/projects/tablet-coating-scada/"]) {
  test(`${path}: one reference promise, the note keeps its first sentence beside the reference offer`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator("main")).toContainText("Client names are withheld for confidentiality.");
    await expect(page.locator("main")).toContainText("Talk to a past client");
    await expect(page.locator("main")).not.toContainText("References can be arranged on request");
  });
}

test("projects index: the first card photo loads eagerly at high priority, the second eagerly, the rest lazily", async ({ page }) => {
  await page.goto("/en/projects/");
  const imgs = page.locator("[data-pf-item] img");
  await expect(imgs.nth(0)).toHaveAttribute("loading", "eager");
  await expect(imgs.nth(0)).toHaveAttribute("fetchpriority", "high");
  await expect(imgs.nth(1)).toHaveAttribute("loading", "eager");
  await expect(imgs.nth(1)).not.toHaveAttribute("fetchpriority", "high");
  await expect(imgs.nth(2)).toHaveAttribute("loading", "lazy");
});

test.describe("phone filter panel", { tag: "@phone" }, () => {
  test.beforeEach(({ page }) => {
    test.skip(isDesktop(page), "below 1024px only (desktop has one panel per group)");
  });

  test("a sticky 'Show N projects' keeps the count at hand and closes the panel onto the results", async ({ page }) => {
    await page.goto("/en/projects/");
    const toggle = page.locator("[data-pf-toggle]");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await page.locator('[data-pf-key="industry"][data-pf-value="food-beverage"]').click();
    await expect(page).toHaveURL("/en/projects/?industry=food-beverage");
    const n = await page.locator("[data-pf-item]:not([hidden])").count();
    const done = page.getByRole("button", { name: `Show ${n} projects` });
    await expect(done).toBeInViewport();
    await done.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#pf-results")).toBeFocused();
    await expect(page.locator("[data-pf-count]")).toBeInViewport();
    await expect(page.locator("[data-pf-item]:not([hidden])").first()).toBeInViewport({ ratio: 0.2 });
  });

  test("Back to the list reopens a panel that was open (history.state), so the saved scroll offset fits", async ({ page }) => {
    await page.goto("/en/projects/?industry=food-beverage");
    const toggle = page.locator("[data-pf-toggle]");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const card = page.locator("[data-pf-item]:not([hidden])").nth(2);
    await card.scrollIntoViewIfNeeded();
    const href = (await card.locator("h3 a").getAttribute("href"))!;
    await card.locator("h3 a").click();
    await expect(page).toHaveURL(href);
    await page.goBack();
    await expect(page).toHaveURL("/en/projects/?industry=food-beverage");
    await expect(page.locator("[data-pf-toggle]")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("[data-pf-item]:not([hidden])").nth(2)).toBeInViewport({ ratio: 0.2 });
  });

  test("Arabic summary: a label that starts with a Latin word keeps the Arabic reading order", async ({ page }) => {
    await page.goto("/ar/projects/?service=scada-data-logging");
    const part = page.locator("[data-pf-summary] bdi").first();
    await expect(part).toHaveText("SCADA وتسجيل البيانات");
    await expect(part).toHaveAttribute("dir", "rtl");
    // laid out right to left: "SCADA" (first word) sits to the right of "وتسجيل"
    const [latin, arabic] = await part.evaluate((el) => {
      const text = el.firstChild as Text;
      const rect = (word: string) => {
        const r = document.createRange();
        const at = text.data.indexOf(word);
        r.setStart(text, at);
        r.setEnd(text, at + word.length);
        return r.getBoundingClientRect().left;
      };
      return [rect("SCADA"), rect("وتسجيل")];
    });
    expect(latin).toBeGreaterThan(arabic);
  });

  test("Chinese summary: labels break between words only", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto("/zh/projects/?industry=packaging-labeling&service=plc-hmi-programming&platform=schneider-electric");
    const summary = page.locator("[data-pf-summary]");
    await expect(summary).toBeVisible();
    expect(await summary.evaluate((el) => getComputedStyle(el).wordBreak)).toBe("keep-all");
    // "编程" (programming) is never split across lines
    const split = await summary.evaluate((el) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
        const at = node.data.indexOf("编程");
        if (at < 0) continue;
        const top = (i: number) => {
          const r = document.createRange();
          r.setStart(node!, i);
          r.setEnd(node!, i + 1);
          return Math.round(r.getBoundingClientRect().top);
        };
        return top(at) !== top(at + 1);
      }
      return null;
    });
    expect(split).toBe(false);
  });
});

test("forced colors: the pressed filter chip stays distinct from the others", async ({ page, browserName }) => {
  test.skip(browserName === "webkit", "forced-colors emulation is Chromium-only");
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto("/en/projects/?industry=food-beverage");
  if (isDesktop(page)) await page.getByRole("button", { name: /^Industry: / }).click();
  else await page.locator("[data-pf-toggle]").click();
  const look = (value: string) =>
    page.locator(`[data-pf-key="industry"][data-pf-value="${value}"]`).evaluate((b) => {
      const cs = getComputedStyle(b);
      return `${cs.backgroundColor}|${cs.color}|${getComputedStyle(b.firstElementChild!).backgroundColor}`;
    });
  expect(await look("food-beverage")).not.toBe(await look(""));
});

test("structured data: a case study mentions its platforms by the site-wide Brand @id", async ({ page }) => {
  await page.goto("/en/projects/tablet-coating-scada/");
  const graphs = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((ss) => ss.map((s) => JSON.parse(s.textContent ?? "{}")));
  const article = graphs.flatMap((g) => (g["@graph"] ?? [g]) as Record<string, unknown>[]).find((n) => n["@type"] === "Article")!;
  expect(article.mentions).toEqual([{ "@type": "Brand", "@id": "https://logic-controls.com/#brand-siemens", name: "Siemens" }]);
});
