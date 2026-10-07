/**
 * Header navigation (desktop bar / phone drawer), drawer keyboard behaviour, skip link.
 */
import { test, expect } from "./fixtures";
import { isNarrow } from "./helpers";
import { SERVICE_SLUGS } from "../../src/data/services";
import { INDUSTRY_SLUGS } from "../../src/data/industries";

/** The header's top-level sections (src/components/nav.ts MAIN_NAV), as English labels and paths. */
const MAIN = [
  ["Services", "/en/services/"],
  ["Industries", "/en/industries/"],
  ["Projects", "/en/projects/"],
  ["About", "/en/about/"],
  ["Contact", "/en/contact/"],
] as const;

/** WebKit only moves focus to links with Tab when Option is held (macOS "press Tab to highlight each item" off). */
const tab = (browserName: string) => (browserName === "webkit" ? "Alt+Tab" : "Tab");

test("desktop header: every main nav link opens its section and marks it current", async ({ page }) => {
  test.skip(isNarrow(page), "desktop navigation is ≥ 1024px");
  await page.goto("/en/");
  const nav = page.getByRole("navigation", { name: "Main", exact: true });
  // the top-level links, in order (Services / Industries also have a submenu button and a hidden panel of links)
  await expect(nav.locator(":scope > ul > li > a")).toHaveText(MAIN.map(([label]) => label));
  for (const [label, path] of MAIN) {
    await nav.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(path);
    await expect(nav.getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
  }
  // a child page marks its section (aria-current="true")
  await page.goto("/en/services/process-control/");
  await expect(nav.getByRole("link", { name: "Services", exact: true })).toHaveAttribute("aria-current", "true");
});

test("desktop header: Services / Industries submenus (disclosure: keyboard, Escape, outside click)", async ({ page }) => {
  test.skip(isNarrow(page), "desktop navigation is ≥ 1024px");
  await page.goto("/en/services/process-control/");
  const btn = page.locator('header nav button[aria-controls="lc-dd-services"]');
  const panel = page.locator("#lc-dd-services");
  await expect(btn).toHaveAttribute("aria-expanded", "false");
  await btn.focus();
  await page.keyboard.press("Enter");
  await expect(panel).toBeVisible();
  await expect(btn).toHaveAttribute("aria-expanded", "true");
  // every service, the index link, the foreign-manufacturers link and its machine-builder block; the current page is
  // marked
  for (const slug of SERVICE_SLUGS) await expect(panel.locator(`a[href="/en/services/${slug}/"]`)).toHaveCount(1);
  await expect(panel.locator('a[href="/en/services/"]')).toHaveText("All services");
  await expect(panel.locator('a[href="/en/foreign-manufacturers/"]')).toHaveCount(1);
  await expect(panel.locator("a")).toHaveCount(SERVICE_SLUGS.length + 3);
  await expect(panel.locator('a[href="/en/foreign-manufacturers/#oem"]')).toHaveText("For machine builders");
  await expect(panel.locator('a[aria-current="page"]')).toHaveAttribute("href", "/en/services/process-control/");
  await page.keyboard.press("ArrowDown");
  await expect(panel.locator("a").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(btn).toBeFocused();
  await page.locator('header nav button[aria-controls="lc-dd-industries"]').click();
  // every industry + the index link
  for (const slug of INDUSTRY_SLUGS) await expect(page.locator(`#lc-dd-industries a[href="/en/industries/${slug}/"]`)).toHaveCount(1);
  await expect(page.locator("#lc-dd-industries a")).toHaveCount(INDUSTRY_SLUGS.length + 1);
  await page.mouse.click(10, 600);
  await expect(page.locator("#lc-dd-industries")).toBeHidden();
});

/** Desktop pointer: rest on Services' label until hover intent opens its menu. */
async function hoverServices(page: import("@playwright/test").Page) {
  const label = page.locator("header nav [data-dd]").first().locator("a").first();
  const box = (await label.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  return { label, box };
}

test("desktop mega-menu: hover opens it; the click that follows on the chevron keeps it open (pinned)", async ({ page }) => {
  test.skip(isNarrow(page), "desktop navigation is ≥ 1024px");
  await page.goto("/en/about/");
  const btn = page.locator('header nav button[aria-controls="lc-dd-services"]');
  await hoverServices(page);
  await expect(btn).toHaveAttribute("aria-expanded", "true");
  // the usual mouse path: rest on the label, then click the chevron
  await btn.click();
  await page.waitForTimeout(300);
  await expect(btn).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#lc-dd-services")).toBeVisible();
  // pinned: moving the pointer away does not close it; a second click does
  await page.mouse.move(700, 700);
  await page.waitForTimeout(400);
  await expect(btn).toHaveAttribute("aria-expanded", "true");
  await btn.click();
  await expect(btn).toHaveAttribute("aria-expanded", "false");
  // a quick aim-then-click (before hover intent fires) opens it too
  await page.mouse.move(10, 700);
  const b = (await btn.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(300);
  await expect(btn).toHaveAttribute("aria-expanded", "true");
});

test("desktop mega-menu: Escape closes a hover-opened menu wherever focus is; hover re-opens only after leaving", async ({ page }) => {
  test.skip(isNarrow(page), "desktop navigation is ≥ 1024px");
  await page.goto("/en/about/");
  const btn = page.locator('header nav button[aria-controls="lc-dd-services"]');
  const { box } = await hoverServices(page);
  await expect(btn).toHaveAttribute("aria-expanded", "true");
  // focus on the page, not in the menu (WCAG 1.4.13: dismissible without moving pointer or focus)
  await page.locator("main a").first().focus();
  await hoverServices(page);
  await expect(btn).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(btn).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("main a").first()).toBeFocused(); // focus was outside the menu: it stays where it was
  // the pointer still rests on the item: no re-open
  await page.mouse.move(box.x + box.width / 2 + 3, box.y + box.height / 2);
  await page.waitForTimeout(400);
  await expect(btn).toHaveAttribute("aria-expanded", "false");
  // leave, come back: hover works again
  await page.mouse.move(10, 700);
  await hoverServices(page);
  await expect(btn).toHaveAttribute("aria-expanded", "true");
});

test("desktop mega-menu: moving from Services to Industries swaps the panels (never both on screen)", async ({ page }) => {
  test.skip(isNarrow(page), "desktop navigation is ≥ 1024px");
  await page.goto("/en/about/");
  await hoverServices(page);
  await expect(page.locator("#lc-dd-services")).toBeVisible();
  const watch = page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let most = 0;
        const t0 = performance.now();
        const frame = () => {
          const shown = [...document.querySelectorAll(".lc-dd-panel")].filter((p) => getComputedStyle(p).display !== "none" && +getComputedStyle(p).opacity > 0.02).length;
          most = Math.max(most, shown);
          if (performance.now() - t0 < 600) requestAnimationFrame(frame);
          else resolve(most);
        };
        frame();
      }),
  );
  const ind = (await page.locator("header nav [data-dd]").nth(1).locator("a").first().boundingBox())!;
  await page.mouse.move(ind.x + ind.width / 2, ind.y + ind.height / 2, { steps: 4 });
  expect(await watch).toBe(1);
  await expect(page.locator("#lc-dd-industries")).toBeVisible();
  await expect(page.locator("#lc-dd-services")).toBeHidden();
  // the open item's chevron points up
  expect(await page.locator('button[aria-controls="lc-dd-industries"] svg').evaluate((s) => getComputedStyle(s).rotate)).toBe("180deg");
});

