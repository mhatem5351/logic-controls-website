/**
 * Language switcher: keeps the same page, sets the `lang` cookie, and the Worker then honours that cookie on "/".
 */
import { test, expect } from "./fixtures";
import { LOCALES, PAGE_TYPES, isNarrow } from "./helpers";

const PATH = "services/process-control/";

test("switching language keeps the page and remembers the choice for /", async ({ page, context }) => {
  await page.goto(`/en/${PATH}`);
  if (isNarrow(page)) {
    // phones / tablets: globe button → popover list
    await page.locator(".lc-lang-menu button[popovertarget]").click();
    const pop = page.locator(".lc-lang-pop");
    await expect(pop).toBeVisible();
    await pop.locator('a[data-set-lang="zh"]').click();
  } else {
    // desktop: the full list in the utility bar
    await page.locator('header ul a[data-set-lang="zh"]').first().click();
  }
  await expect(page).toHaveURL(`/zh/${PATH}`);
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hans");

  const cookie = (await context.cookies()).find((c) => c.name === "lang");
  expect(cookie?.value).toBe("zh");
  expect(cookie?.path).toBe("/");
  expect(cookie?.sameSite).toBe("Lax");
  expect(cookie!.expires - Date.now() / 1000).toBeGreaterThan(300 * 24 * 3600);

  // The Worker reads the cookie on "/" (it wins over the browser language).
  await page.goto("/");
  await expect(page).toHaveURL("/zh/");
});

// ≥ 1024px the utility bar lists every language (one tap); phones use the globe menu (first test above)
test("the one-tap quick switch (English page → Arabic) keeps the page", { tag: "@desktop-only" }, async ({ page, context }) => {
  await page.goto(`/en/${PATH}`);
  const quick = page.getByRole("banner").getByRole("list", { name: "Language" }).getByRole("link", { name: "العربية", exact: true });
  await expect(quick).toBeVisible();
  await expect(quick).toHaveAttribute("dir", "rtl");
  await quick.click();
  await expect(page).toHaveURL(`/ar/${PATH}`);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect((await context.cookies()).find((c) => c.name === "lang")?.value).toBe("ar");
});

test("the drawer's language grid switches too (phones)", async ({ page }) => {
  test.skip(!isNarrow(page), "drawer is phone / tablet only");
  await page.goto(`/ar/${PATH}`);
  await page.locator(".lc-menu-open").click();
  await page.locator('#lc-drawer a[data-set-lang="tr"]').click();
  await expect(page).toHaveURL(`/tr/${PATH}`);
});

test("every language link on every page type points to the same page in that language", { tag: "@desktop-only" }, async ({ page }) => {
  test.slow(); // visits every page type × 4 locales; >30 s on a 2-vCPU CI runner
  for (const rest of Object.values(PAGE_TYPES)) {
    for (const from of LOCALES) {
      await page.goto(`/${from}/${rest}`);
      const links = await page.locator("a[data-set-lang]").evaluateAll((as) => as.map((a) => [a.getAttribute("data-set-lang"), a.getAttribute("href")]));
      expect(links.length, `/${from}/${rest}`).toBeGreaterThanOrEqual(LOCALES.length);
      for (const [l, href] of links) expect(href, `/${from}/${rest} → ${l}`).toBe(`/${l}/${rest}`);
    }
  }
});

test("language menu: opens inside the page gutters on narrow phones, RTL included (never against the screen edge)", async ({ page }) => {
  test.skip(!isNarrow(page), "the menu variant is < 1024px");
  for (const width of [320, 360]) {
    await page.setViewportSize({ width, height: 740 });
    for (const loc of ["ar", "en", "zh"]) {
      await page.goto(`/${loc}/`);
      await page.locator(".lc-lang-menu button[popovertarget]").click();
      const pop = page.locator(".lc-lang-pop");
      await expect(pop).toBeVisible();
      const box = (await pop.boundingBox())!;
      expect(box.x, `${loc} ${width}px: start edge`).toBeGreaterThanOrEqual(15);
      expect(box.x + box.width, `${loc} ${width}px: end edge`).toBeLessThanOrEqual(width - 15);
      await page.keyboard.press("Escape");
      await expect(pop).toBeHidden();
    }
  }
});
