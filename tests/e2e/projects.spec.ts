/**
 * Portfolio filters (ProjectBrowser.astro): industry × service × platform toggles, live count, URL sync
 * (?industry=&service=&platform=), per-option counts in the chips' accessible names, the desktop filter bar (one
 * select-style disclosure button per group, showing the active choice), the phone/tablet disclosure, empty state with
 * reset, deep links, and the full list without JavaScript. Also the case-study page pieces that link into it
 * (facts → /technologies/#brand, framed hero media) and the technologies page's brand anchors.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

type Key = "industry" | "service" | "platform";
/** The option toggles, by slug (present in every layout; hidden while their group is closed). */
const chip = (page: Page, key: Key, value = "") => page.locator(`[data-pf-key="${key}"][data-pf-value="${value}"]`);
const items = (page: Page) => page.locator("[data-pf-item]");
const shown = (page: Page) => page.locator("[data-pf-item]:not([hidden])");
const visibleTags = (page: Page, attr: Key) => shown(page).evaluateAll((els, a) => els.map((e) => e.getAttribute(`data-${a}`)!.split(" ")), attr);
/** The live result count (role="status"). */
const count = (page: Page) => page.locator("[data-pf-count]");
const isDesktop = (page: Page) => page.viewportSize()!.width >= 1024;
/** Desktop (≥ 1024px): the group's button in the filter bar, named "Industry: <current choice>". */
const NAMES: Record<Key, string> = { industry: "Industry", service: "Service", platform: "Platform" };
const groupButton = (page: Page, key: Key) => page.getByRole("button", { name: new RegExp(`^${NAMES[key]}: `) });
/** Phones and tablets (< 1024px): one "Filter projects" disclosure holds every group. */
const filtersToggle = (page: Page) => page.getByRole("button", { name: /^Filter projects/ });

/** Shows a group's chips: its panel on desktop, the "Filter projects" disclosure below 1024px. */
async function reveal(page: Page, key: Key) {
  const button = isDesktop(page) ? groupButton(page, key) : filtersToggle(page);
  if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(chip(page, key)).toBeVisible();
}
async function pick(page: Page, key: Key, value = "") {
  await reveal(page, key);
  await chip(page, key, value).click();
}

test("filter by industry, then service: grid, count and URL stay in sync", async ({ page }) => {
  await page.goto("/en/projects/");
  const total = await items(page).count();
  expect(total).toBeGreaterThanOrEqual(15);
  await expect(count(page)).toContainText(String(total));
  await expect(chip(page, "industry")).toHaveAttribute("aria-pressed", "true");
  // the cards are announced under their own (visually hidden) heading, not under "Filter projects" (A11Y2-17)
  await expect(page.getByRole("list", { name: "Case studies" }).locator("[data-pf-item]")).toHaveCount(total);

  await pick(page, "industry", "food-beverage");
  await expect(chip(page, "industry", "food-beverage")).toHaveAttribute("aria-pressed", "true");
  await expect(chip(page, "industry")).toHaveAttribute("aria-pressed", "false");
  await expect(page).toHaveURL("/en/projects/?industry=food-beverage");
  if (isDesktop(page)) await expect(groupButton(page, "industry")).toHaveAccessibleName("Industry: Food and beverage");
  const food = await visibleTags(page, "industry");
  expect(food.length).toBeGreaterThan(1);
  expect(food.length).toBeLessThan(total);
  for (const tags of food) expect(tags).toContain("food-beverage");
  await expect(count(page)).toContainText(String(food.length));
  await expect(page.getByRole("button", { name: "Show all projects" })).toBeVisible();

  await pick(page, "service", "process-control");
  await expect(page).toHaveURL("/en/projects/?industry=food-beverage&service=process-control");
  await expect.poll(async () => (await visibleTags(page, "service")).every((tags) => tags.includes("process-control"))).toBe(true);
  const both = await visibleTags(page, "service");
  expect(both.length).toBeGreaterThan(0);
  expect(both.length).toBeLessThanOrEqual(food.length);

  // the same chip again clears that filter
  await pick(page, "industry", "food-beverage");
  await expect(page).toHaveURL("/en/projects/?service=process-control");

  await page.getByRole("button", { name: "Show all projects" }).click();
  await expect(page).toHaveURL("/en/projects/");
  await expect(shown(page)).toHaveCount(total);
  await expect(page.getByRole("button", { name: "Show all projects" })).toBeHidden();
});