test("header actions carry the page context (service preselection; WhatsApp-first Arabic gets the page's message)", async ({ page }) => {
  await page.goto("/en/services/control-panels/");
  await expect(page.locator(".lc-header .lc-head-cta").filter({ visible: true }).first()).toHaveAttribute("href", "/en/contact/?service=control-panels#quote");
  await page.goto("/ar/services/maintenance-support/");
  const wa = decodeURIComponent((await page.locator(".lc-header .lc-head-cta[href^='https://wa.me/']").getAttribute("href"))!);
  expect(wa).toContain("ماكينة متوقفة"); // common.whatsapp.stopped (ar)
});

test("phone drawer: Services / Industries start collapsed (the actions stay on the first screen) and expand in place", async ({ page }) => {
  test.skip(!isNarrow(page), "the drawer is < 1024px");
  await page.goto("/en/services/machine-retrofits/");
  await page.locator(".lc-menu-open").click();
  const drawer = page.locator("#lc-drawer");
  const services = drawer.locator('button[aria-controls="lc-acc-services"]');
  await expect(services).toHaveAttribute("aria-expanded", "false");
  // the page we are on is named under its section, and the quote action preselects it
  await expect(drawer.locator("nav > ul > li").first()).toContainText("Machine retrofits");
  const quote = drawer.locator(".lc-btn[href*='#quote']");
  await expect(quote).toHaveAttribute("href", "/en/contact/?service=machine-retrofits#quote");
  await expect(quote).toBeInViewport();
  await services.click();
  await expect(services).toHaveAttribute("aria-expanded", "true");
  // every service + the index link
  await expect(drawer.locator("#lc-acc-services a")).toHaveCount(SERVICE_SLUGS.length + 1);
  await expect(drawer.locator('#lc-acc-services a[aria-current="page"]')).toHaveAttribute("href", "/en/services/machine-retrofits/");
  const industries = drawer.locator('button[aria-controls="lc-acc-industries"]');
  await expect(drawer.locator("#lc-acc-industries")).toBeHidden();
  await industries.click();
  await expect(industries).toHaveAttribute("aria-expanded", "true");
  await expect(drawer.locator("#lc-acc-industries a")).toHaveCount(INDUSTRY_SLUGS.length + 1);
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

test("phone drawer: a link to the page itself (the quote form on /contact/) closes the sheet before the jump", async ({ page }) => {
  test.skip(!isNarrow(page), "the drawer is < 1024px");
  await page.goto("/en/contact/");
  await page.locator(".lc-menu-open").click();
  const drawer = page.locator("#lc-drawer");
  await expect(drawer).toBeVisible();
  await drawer.locator(".lc-btn[href='/en/contact/#quote']").click();
  await expect(drawer).toBeHidden();
  await expect(page).toHaveURL("/en/contact/#quote");
  await expect(page.locator("form#quote")).toBeInViewport();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe("hidden");
});

test("phone drawer: restored from the back/forward cache, the sheet is closed", async ({ page }) => {
  test.skip(!isNarrow(page), "the drawer is < 1024px");
  await page.goto("/en/about/");
  await page.locator(".lc-menu-open").click();
  await expect(page.locator("#lc-drawer")).toBeVisible();
  // what the browser fires when it restores the page from bfcache
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  await expect(page.locator("#lc-drawer")).toBeHidden();
  await expect(page.locator(".lc-menu-open")).toHaveAttribute("aria-expanded", "false");
});

test("phone drawer on maintenance and support: the two actions are call + WhatsApp ('machine stopped')", async ({ page }) => {
  test.skip(!isNarrow(page), "the drawer is < 1024px");
  await page.goto("/en/services/maintenance-support/");
  await page.locator(".lc-menu-open").click();
  const actions = page.locator("#lc-drawer .lc-btn[data-size='lg']");
  await expect(actions).toHaveCount(2);
  await expect(actions.first()).toHaveAttribute("href", /^tel:/);
  const wa = decodeURIComponent((await actions.nth(1).getAttribute("href"))!);
  expect(wa).toContain("my machine is stopped");
  await expect(actions.nth(1)).toBeInViewport();
});

test("skip link: first Tab shows it, Enter moves focus to <main>", async ({ page, browserName }) => {
  for (const path of ["/en/", "/ar/contact/"]) {
    await page.goto(path);
    await page.keyboard.press(tab(browserName));
    // the skip link is the first link to #main (the back-to-top button also targets #main)
    const skip = page.locator('a[href="#main"]').first();
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
  // every width: "Teklif isteyin" (≥ 640px) or the compact "Teklif" button (phones)
  await page.locator('header a[href="/tr/contact/#quote"]').filter({ visible: true }).first().click();
  await expect(page).toHaveURL("/tr/contact/#quote");
  await expect(page.locator("form#quote")).toBeInViewport();
});
