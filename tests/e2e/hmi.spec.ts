/**
 * The live pasteurizer HMI demo on the home page (HmiDemo.astro + src/scripts/motion/hmi-*.ts):
 * Start → heating → forward flow → Simulate fault → diverts + alarms → Acknowledge clears the unacknowledged count.
 * The simulation runs at 3× speed: forward flow after ≈ 9 s, the fault diverts ≈ 6 s later.
 */
import { test, expect } from "./fixtures";

for (const locale of ["en", "ar"] as const) {
  test(`[${locale}] Start → forward → fault → divert + alarm → acknowledge`, { tag: locale === "en" ? [] : ["@desktop-only"] }, async ({ page }) => {
    test.slow();
    await page.goto(`/${locale}/#hmi-demo`);
    const fig = page.locator("#hmi-demo [data-hmi]");
    await fig.scrollIntoViewIfNeeded();
    await expect(fig).toHaveAttribute("data-ready", "1");
    const scr = fig.locator(".lc-hmi-screen");
    const T = JSON.parse((await fig.getAttribute("data-i18n")) ?? "{}") as { status: Record<string, string>; mimic: Record<string, string> };
    const state = scr.locator('[data-v="state"]');
    const btn = (c: string) => scr.locator(`button[data-c="${c}"]`);

    // at rest
    await expect(btn("stop")).toHaveAttribute("aria-pressed", "true");
    await expect(btn("ack")).toHaveAttribute("aria-disabled", "true");
    await expect(scr).toHaveAttribute("data-unack", "0");

    // Start → running, heating while diverting
    await btn("start").click();
    await expect(fig).toHaveAttribute("data-live-run", "1");
    await expect(btn("start")).toHaveAttribute("aria-pressed", "true");
    await expect(state).toHaveText(T.status.heating!);

    // … until the outlet reaches the limit and the flow diversion valve goes forward
    await expect(scr).toHaveAttribute("data-fdv", "fwd", { timeout: 30_000 });
    await expect(state).toHaveText(T.status.forward!);

    // Simulate fault (steam supply) → alarms, then the temperature drops and the FDV diverts
    await expect(btn("fault")).not.toHaveAttribute("aria-disabled", "true");
    await btn("fault").click();
    await expect(btn("fault")).toHaveAttribute("aria-pressed", "true");
    await expect(scr).toHaveAttribute("data-fdv", "div", { timeout: 30_000 });
    await expect(state).toHaveText(T.status.divert!);
    await expect.poll(async () => Number(await scr.getAttribute("data-unack"))).toBeGreaterThan(0);
    await expect(scr.locator(".hs-alist li:not(.hs-empty)").first()).toBeVisible();
    await expect(btn("ack")).not.toHaveAttribute("aria-disabled", "true");
    await expect(scr.locator('[data-v="almCount"]')).not.toHaveText("0");

    // Acknowledge
    await btn("ack").click();
    await expect(scr).toHaveAttribute("data-unack", "0");
    await expect(btn("ack")).toHaveAttribute("aria-disabled", "true");
    await expect(scr.locator('[data-v="almCount"]')).toHaveText("0");

    // Stop
    await btn("stop").click();
    await expect(fig).toHaveAttribute("data-live-run", "0");
  });
}

test("the fault button is disabled (and harmless) until the plant is producing", { tag: "@desktop-only" }, async ({ page }) => {
  await page.goto("/en/#hmi-demo");
  const fig = page.locator("#hmi-demo [data-hmi]");
  await fig.scrollIntoViewIfNeeded();
  await expect(fig).toHaveAttribute("data-ready", "1");
  const T = JSON.parse((await fig.getAttribute("data-i18n")) ?? "{}") as { msg: Record<string, string> };
  const fault = fig.locator('button[data-c="fault"]');
  await expect(fault).toHaveAttribute("aria-disabled", "true");
  await fault.click({ force: true }); // aria-disabled (still focusable / clickable on purpose)
  await expect(fig.locator(".hs-msg")).toContainText(T.msg.idle!.replace(/[\u2066-\u2069]/g, "").slice(0, 12));
  await expect(fig.locator(".lc-hmi-screen")).toHaveAttribute("data-unack", "0");
  await expect(fig).toHaveAttribute("data-live-run", "0");
});

test("keyboard: the controls are buttons that work with Enter", { tag: "@desktop-only" }, async ({ page }) => {
  await page.goto("/tr/#hmi-demo");
  const fig = page.locator("#hmi-demo [data-hmi]");
  await fig.scrollIntoViewIfNeeded();
  await expect(fig).toHaveAttribute("data-ready", "1");
  await fig.locator('button[data-c="start"]').focus();
  await page.keyboard.press("Enter");
  await expect(fig).toHaveAttribute("data-live-run", "1");
  await fig.locator('button[data-c="recipe"][data-r="juice"]').focus();
  await page.keyboard.press("Enter");
  await expect(fig.locator('button[data-c="recipe"][data-r="juice"]')).toHaveAttribute("aria-pressed", "true");
  await expect(fig.locator(".lc-hmi-screen")).toHaveAttribute("data-recipe", "juice");
});