test("no match → empty state with a quote CTA and a reset", async ({ page }) => {
  await page.goto("/en/projects/");
  const total = await items(page).count();
  await pick(page, "industry", "commercial-laundry");
  await reveal(page, "service");
  // options that would give zero results are marked (dashed), but stay usable
  await expect(chip(page, "service", "control-panels")).toHaveAttribute("data-zero", "");
  await chip(page, "service", "control-panels").click();
  await expect(shown(page)).toHaveCount(0);
  await expect(page.locator("[data-pf-empty]")).toBeVisible();
  await expect(count(page)).toContainText("0");
  await expect(page.locator('[data-pf-empty] a[href="/en/contact/#quote"]')).toBeVisible();
  await page.locator("[data-pf-empty]").getByRole("button", { name: "Show all projects" }).click();
  await expect(page.locator("[data-pf-empty]")).toBeHidden();
  await expect(shown(page)).toHaveCount(total);
  // focus lands on the first filter control: the Industry button (desktop) or the first chip (open disclosure)
  if (isDesktop(page)) await expect(groupButton(page, "industry")).toBeFocused();
  else await expect(chip(page, "industry")).toBeFocused();
});

test("deep links apply before first paint; unknown values are ignored", async ({ page }) => {
  await page.goto("/ar/projects/?industry=pharmaceutical");
  await expect(chip(page, "industry", "pharmaceutical")).toHaveAttribute("aria-pressed", "true");
  await expect(shown(page)).not.toHaveCount(await items(page).count());
  for (const tags of await visibleTags(page, "industry")) expect(tags).toContain("pharmaceutical");

  // the active filter is named while the controls are closed: the group button (desktop) or the disclosure (phones)
  await page.goto("/en/projects/?industry=pharmaceutical");
  if (isDesktop(page)) await expect(groupButton(page, "industry")).toHaveAccessibleName("Industry: Pharmaceutical");
  else await expect(filtersToggle(page)).toHaveAccessibleName(/^Filter projects.*1 selected.*Pharmaceutical$/);

  await page.goto("/en/projects/?industry=nope&service=<x>");
  await expect(chip(page, "industry")).toHaveAttribute("aria-pressed", "true");
  await expect(shown(page)).toHaveCount(await items(page).count());
});

test("platform filter: deep link, combined with an industry, URL sync; every case study shown uses the platform", async ({ page }) => {
  await page.goto("/en/projects/?platform=siemens");
  await expect(chip(page, "platform", "siemens")).toHaveAttribute("aria-pressed", "true");
  if (isDesktop(page)) await expect(groupButton(page, "platform")).toHaveAccessibleName("Platform: Siemens");
  const siemens = await visibleTags(page, "platform");
  expect(siemens.length).toBeGreaterThanOrEqual(2);
  for (const tags of siemens) expect(tags).toContain("siemens");
  await expect(count(page)).toContainText(String(siemens.length));

  await pick(page, "industry", "pharmaceutical");
  await expect(page).toHaveURL("/en/projects/?platform=siemens&industry=pharmaceutical");
  await expect(chip(page, "industry", "pharmaceutical")).toHaveAttribute("aria-pressed", "true");
  await expect(shown(page)).toHaveCount(1); // tablet coating
  for (const tags of await visibleTags(page, "industry")) expect(tags).toContain("pharmaceutical");
  await pick(page, "platform"); // "All platforms"
  await expect(page).toHaveURL("/en/projects/?industry=pharmaceutical");
});

