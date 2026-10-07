/**
 * Gallery lightbox (Gallery.astro) and FAQ disclosure widgets (FAQ.astro).
 */
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

/** The gallery script loads when the gallery comes near the viewport (site.ts): scroll to it and wait until it is bound. */
async function galleryReady(page: Page) {
  await page.locator("[data-gallery]").first().scrollIntoViewIfNeeded();
  await expect(page.locator("[data-gallery][data-ready]").first()).toBeAttached();
}

interface Swap {
  /** The counter changed while the old photo was still in front (it must follow the photo, not the key press). */
  early: boolean;
  /** Counter text when the new photo became the front layer. */
  counter: string;
  /** The incoming photo's offset (px) as its slide-in starts, and the outgoing photo's target offset. */
  enter: number;
  drift: number;
}
/** Watches the lightbox's next photo swap (two stacked layers: the shown one is not aria-hidden). Call before the
 *  page turn, then await `swapped(page)`. */
async function watchSwap(page: Page) {
  await page.locator(".lc-lightbox").evaluate((d) => {
    const layers = [...d.querySelectorAll<HTMLElement>("[data-image]")];
    const shown = () => layers.find((l) => !l.hasAttribute("aria-hidden"))!;
    const old = shown();
    const counter = d.querySelector("[data-counter]")!;
    const before = counter.textContent;
    const px = (v: string) => parseFloat(v) || 0; // "none" / "" → 0
    let early = false;
    (window as unknown as { lcSwap: Promise<Swap> }).lcSwap = new Promise((resolve) => {
      const mo = new MutationObserver(() => {
        if (shown() === old) return void (early ||= counter.textContent !== before);
        mo.disconnect();
        const enter = px(getComputedStyle(shown()).translate);
        resolve({ early, counter: counter.textContent ?? "", enter, drift: px(old.style.translate) });
      });
      mo.observe(d, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["aria-hidden"] });
    });
  });
}
const swapped = (page: Page) => page.evaluate(() => (window as unknown as { lcSwap: Promise<Swap> }).lcSwap);
const NAMES = {
  en: { viewer: "Image viewer", next: "Next image", prev: "Previous image" },
  ar: { viewer: "عارض الصور", next: "الصورة التالية", prev: "الصورة السابقة" },
} as const;

test("gallery: thumbnail opens the lightbox; arrows / buttons move; Escape closes and returns focus to the opener", async ({ page }) => {
  await page.goto("/en/projects/pasteurizer-cip-recipes/");
  await galleryReady(page);
  const thumbs = page.locator("[data-gallery] a[data-full]");
  const n = await thumbs.count();
  expect(n).toBeGreaterThanOrEqual(3);
  const dialog = page.locator(".lc-lightbox");
  await expect(dialog).toBeHidden();

  await thumbs.first().focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((d: HTMLDialogElement) => d.matches(":modal"))).toBe(true);
  await expect(dialog.locator("[data-counter]")).toHaveText(`1 / ${n}`);
  // two stacked layers (the next photo is decoded behind the current one, then crossfaded): the shown one is not aria-hidden
  const img = dialog.locator("[data-image]:not([aria-hidden])");
  await expect(img).toHaveAttribute("alt", /\S/);
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  expect(await img.getAttribute("src")).toBe(await thumbs.first().getAttribute("data-full"));

  await page.keyboard.press("ArrowRight");
  await expect(dialog.locator("[data-counter]")).toHaveText(`2 / ${n}`);
  await dialog.locator("[data-prev]").click();
  await expect(dialog.locator("[data-counter]")).toHaveText(`1 / ${n}`);
  await dialog.locator("[data-prev]").click(); // wraps around
  await expect(dialog.locator("[data-counter]")).toHaveText(`${n} / ${n}`);

  // focus returns to the thumbnail that opened the lightbox (not the one last shown)
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(thumbs.first()).toBeFocused();
});

