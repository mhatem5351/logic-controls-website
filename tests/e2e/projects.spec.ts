/**
 * Portfolio filters (ProjectBrowser.astro): industry × service toggles, live count, URL sync (?industry=&service=),
 * empty state with reset, deep links, and the full list without JavaScript.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

const chip = (page: Page, key: "industry" | "service", value = "") => page.locator(`[data-pf-key="${key}"][data-pf-value="${value}"]`);
const items = (page: Page) => page.locator("[data-pf-item]");
const visibleTags = (page: Page, attr: "industry" | "service") =>
  page.locator("[data-pf-item]:not([hidden])").evaluateAll((els, a) => els.map((e) => e.getAttribute(`data-${a}`)!.split(" ")), attr);

test("filter by industry, then service: grid, count and URL stay in sync", async ({ page }) => {
  await page.goto("/en/projects/");
  const total = await items(page).count();
  expect(total).toBeGreaterThanOrEqual(15);
  await expect(page.locator("[data-pf-count]")).toContainText(String(total));
  await expect(chip(page, "industry")).toHaveAttribute("aria-pressed", "true");

  await chip(page, "industry", "food-beverage").click();
  await expect(chip(page, "industry", "food-beverage")).toHaveAttribute("aria-pressed", "true");
  await expect(chip(page, "industry")).toHaveAttribute("aria-pressed", "false");
  await expect(page).toHaveURL("/en/projects/?industry=food-beverage");
  const food = await visibleTags(page, "industry");
  expect(food.length).toBeGreaterThan(1);
  expect(food.length).toBeLessThan(total);
  for (const tags of food) expect(tags).toContain("food-beverage");
  await expect(page.locator("[data-pf-count]")).toContainText(String(food.length));
  await expect(page.locator("[data-pf-reset]")).toBeVisible();

  await chip(page, "service", "process-control").click();
  await expect(page).toHaveURL("/en/projects/?industry=food-beverage&service=process-control");
  const both = await visibleTags(page, "service");
  expect(both.length).toBeGreaterThan(0);
  expect(both.length).toBeLessThanOrEqual(food.length);
  for (const tags of both) expect(tags).toContain("process-control");

  // the same chip again clears that filter
  await chip(page, "industry", "food-beverage").click();
  await expect(page).toHaveURL("/en/projects/?service=process-control");

  await page.locator("[data-pf-reset]").click();
  await expect(page).toHaveURL("/en/projects/");
  await expect(page.locator("[data-pf-item]:not([hidden])")).toHaveCount(total);
  await expect(page.locator("[data-pf-reset]")).toBeHidden();
});

test("no match → empty state with a quote CTA and a reset", async ({ page }) => {
  await page.goto("/en/projects/");
  const total = await items(page).count();
  await chip(page, "industry", "commercial-laundry").click();
  // options that would give zero results are marked (dashed), but stay usable
  await expect(chip(page, "service", "control-panels")).toHaveAttribute("data-zero", "");
  await chip(page, "service", "control-panels").click();
  await expect(page.locator("[data-pf-item]:not([hidden])")).toHaveCount(0);
  await expect(page.locator("[data-pf-empty]")).toBeVisible();
  await expect(page.locator("[data-pf-count]")).toContainText("0");
  await expect(page.locator('[data-pf-empty] a[href="/en/contact/#quote"]')).toBeVisible();
  await page.locator("[data-pf-reset-alt]").click();
  await expect(page.locator("[data-pf-empty]")).toBeHidden();
  await expect(page.locator("[data-pf-item]:not([hidden])")).toHaveCount(total);
  await expect(chip(page, "industry")).toBeFocused();
});

test("deep links apply before first paint; unknown values are ignored", async ({ page }) => {
  await page.goto("/ar/projects/?industry=pharmaceutical");
  await expect(chip(page, "industry", "pharmaceutical")).toHaveAttribute("aria-pressed", "true");
  for (const tags of await visibleTags(page, "industry")) expect(tags).toContain("pharmaceutical");

  await page.goto("/en/projects/?industry=nope&service=<x>");
  await expect(chip(page, "industry")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-pf-item]:not([hidden])")).toHaveCount(await items(page).count());
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