test("chip names carry their result count; the three reset chips have distinct names", async ({ page }) => {
  await page.goto("/en/projects/");
  const total = await items(page).count();
  await reveal(page, "industry");
  await expect(chip(page, "industry")).toHaveAccessibleName(`All industries, ${total} projects`);
  await reveal(page, "service");
  await expect(chip(page, "service")).toHaveAccessibleName(`All services, ${total} projects`);
  await reveal(page, "platform");
  await expect(chip(page, "platform")).toHaveAccessibleName(`All platforms, ${total} projects`);
  await pick(page, "industry", "food-beverage");
  // an option that would give no results says so (the visible badge is aria-hidden)
  await reveal(page, "service");
  await expect(chip(page, "service", "machine-retrofits")).toHaveAccessibleName("Machine retrofits, 0 projects");
  await expect(chip(page, "service", "machine-retrofits")).toHaveAttribute("data-zero", "");
  await reveal(page, "platform");
  await expect(chip(page, "platform", "siemens")).toHaveAccessibleName(/^Siemens, \d+ projects?$/);
});

test("desktop: one compact filter bar; each group's button discloses its chips (Escape, outside click, tab-out, one at a time)", async ({ page }) => {
  test.skip(!isDesktop(page), "phones and tablets use the 'Filter projects' disclosure");
  await page.goto("/en/projects/?industry=food-beverage");
  await expect(filtersToggle(page)).toBeHidden();
  // the active choice stays visible on the closed bar; the bar is a single row (UX2-12)
  await expect(groupButton(page, "industry")).toHaveAccessibleName("Industry: Food and beverage");
  await expect(groupButton(page, "service")).toHaveAccessibleName("Service: All");
  const bar = await page.locator("[data-pf-controls]").locator("..").boundingBox();
  expect(bar!.height).toBeLessThanOrEqual(80);
  for (const key of ["industry", "service", "platform"] as const) {
    await expect(groupButton(page, key)).toHaveAttribute("aria-expanded", "false");
    await expect(chip(page, key)).toBeHidden();
  }

  // mouse: open one, then another (one at a time); the same button closes it
  await groupButton(page, "industry").click();
  await expect(page.getByRole("group", { name: "By industry" })).toBeVisible();
  await groupButton(page, "service").click();
  await expect(groupButton(page, "industry")).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("group", { name: "By industry" })).toBeHidden();
  await expect(page.getByRole("group", { name: "By service" })).toBeVisible();
  await groupButton(page, "service").click();
  await expect(page.getByRole("group", { name: "By service" })).toBeHidden();

  // outside click closes
  await groupButton(page, "platform").click();
  await expect(chip(page, "platform")).toBeVisible();
  await page.getByRole("heading", { name: "Filter projects" }).click();
  await expect(groupButton(page, "platform")).toHaveAttribute("aria-expanded", "false");

  // keyboard: Enter opens (focus stays on the button), Tab enters the panel, Escape closes and returns focus
  await groupButton(page, "service").focus();
  await page.keyboard.press("Enter");
  await expect(groupButton(page, "service")).toHaveAttribute("aria-expanded", "true");
  await expect(groupButton(page, "service")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(chip(page, "service")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(groupButton(page, "service")).toHaveAttribute("aria-expanded", "false");
  await expect(groupButton(page, "service")).toBeFocused();
  // tabbing out (backwards, to the Industry button) closes it
  await page.keyboard.press("Space");
  await expect(groupButton(page, "service")).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Shift+Tab");
  await expect(groupButton(page, "industry")).toBeFocused();
  await expect(groupButton(page, "service")).toHaveAttribute("aria-expanded", "false");

  // picking from the keyboard applies it, closes the panel and returns focus to the button, which shows the choice
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab"); // "All industries"
  await expect(chip(page, "industry")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/en/projects/");
  await expect(groupButton(page, "industry")).toHaveAttribute("aria-expanded", "false");
  await expect(groupButton(page, "industry")).toBeFocused();
  await expect(groupButton(page, "industry")).toHaveAccessibleName("Industry: All");
  await expect(shown(page)).toHaveCount(await items(page).count());
});

test("phones and tablets: the filters sit in a disclosure that names the active filters; chips wrap, nothing scrolls sideways", { tag: "@phone" }, async ({ page }) => {
  test.skip(isDesktop(page), "from 1024px each group has its own button in the filter bar");
  await page.goto("/en/projects/?industry=pharmaceutical");
  const toggle = filtersToggle(page);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toHaveAccessibleName(/^Filter projects.*1 selected.*Pharmaceutical$/);
  await expect(chip(page, "industry")).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(chip(page, "industry", "pharmaceutical")).toBeVisible();
  // picking keeps the disclosure open; its name follows the active filters
  await chip(page, "service", "process-control").click();
  await expect(page).toHaveURL("/en/projects/?industry=pharmaceutical&service=process-control");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(toggle).toHaveAccessibleName(/^Filter projects.*2 selected.*Pharmaceutical.*Process control$/);
  const sideways = await page.evaluate(() => [...document.querySelectorAll("[data-pf-panel] ul")].some((u) => u.scrollWidth > u.clientWidth + 1));
  expect(sideways).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
});

test("case study: one facts table (no blank cell, no 'PLC | PLC' block); platform facts link to /technologies/#brand", async ({ page }) => {
  await page.goto("/en/projects/bottle-printing-motion-retrofit/");
  await expect(page.locator("#facts-title")).toHaveCount(1);
  await expect(page.locator("#technologies-title")).toHaveCount(0); // generic "PLC" / "Motion control" chips only
  await expect(page.locator("section:has(#facts-title) [aria-hidden='true'].bg-white")).toHaveCount(0);

  await page.goto("/en/projects/beverage-syrup-jet-mixing/");
  const link = page.locator('section:has(#facts-title) a[href="/en/technologies/#siemens"]');
  await expect(link.first()).toBeVisible();
  await link.first().click();
  await expect(page).toHaveURL("/en/technologies/#siemens");
  await expect(page.locator("#siemens")).toBeInViewport();
  await expect(page.locator('#siemens a[href="/en/projects/?platform=siemens"]')).toBeVisible();
});

test("case study hero: a small screen capture is framed at no more than its natural size (desktop), the phone band stays", async ({ page }) => {
  // the SCADA capture of the batching plant (800 px wide; the cheese cooker leads with its panel photo since VIS2-06)
  await page.goto("/en/projects/concrete-batching-plant-scada/");
  const desktop = page.viewportSize()!.width >= 1024;
  const framed = page.locator(".lc-hero [data-framed='screen'] img");
  if (desktop) {
    await expect(framed).toBeVisible();
    await expect.poll(() => framed.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
    const { css, natural } = await framed.evaluate((i: HTMLImageElement) => ({ css: i.getBoundingClientRect().width, natural: 800 }));
    expect(css).toBeLessThanOrEqual(natural);
  } else {
    await expect(framed).toBeHidden();
    await expect(page.locator(".lc-hero .lc-hero-band img")).toBeVisible();
  }
});

test("every case study shows a hero image on desktop (full-bleed cover or framed), loaded", { tag: "@desktop-only" }, async ({ page }) => {
  await page.goto("/en/projects/");
  const hrefs = await page.locator("[data-pf-item] h3 a").evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
  expect(hrefs.length).toBeGreaterThanOrEqual(15);
  for (const href of hrefs) {
    await page.goto(href);
    const img = page.locator(".lc-hero .lc-hero-media img").first();
    await expect(img, href).toBeVisible();
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 1), { message: href }).toBe(true);
  }
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("the filters are hidden and the full list is shown", async ({ page }) => {
    await page.goto("/en/projects/?industry=pharmaceutical");
    await expect(page.locator("[data-pf-controls]")).toBeHidden();
    const n = await items(page).count();
    expect(n).toBeGreaterThanOrEqual(15);
    for (const item of await items(page).all()) await expect(item).toBeAttached();
    await expect(page.locator("[data-pf-item][hidden]")).toHaveCount(0);
  });
});