test("gallery: arrow keys follow the reading direction in Arabic", { tag: "@desktop-only" }, async ({ page }) => {
  await page.goto("/ar/projects/pasteurizer-cip-recipes/");
  await galleryReady(page);
  const n = await page.locator("[data-gallery] a[data-full]").count();
  await page.locator("[data-gallery] a[data-full]").first().click();
  const counter = page.locator(".lc-lightbox [data-counter]");
  await expect(counter).toHaveText(`1 من ${n}`); // ui.gallery.counter (ar)
  await page.keyboard.press("ArrowLeft"); // "next" in RTL
  await expect(counter).toHaveText(`2 من ${n}`);
  await page.locator(".lc-lightbox [data-close]").click();
  await expect(page.locator(".lc-lightbox")).toBeHidden();
});

/* MOT2-17: the new photo slides in 24px from the side it comes from while the old one drifts 12px on (mirrored in RTL);
   the counter changes when the new photo is actually in front. */
test("gallery: a page turn slides in from where the photo comes from (mirrored in Arabic)", { tag: "@desktop-only" }, async ({ page }) => {
  for (const locale of ["en", "ar"] as const) {
    const ltr = locale === "en" ? 1 : -1;
    await page.goto(`/${locale}/projects/pasteurizer-cip-recipes/`);
    await galleryReady(page);
    await page.locator("[data-gallery] a[data-full]").first().click();
    const dialog = page.getByRole("dialog", { name: NAMES[locale].viewer });
    await expect(dialog).toBeVisible();
    for (const button of ["next", "prev"] as const) {
      const dir = button === "next" ? 1 : -1;
      await watchSwap(page);
      await dialog.getByRole("button", { name: NAMES[locale][button] }).click();
      const swap = await swapped(page);
      // the counter follows the photo: it changes when the new photo is in front (decoded), not on the click
      expect(swap.early, `${locale} ${button}: counter before the photo`).toBe(false);
      expect(swap.counter).toMatch(new RegExp(`^${dir > 0 ? 2 : 1} ${locale === "en" ? "/" : "من"}`));
      // physical px: next enters from the right in LTR (+24) and from the left in RTL (-24); the old photo drifts 12px on
      expect(swap.enter, `${locale} ${button}: enters from`).toBe(24 * ltr * dir);
      expect(swap.drift, `${locale} ${button}: old photo drifts to`).toBe(-12 * ltr * dir);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  }
});

test.describe("gallery with motion off", () => {
  test.use({ reducedMotion: "reduce" });
  test("a page turn is an instant swap: no slide", { tag: "@desktop-only" }, async ({ page }) => {
    await page.goto("/ar/projects/pasteurizer-cip-recipes/");
    await galleryReady(page);
    await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
    await page.locator("[data-gallery] a[data-full]").first().click();
    const dialog = page.getByRole("dialog", { name: NAMES.ar.viewer });
    await watchSwap(page);
    await dialog.getByRole("button", { name: NAMES.ar.next }).click();
    const swap = await swapped(page);
    expect(swap).toMatchObject({ early: false, enter: 0, drift: 0 });
    await expect(dialog.locator("[data-counter]")).toHaveText(/^2 من/);
  });
});

/* CODE2-10: the "which photo is open" announcement (150 ms after opening) is cancelled by a close. Fake timers: the
   test decides when they fire. */
test("gallery: closing right after opening cancels the pending announcement (the live region stays empty)", async ({ page }) => {
  await page.clock.install();
  await page.goto("/en/projects/pasteurizer-cip-recipes/");
  await galleryReady(page);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  const thumb = page.locator("[data-gallery] a[data-full]").first();
  const dialog = page.getByRole("dialog", { name: NAMES.en.viewer });
  const live = page.locator(".lc-lightbox [data-live]");
  // left open: the announcement follows the dialog's own name
  await thumb.click();
  await expect(dialog).toBeVisible();
  await expect(live).toHaveText("");
  await page.clock.runFor(200);
  await expect(live).toHaveText(/^Image 1 of \d+: \S/);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(live).toHaveText("");
  // closed before it is due: nothing is said after the close
  await thumb.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.clock.runFor(500);
  await expect(live).toHaveText("");
});

test.describe("gallery without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("thumbnails are plain links to the full image", { tag: "@desktop-only" }, async ({ page }) => {
    await page.goto("/en/projects/pasteurizer-cip-recipes/");
    const first = page.locator("[data-gallery] a[data-full]").first();
    const href = await first.getAttribute("href");
    expect(href).toMatch(/^\/_astro\/.+\.(jpg|webp|avif)$/);
    expect((await page.request.get(href!)).status()).toBe(200);
  });
});

