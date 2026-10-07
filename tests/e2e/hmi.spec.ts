/**
 * The live pasteurizer HMI demo on the home page (HmiDemo.astro + src/scripts/motion/hmi-*.ts):
 * Start → heating → forward flow → Simulate fault → diverts + alarms → recovers → Acknowledge clears the
 * unacknowledged count and completes the "Try it" story.
 * The simulation runs at 3× speed: forward flow after ≈ 9 s, the fault diverts ≈ 6 s later, forward again ≈ 10 s later.
 * Story gating (MOT2-11): "Simulate a fault" stays the current step, with TT-102 as the cue, until the plant has
 * diverted and recovered; only then does Acknowledge carry the "next" lamp.
 */
import { test, expect } from "./fixtures";

for (const locale of ["en", "ar"] as const) {
  test(`[${locale}] Start → forward → fault → divert + alarm → acknowledge`, { tag: locale === "en" ? [] : ["@desktop-only"] }, async ({ page }) => {
    test.slow();
    await page.goto(`/${locale}/#hmi-demo`);
    // phones: the home page shows the demo as a teaser until "Try the live demo" expands it
    const teaser = page.locator("#hmi-demo .lc-teaser[data-collapsed] .lc-teaser-cta button");
    if (await teaser.isVisible()) await teaser.click();
    const fig = page.locator("#hmi-demo [data-hmi]");
    await fig.scrollIntoViewIfNeeded();
    await expect(fig).toHaveAttribute("data-ready", "1");
    const scr = fig.locator(".lc-hmi-screen");
    const T = JSON.parse((await fig.getAttribute("data-i18n")) ?? "{}") as { status: Record<string, string>; mimic: Record<string, string>; quote: string };
    const step = (k: string) => fig.locator(`[data-step="${k}"]`);
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
    // while the fault develops: step 3 stays current and TT-102 carries the cue; Acknowledge is not the next step
    await expect(step("fault")).toHaveAttribute("aria-current", "step");
    await expect(scr.locator(".hs-big")).toHaveAttribute("data-next", "");
    await expect(btn("ack")).not.toHaveAttribute("data-next");
    await expect(scr).toHaveAttribute("data-fdv", "div", { timeout: 30_000 });
    await expect(state).toHaveText(T.status.divert!);
    await expect.poll(async () => Number(await scr.getAttribute("data-unack"))).toBeGreaterThan(0);
    // the alarm summary is a table (role=table / row / cell); priority is spoken, not only drawn
    const firstAlarm = scr.locator('.hs-alist [data-rows] > [role="row"]:not(.hs-empty)').first();
    await expect(firstAlarm).toBeVisible();
    await expect(firstAlarm.locator('[role="cell"]').first()).toHaveText(/High|Medium|Low|عالية|متوسطة|منخفضة/);
    await expect(btn("ack")).not.toHaveAttribute("aria-disabled", "true");
    await expect(scr.locator('[data-v="almCount"]')).not.toHaveText("0");
    await expect(btn("ack")).not.toHaveAttribute("data-next");

    // … recovers: forward again, step 3 done, Acknowledge is the next step
    await expect(scr).toHaveAttribute("data-fdv", "fwd", { timeout: 40_000 });
    await expect(step("fault")).toHaveAttribute("data-done", "");
    await expect(btn("ack")).toHaveAttribute("data-next", "");

    // Acknowledge: alarms cleared, the story is complete and ends on a link to the quote form
    await btn("ack").click();
    await expect(scr).toHaveAttribute("data-unack", "0");
    await expect(btn("ack")).toHaveAttribute("aria-disabled", "true");
    await expect(scr.locator('[data-v="almCount"]')).toHaveText("0");
    await expect(fig.locator("[data-step][data-done]")).toHaveCount(4);
    await expect(scr.locator(".hs-msg a.hs-link")).toHaveAttribute("href", T.quote);

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
  // why it is dimmed is its description, not only a transient visual note (A11Y2-09)
  await expect(fault).toHaveAccessibleDescription(T.msg.faultNeedsRun!);
  await fault.click({ force: true }); // aria-disabled (still focusable / clickable on purpose)
  // the click is never dead: the message line says why (start production first), and so does the live region
  await expect(fig.locator(".hs-msg")).toContainText(T.msg.faultNeedsRun!.replace(/[\u2066-\u2069]/g, "").slice(0, 20));
  await expect(fig.locator("[data-live]")).toContainText(T.msg.faultNeedsRun!.slice(0, 20));
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

test("the heating setpoint keys are announced once the visitor pauses, with the limit when reached", { tag: "@desktop-only" }, async ({ page }) => {
  await page.goto("/en/#hmi-demo");
  const fig = page.locator("#hmi-demo [data-hmi]");
  await fig.scrollIntoViewIfNeeded();
  await expect(fig).toHaveAttribute("data-ready", "1");
  const T = JSON.parse((await fig.getAttribute("data-i18n")) ?? "{}") as { msg: Record<string, string> };
  const live = fig.locator("[data-live]");
  await fig.locator('button[data-c="manual"]').click();
  const up = fig.locator('button[data-c="spUp"]');
  for (let i = 0; i < 3; i++) await up.click();
  // one announcement for the burst of presses (debounced), with the new value
  await expect(live).toContainText(T.msg.sp!.split("{v}")[0]!.trim());
  await expect(live).toContainText("74.0");
  for (let i = 0; i < 20; i++) await up.click();
  await expect(live).toContainText(T.msg.spLimit!.split("{v}")[0]!.trim());
  await expect(live).toContainText("78.0");
});
