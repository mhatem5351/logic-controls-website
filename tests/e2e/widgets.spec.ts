/**
 * Gallery lightbox (Gallery.astro) and FAQ disclosure widgets (FAQ.astro).
 */
import { test, expect } from "./fixtures";

test("gallery: thumbnail opens the lightbox; arrows / buttons move; Escape closes and returns focus", async ({ page }) => {
  await page.goto("/en/projects/pasteurizer-cip-recipes/");
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
  const img = dialog.locator("[data-image]");
  await expect(img).toHaveAttribute("alt", /\S/);
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  expect(await img.getAttribute("src")).toBe(await thumbs.first().getAttribute("data-full"));

  await page.keyboard.press("ArrowRight");
  await expect(dialog.locator("[data-counter]")).toHaveText(`2 / ${n}`);
  await dialog.locator("[data-prev]").click();
  await expect(dialog.locator("[data-counter]")).toHaveText(`1 / ${n}`);
  await dialog.locator("[data-prev]").click(); // wraps around
  await expect(dialog.locator("[data-counter]")).toHaveText(`${n} / ${n}`);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(thumbs.nth(n - 1)).toBeFocused();
});

test("gallery: arrow keys follow the reading direction in Arabic", { tag: "@desktop-only" }, async ({ page }) => {
  await page.goto("/ar/projects/pasteurizer-cip-recipes/");
  const n = await page.locator("[data-gallery] a[data-full]").count();
  await page.locator("[data-gallery] a[data-full]").first().click();
  const counter = page.locator(".lc-lightbox [data-counter]");
  await expect(counter).toHaveText(`1 / ${n}`);
  await page.keyboard.press("ArrowLeft"); // "next" in RTL
  await expect(counter).toHaveText(`2 / ${n}`);
  await page.locator(".lc-lightbox [data-close]").click();
  await expect(page.locator(".lc-lightbox")).toBeHidden();
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