test("gallery: a caption that repeats the alt is aria-hidden='true' (not an empty value)", async ({ page }) => {
  await page.goto("/en/projects/pasteurizer-cip-recipes/");
  await galleryReady(page);
  await page.locator("[data-gallery] a[data-full]").first().click();
  const cap = page.locator(".lc-lightbox [data-caption]");
  await expect(cap).not.toBeEmpty();
  const img = page.locator(".lc-lightbox [data-image]:not([aria-hidden])");
  if ((await cap.textContent()) === (await img.getAttribute("alt"))) await expect(cap).toHaveAttribute("aria-hidden", "true");
  else await expect(cap).not.toHaveAttribute("aria-hidden");
});

test("gallery with one photo: no prev / next or counter, the alt alone is announced", async ({ page }) => {
  await page.goto("/en/projects/milk-pasteurizer/");
  await galleryReady(page);
  await expect(page.locator("[data-gallery] a[data-full]")).toHaveCount(1);
  await page.locator("[data-gallery] a[data-full]").click();
  const dialog = page.locator(".lc-lightbox");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("[data-prev], [data-next], [data-counter]")).toHaveCount(0);
  const alt = await dialog.locator("[data-image]:not([aria-hidden])").getAttribute("alt");
  await expect(dialog.locator("[data-live]")).toHaveText(alt!);
  await page.keyboard.press("ArrowRight"); // nothing to page to
  await expect(dialog.locator("[data-live]")).toHaveText(alt!);
});

