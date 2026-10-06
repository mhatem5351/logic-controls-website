/**
 * Header navigation (desktop bar / phone drawer), drawer keyboard behaviour, skip link.
 */
import { test, expect } from "./fixtures";
import { isNarrow } from "./helpers";

/** WebKit only moves focus to links with Tab when Option is held (macOS "press Tab to highlight each item" off). */
const tab = (browserName: string) => (browserName === "webkit" ? "Alt+Tab" : "Tab");

test("desktop header: every main nav link opens its section and marks it current", async ({ page }) => {
  test.skip(isNarrow(page), "desktop navigation is ≥ 1024px");
  await page.goto("/en/");
  const nav = page.locator("header nav").first();
  await expect(nav.locator("a")).toHaveCount(5);
  for (const [label, path] of [
    ["Services", "/en/services/"],
    ["Industries", "/en/industries/"],
    ["Projects", "/en/projects/"],
    ["About", "/en/about/"],
    ["Contact", "/en/contact/"],
  ]) {
    await nav.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(path);
    await expect(page.locator("header nav").first().getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
  }
  // a child page marks its section (aria-current="true")
  await page.goto("/en/services/process-control/");
  await expect(page.locator("header nav").first().getByRole("link", { name: "Services", exact: true })).toHaveAttribute("aria-current", "true");
});

test("phone drawer: opens as a modal, Escape / close button close it, focus returns to the menu button", async ({ page }) => {
  test.skip(!isNarrow(page), "the drawer is < 1024px");
  await page.goto("/en/");
  const opener = page.locator(".lc-menu-open");
  const drawer = page.locator("#lc-drawer");
  await expect(opener).toHaveAttribute("aria-controls", "lc-drawer");

  // keyboard: Enter on the focused menu button (Safari does not focus buttons on tap, so focus return is a
  // keyboard / switch-control concern)
  await opener.focus();
  await page.keyboard.press("Enter");
  await expect(drawer).toBeVisible();
  expect(await drawer.evaluate((d: HTMLDialogElement) => d.open && d.matches(":modal"))).toBe(true);
  expect(await drawer.evaluate((d) => d.contains(document.activeElement))).toBe(true);

  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(opener).toBeFocused();

  await opener.click();
  await expect(drawer).toBeVisible();
  await drawer.locator(".lc-menu-close").click();
  await expect(drawer).toBeHidden();

  // links inside the drawer navigate
  await opener.click();
  await drawer.getByRole("link", { name: /Projects/ }).first().click();
  await expect(page).toHaveURL("/en/projects/");
  await expect(page.locator("#lc-drawer")).toBeHidden();
});

test("phone drawer works in Arabic (RTL)", async ({ page }) => {
  test.skip(!isNarrow(page), "the drawer is < 1024px");
  await page.goto("/ar/");
  await page.locator(".lc-menu-open").click();
  const drawer = page.locator("#lc-drawer");
  await expect(drawer).toBeVisible();
  // the sheet hugs the inline-end edge: the left edge of the viewport in RTL
  await expect.poll(async () => (await drawer.boundingBox())?.x ?? -1).toBe(0);
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
});

test("skip link: first Tab shows it, Enter moves focus to <main>", async ({ page, browserName }) => {
  for (const path of ["/en/", "/ar/contact/"]) {
    await page.goto(path);
    await page.keyboard.press(tab(browserName));
    const skip = page.locator('a[href="#main"]');
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    const box = await skip.boundingBox();
    expect(box!.width).toBeGreaterThan(20);
    await page.keyboard.press("Enter");
    await expect(page.locator("main#main")).toBeFocused();
  }
});

test("the logo goes home and the quote button opens the form", async ({ page }) => {
  await page.goto("/tr/about/");
  await page.locator("header a[aria-label]").first().click();
  await expect(page).toHaveURL("/tr/");
  if (!isNarrow(page) || (page.viewportSize()?.width ?? 0) >= 640) {
    await page.locator('header a[href="/tr/contact/#quote"]').filter({ visible: true }).first().click();
    await expect(page).toHaveURL("/tr/contact/#quote");
    await expect(page.locator("form#quote")).toBeInViewport();
  }
});