test("gallery (touch): the photo follows the finger, eases back or pages; one tap outside then closes", { tag: "@phone" }, async ({ page, browserName }) => {
  test.skip(!(page.viewportSize()!.width < 1024), "touch layouts");
  test.skip(browserName === "webkit", "WebKit cannot synthesise touch pointer events in Playwright");
  await page.goto("/en/projects/pasteurizer-cip-recipes/");
  await galleryReady(page);
  await page.locator("[data-gallery] a[data-full]").first().click();
  const dialog = page.getByRole("dialog", { name: NAMES.en.viewer });
  const counter = dialog.locator("[data-counter]");
  await expect(counter).toHaveText(/^1 \//);
  const stage = (await dialog.locator("[data-stage]").boundingBox())!;
  const y = stage.y + stage.height / 2;
  const x0 = stage.x + stage.width * 0.6;
  const front = dialog.locator("[data-image]:not([aria-hidden])");
  const offset = () => front.evaluate((i) => parseFloat(getComputedStyle(i).translate) || 0);
  /* touch events through CDP, with explicit timestamps (the release velocity decides a flick) */
  const cdp = await page.context().newCDPSession(page);
  let t = Date.now() / 1000;
  const touch = async (type: "touchStart" | "touchMove" | "touchEnd", x: number, after = 0.05) => {
    t += after;
    await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }], timestamp: t });
  };
  /* a slow 24px drag towards the next photo: the photo follows the finger, then eases back (no page turn) */
  await touch("touchStart", x0);
  await touch("touchMove", x0 - 10, 0.2);
  await touch("touchMove", x0 - 24, 0.2);
  await expect.poll(offset).toBeCloseTo(-24, 0);
  await touch("touchEnd", 0, 0.2);
  await expect.poll(offset).toBe(0);
  await expect(counter).toHaveText(/^1 \//);
  /* towards the previous photo from the first one: resisted (0.35 of the finger's distance) */
  await touch("touchStart", x0);
  await touch("touchMove", x0 + 10, 0.2);
  await touch("touchMove", x0 + 20, 0.2);
  await expect.poll(offset).toBeCloseTo(7, 0);
  await touch("touchEnd", 0, 0.2);
  await expect.poll(offset).toBe(0);
  await expect(counter).toHaveText(/^1 \//);
  /* a quick 30px flick (0.5 px/ms) pages */
  await touch("touchStart", x0);
  await touch("touchMove", x0 - 15, 0.02);
  await touch("touchMove", x0 - 30, 0.02);
  await touch("touchEnd", 0, 0.02);
  await expect(counter).toHaveText(/^2 \//);
  /* a long swipe (towards the inline start = next) pages */
  await touch("touchStart", stage.x + stage.width * 0.8);
  for (const f of [0.65, 0.5, 0.35, 0.2]) await touch("touchMove", stage.x + stage.width * f);
  await touch("touchEnd", 0);
  await expect(counter).toHaveText(/^3 \//);
  /* one tap outside the photo: the gap between the stage and the caption (the figure itself) */
  const gap = await dialog.evaluate((d) => {
    const st = d.querySelector("[data-stage]")!.getBoundingClientRect();
    const x = st.left + st.width / 2;
    for (let y = st.bottom + 1; y < st.bottom + 14; y++) {
      const el = document.elementFromPoint(x, y);
      if (el && (el.matches("[data-figure], [data-stage]") || el === d)) return { x, y };
    }
    return null;
  });
  expect(gap).not.toBeNull();
  await page.touchscreen.tap(gap!.x, gap!.y);
  await expect(dialog).toBeHidden();
});

test("FAQ: the first answer is open; questions toggle with click, Enter and Space", async ({ page, browserName }) => {
  await page.goto("/en/#faq");
  const items = page.locator("#faq .lc-faq > details");
  expect(await items.count()).toBeGreaterThanOrEqual(3);
  await expect(items.first()).toHaveAttribute("open", "");
  const second = items.nth(1);
  await expect(second).not.toHaveAttribute("open", "");
  await second.locator("summary").click();
  await expect(second).toHaveAttribute("open", "");
  await expect(second.locator(".prose-lc")).toBeVisible();
  await second.locator("summary").click();
  await expect(second).not.toHaveAttribute("open", "");

  await second.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(second).toHaveAttribute("open", "");
  if (browserName !== "webkit") {
    await page.keyboard.press("Space");
    await expect(second).not.toHaveAttribute("open", "");
  }
});

test("FAQ works without JavaScript (native <details>)", { tag: "@desktop-only" }, async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  await page.goto("/en/services/process-control/");
  const faq = page.locator(".lc-faq > details");
  expect(await faq.count()).toBeGreaterThan(1);
  const item = faq.nth(1);
  await expect(item).not.toHaveAttribute("open", "");
  await item.locator("summary").click();
  await expect(item).toHaveAttribute("open", "");
  await expect(item.locator(".prose-lc")).toBeVisible();
  await ctx.close();
});

/* ---------- Q3 pages: page-level disclosures and composition (foreign-manufacturers, home) ---------- */
test.describe("Q3 pages", () => {
  const width = (page: import("@playwright/test").Page) => page.viewportSize()?.width ?? 1440;

  test("foreign page (phones): the first four needs, 'Show all' reveals the rest and moves focus to it", { tag: "@phone" }, async ({ page }) => {
    test.skip(width(page) >= 640, "the needs list is capped below 640px only");
    await page.goto("/en/foreign-manufacturers/");
    const items = page.locator("#needs ol > li");
    const total = await items.count();
    expect(total).toBeGreaterThan(4);
    await expect(items.nth(3)).toBeVisible();
    await expect(items.nth(4)).toBeHidden();
    const more = page.locator("#needs .lc-cap-more");
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await more.focus();
    await page.keyboard.press("Enter");
    await expect(items.nth(total - 1)).toBeVisible();
    await expect(items.nth(4)).toBeFocused();
    await expect(more).toBeHidden();
  });

  test("foreign page: services are compact rows on phones, the machine-builder block is a checklist band", async ({ page }) => {
    await page.goto("/en/foreign-manufacturers/");
    // every service row/card is one link to its service page
    await expect(page.locator("#services li a[href^='/en/services/']")).toHaveCount(8);
    // OEM band: heading, both actions and four plain checklist items (no cards, no numbered headings)
    const oem = page.locator("#oem");
    await expect(oem.getByRole("heading", { level: 2 })).toBeVisible();
    await expect(oem.locator("ul > li")).toHaveCount(4);
    await expect(oem.locator("h3")).toHaveCount(0);
    await expect(oem.locator("a[href*='service=oem-partner']")).toBeVisible();
    // the hero's quiet line leads straight to it
    await page.locator("main a[href='/en/foreign-manufacturers/#oem']").first().click();
    await expect(page).toHaveURL(/#oem$/);
    await expect(page.locator("#oem-title")).toBeInViewport();
  });

  test("foreign page: Arabic hero offers WhatsApp (first), not email", async ({ page }) => {
    await page.goto("/ar/foreign-manufacturers/");
    const ctas = page.locator(".lc-hero [data-fab-avoid] .lc-btn");
    await expect(ctas.first()).toHaveAttribute("href", /^https:\/\/wa\.me\//);
    await expect(page.locator(".lc-hero a[href^='mailto:']")).toHaveCount(0);
  });

  test("'On this page' fits one row from 1024px in every language (no truncated last item)", { tag: "@desktop-only" }, async ({ page }) => {
    for (const w of [1024, 1440]) {
      await page.setViewportSize({ width: w, height: 900 });
      for (const loc of ["en", "ar", "zh", "tr"]) {
        await page.goto(`/${loc}/foreign-manufacturers/`);
        const row = page.locator(".lc-toc-row");
        const fit = await row.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
        expect(fit, `/${loc}/ at ${w}px`).toBe(true);
        // the last item is fully inside the row (not cut by the edge or a fade)
        const inside = await row.evaluate((el) => {
          const box = el.getBoundingClientRect();
          const last = el.querySelector("li:last-child")!.getBoundingClientRect();
          return last.left >= box.left - 1 && last.right <= box.right + 1;
        });
        expect(inside, `/${loc}/ at ${w}px: last item`).toBe(true);
      }
    }
  });

  test("home HMI teaser (phones / tablets): the heading and lead stay exposed while the demo panel is inert", { tag: "@phone" }, async ({ page }) => {
    test.skip(width(page) >= 1024, "the teaser collapses below 1024px only");
    await page.goto("/en/");
    const heading = page.locator("#hmi-demo h2");
    await expect(heading).toBeVisible();
    expect(await heading.evaluate((h) => !!h.closest("[inert]"))).toBe(false);
    expect(await page.locator("#hmi-demo .lc-hmi").evaluate((f) => !!f.closest("[inert]"))).toBe(true);
    await expect(page.getByRole("heading", { name: "Run a pasteurizer from your browser" })).toHaveCount(1);
    await page.locator("#hmi-demo .lc-teaser-cta button").click();
    expect(await page.locator("#hmi-demo .lc-hmi").evaluate((f) => !!f.closest("[inert]"))).toBe(false);
    expect(await page.evaluate(() => !!document.activeElement?.closest(".lc-hmi"))).toBe(true);
  });

  test("zh / tr home: the hero's second action is the foreign page, plus one quiet machine-builder link", async ({ page }) => {
    for (const loc of ["zh", "tr"]) {
      await page.goto(`/${loc}/`);
      const ctas = page.locator(".lc-hero [data-fab-avoid] .lc-btn");
      await expect(ctas).toHaveCount(2);
      await expect(ctas.nth(1)).toHaveAttribute("href", `/${loc}/foreign-manufacturers/`);
      await expect(page.locator(`.lc-hero a[href='/${loc}/foreign-manufacturers/#oem']`)).toBeVisible();
    }
    // en keeps WhatsApp as the second action
    await page.goto("/en/");
    await expect(page.locator(".lc-hero [data-fab-avoid] .lc-btn").nth(1)).toHaveAttribute("href", /^https:\/\/wa\.me\//);
  });
});

/* ---------- Q3 chrome: floating contact button, zh email panel, copy address ---------- */
test.describe("Q3 chrome", () => {
  test("zh email panel: the whole address (never truncated), a named panel, copy confirmed once, closes on focus-out / Escape", async ({ page, context, browserName }) => {
    if (browserName === "chromium") await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/zh/about/");
    const fab = page.locator(".lc-fab");
    // reveal it wherever the page is (it steps aside over controls on its own)
    await page.evaluate(() => document.querySelector(".lc-fab")!.removeAttribute("data-hidden"));
    await fab.click();
    const pop = page.locator("#lc-fab-mail");
    await expect(pop).toBeVisible();
    await expect(fab).toHaveAttribute("aria-expanded", "true");
    await expect(pop).toHaveAccessibleName("邮件联系工程师");
    const addr = pop.locator(".lc-fab-addr");
    await expect(addr).toHaveText("info@logic-controls.com");
    expect(await addr.evaluate((el) => el.scrollWidth <= el.clientWidth + 1 && getComputedStyle(el).textOverflow !== "ellipsis")).toBe(true);
    // aligned with the button's edge, inside the screen (once the button's own dock-in / hover motion has settled)
    await fab.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => null))));
    await page.waitForTimeout(400);
    const [p, f] = [(await pop.boundingBox())!, (await fab.boundingBox())!];
    expect(Math.abs(p.x + p.width - (f.x + f.width))).toBeLessThanOrEqual(1);
    expect(p.x).toBeGreaterThanOrEqual(0);
    // copy: the button keeps its name, the live region (present from load) says it once
    const copy = pop.locator("button[data-copy]");
    await expect(copy).toHaveAccessibleName("复制邮箱地址");
    await copy.click();
    await expect(pop.locator("[data-copy-live]")).toHaveText("邮箱地址已复制");
    await expect(copy).toHaveAccessibleName("复制邮箱地址");
    // keyboard: tabbing on past the panel closes it
    const tab = browserName === "webkit" ? "Alt+Tab" : "Tab";
    await copy.focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press(tab);
    await expect(pop).toBeHidden();
    // Escape closes it and focus goes back to the button
    await page.evaluate(() => {
      const b = document.querySelector<HTMLElement>(".lc-fab")!;
      b.removeAttribute("data-hidden");
      b.focus();
    });
    await page.keyboard.press("Enter");
    await expect(pop).toBeVisible();
    await page.keyboard.press(tab);
    await page.keyboard.press("Escape");
    await expect(pop).toBeHidden();
    await expect(fab).toBeFocused();
    await expect(fab).toHaveAttribute("aria-expanded", "false");
  });

  test("floating button: in a named landmark; Arabic phones call (the header carries WhatsApp), desktops WhatsApp", async ({ page }) => {
    await page.goto("/ar/about/");
    await expect(page.getByRole("complementary", { name: "تواصل سريع" }).locator(".lc-fab")).toHaveCount(1);
    const href = await page.locator(".lc-fab").getAttribute("href");
    if ((page.viewportSize()?.width ?? 1440) < 1024) {
      expect(href).toMatch(/^tel:/);
      await expect(page.locator(".lc-fab")).toHaveAttribute("aria-label", "اتصل بمهندس"); // (hidden over the hero: no AX name yet)
    } else expect(href).toMatch(/^https:\/\/wa\.me\//);
    await page.goto("/en/services/control-panels/");
    const wa = decodeURIComponent((await page.locator(".lc-fab").getAttribute("href"))!);
    expect(wa).toMatch(/control panels/i); // the page's context, not the generic message
  });

  test("floating button: no blinking while a phone scrolls (it holds its state until the page rests)", { tag: "@phone" }, async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 1440) >= 1024, "phones / tablets");
    await page.goto("/en/");
    await page.evaluate(() => scrollTo(0, innerHeight));
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
      (window as unknown as { flips: number[] }).flips = [];
      const fab = document.querySelector(".lc-fab")!;
      new MutationObserver(() => (window as unknown as { flips: number[] }).flips.push(performance.now())).observe(fab, { attributes: true, attributeFilter: ["data-hidden"] });
    });
    for (let i = 0; i < 40; i++) {
      await page.evaluate(() => scrollBy(0, 70));
      await page.waitForTimeout(50);
    }
    const flips = await page.evaluate(() => (window as unknown as { flips: number[] }).flips);
    expect(flips.length, "state changes during one continuous scroll").toBeLessThanOrEqual(1);
  });
});
