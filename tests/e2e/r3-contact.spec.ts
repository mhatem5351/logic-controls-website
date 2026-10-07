/**
 * Round 3, contact form and thanks page (package R2-contact): the fixes these tests pin.
 *   MOT3-03  phones: "Continue" moves the page once (no jump down, then a long glide back up)
 *   A11Y3-02 the phone's country-code hint is in its description only while shown, and said once when it appears
 *   A11Y3-04 thanks: "Copy number" keeps its name (the live region says "copied"); "Call an engineer" + space + number
 *   I18N3-02 file names in sentences are isolated: in Arabic an extension never leaves its name
 *   I18N3-07 the urgent WhatsApp text starts with the request number; zh: an "Urgent" email, not "more files"
 *   DEV3-01  a slow upload that keeps moving is not cut off; after a timeout, "Send without the files"
 *   DEV3-02  320 px phones: the security check renders compact (never wider than the form)
 *   DEV3-03  photos being reduced do not trigger "larger than 4 MB"
 *   DEV2-07  the call-now panel's buttons are 44 px tall on touch screens
 *   VIS3-06  the thanks cards' WhatsApp buttons stay on one line at desktop widths
 *   CODE3-02 what the browser's click counter sends is what the Worker counts (and the per-view limits hold)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { ROOT } from "./helpers";
import { EVT_PLACES, parseEvt } from "../../src/lib/rfq-rules";

type Contact = {
  validation: Record<string, string>;
  errors: Record<string, string>;
  form: { buttons: Record<string, string> };
  thanks: {
    dropped: string;
    received: string;
    ref: { copy: string; copied: string };
    urgentNow: { whatsapp: string; emailSubject: string };
    more: { cta: string; ctaShort: string };
    urgent: { cta: string };
  };
};
const copy = (l: string): Contact => JSON.parse(readFileSync(join(ROOT, "src/i18n/messages", l, "contact.json"), "utf8"));
const EN = copy("en");
const iso = (name: string) => `⁨${name}⁩`;

async function openForm(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator("form[data-rfq][data-enhanced]")).toHaveCount(1);
}
async function fillStep1(page: Page, phone = "+20 100 000 0000") {
  await page.locator("#rfq-name").fill("QA Person");
  await page.locator("#rfq-company").fill("QA Factory");
  await page.locator("#rfq-phone").fill(phone);
  await page.locator("#rfq-service").selectOption("control-panels");
}
async function turnstileToken(page: Page) {
  await expect
    .poll(() => page.locator("input[name='cf-turnstile-response']").first().inputValue().catch(() => ""), { timeout: 25_000 })
    .not.toBe("");
}
/** The thanks page as the form hands it over (sessionStorage summary, read once). */
async function openThanks(page: Page, locale: string, sent: Record<string, unknown>) {
  await page.goto(`/${locale}/contact/thanks/?ref=LC-7K3QX`);
  await expect(page.locator("[data-ref]")).toHaveText("LC-7K3QX"); // its script has run (never reload mid-import)
  await page.evaluate((s) => sessionStorage.setItem("lcRfqSent", JSON.stringify({ ref: "LC-7K3QX", ...s })), sent);
  await page.reload();
  await expect(page.locator("[data-ref]")).toHaveText("LC-7K3QX");
}

test("phones: Continue moves the page once (an instant jump to the form, then the step slides in)", { tag: "@phone" }, async ({ page, isMobile }) => {
  test.skip(!isMobile, "phones: the form's top is far above the screen after step 1");
  for (const l of ["en", "ar"]) {
    await openForm(page, `/${l}/contact/`);
    await fillStep1(page);
    // the natural position: Continue near the bottom of the screen
    await page.evaluate(() => {
      const r = document.querySelector("[data-next]")!.getBoundingClientRect();
      scrollTo({ top: r.bottom + scrollY - innerHeight + 80, behavior: "instant" });
    });
    await page.evaluate(() => {
      const w = window as unknown as { __ys: number[] };
      w.__ys = [];
      const t0 = performance.now();
      const tick = () => {
        w.__ys.push(Math.round(scrollY));
        if (performance.now() - t0 < 1200) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    // a tap where the button is (locator.tap() would first scroll it "into view" by a few pixels)
    const box = (await page.locator("[data-next]").boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('[data-step="2"]')).toHaveAttribute("data-active", "");
    await page.waitForFunction(() => (window as unknown as { __ys: number[] }).__ys.length > 30);
    await page.waitForTimeout(1300);
    const ys = await page.evaluate(() => (window as unknown as { __ys: number[] }).__ys);
    // frames in which the page moved: one jump (was: a jump down, then ~15 frames of a glide back up)
    const moves = ys.slice(1).filter((y, i) => Math.abs(y - ys[i]!) > 8).length;
    expect(moves, `scroll positions after Continue (${l}): ${[...new Set(ys)].join(" → ")}`).toBeLessThanOrEqual(1);
    await expect(page.locator('[data-step="2"] legend')).toBeInViewport();
  }
});

test("phone hint: in the field's description only while shown, and announced once when it appears", async ({ page }) => {
  await openForm(page, "/en/contact/");
  const phone = page.locator("#rfq-phone");
  await expect(phone).toHaveAttribute("aria-describedby", "rfq-phone-help rfq-phone-error");
  await page.evaluate(() => {
    const w = window as unknown as { __said: string[] };
    w.__said = [];
    const live = document.querySelector("[data-step-live]")!;
    new MutationObserver(() => live.textContent && w.__said.push(live.textContent)).observe(live, { childList: true, characterData: true, subtree: true });
  });
  await phone.fill("0532 123 45 67");
  await phone.blur();
  await expect(page.locator("#rfq-phone-hint")).toBeVisible();
  await expect(phone).toHaveAttribute("aria-describedby", "rfq-phone-help rfq-phone-hint rfq-phone-error");
  const hint = (await page.locator("#rfq-phone-hint").textContent())!.trim();
  expect(hint.replace(/\s/g, " ")).toBe(EN.validation.phoneCountry);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __said: string[] }).__said)).toEqual([hint]);
  await phone.focus();
  await phone.blur(); // still the same number: not said again
  await phone.fill("+90 532 123 45 67");
  await phone.blur();
  await expect(page.locator("#rfq-phone-hint")).toBeHidden();
  await expect(phone).toHaveAttribute("aria-describedby", "rfq-phone-help rfq-phone-error");
  expect(await page.evaluate(() => (window as unknown as { __said: string[] }).__said)).toEqual([hint]);
});

test("thanks (ar): file names stay whole in the received / not attached / not sent lines", async ({ page }) => {
  const files = ["تقرير اللوحة.pdf", "IMG_20250314_101530.jpg", "مخطط.dwg", "控制柜图纸.pdf"];
  const skipped = ["صورة الماكينة.jpg", "IMG_2041.jpg"];
  const dropped = ["صورة الخط.jpg", "IMG_3001.jpg"];
  await openThanks(page, "ar", { name: "أحمد", company: "النيل", need: "صيانة", files, skipped, dropped, reply: "واتساب", urgent: "" });
  const ar = copy("ar");
  await expect(page.locator("[data-received]")).toHaveText(ar.thanks.received.replace("{files}", files.map(iso).join("، ")));
  await expect(page.locator("[data-dropped]")).toHaveText(ar.thanks.dropped.replace("{files}", dropped.map(iso).join("، ")));
  // visual check: on each line, a name's pieces sit side by side (nothing of another name between them)
  const split = await page.evaluate(
    (lists) =>
      lists.flatMap(([sel, names]) => {
        const node = document.querySelector(sel!)!.firstChild!;
        const text = node.textContent!;
        return (names as string[]).flatMap((n) => {
          const r = document.createRange();
          r.setStart(node, text.indexOf(n));
          r.setEnd(node, text.indexOf(n) + n.length);
          const lines = new Map<number, [number, number][]>();
          for (const q of r.getClientRects()) lines.set(Math.round(q.top), [...(lines.get(Math.round(q.top)) ?? []), [q.left, q.right]]);
          return [...lines.values()].flatMap((segs) => {
            segs.sort((a, b) => a[0] - b[0]);
            return segs.slice(1).some((s, i) => s[0] - segs[i]![1] > 2) ? [n] : [];
          });
        });
      }),
    [
      ["[data-received]", files],
      ["[data-skipped]", skipped],
      ["[data-dropped]", dropped],
    ] as [string, string[]][],
  );
  expect(split, "names drawn in pieces").toEqual([]);
});

test("thanks: Copy number keeps its name; the urgent call link reads 'Call an engineer +20 …'; urgent messages lead with the number", async ({
  page,
  context,
  browserName,
}) => {
  if (browserName === "chromium") await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openThanks(page, "en", { name: "QA", company: "QA", need: "Panels", files: [], skipped: [], reply: "", urgent: "urgent" });
  const btn = page.locator("[data-ref-copy]");
  await expect(btn).toHaveAccessibleName(EN.thanks.ref.copy);
  await btn.click();
  await expect(page.locator("[data-ref-live]")).toHaveText(EN.thanks.ref.copied);
  await expect(btn).toContainText(EN.thanks.ref.copied); // shown…
  await expect(btn).toHaveAccessibleName(EN.thanks.ref.copy); // …but the button is not renamed (said once, by the region)
  await expect(page.locator("[data-urgent-now] a[href^='tel:']")).toHaveAccessibleName("Call an engineer +20 110 319 7233");
  const wa = decodeURIComponent((await page.locator("[data-urgent-now] a[href^='https://wa.me']").getAttribute("href"))!.split("text=")[1]!);
  expect(wa).toBe(EN.thanks.urgentNow.whatsapp.replace("{ref}", "LC-7K3QX"));
  expect(wa.endsWith("Machine and brand:")).toBe(true); // the visitor completes it

  // Arabic: a real space between the label and the number (no margin on the wrong side)
  await openThanks(page, "ar", { files: [], skipped: [], urgent: "urgent" });
  const call = page.locator("[data-urgent-now] a[href^='tel:']");
  await expect(call).toHaveAccessibleName(/^اتصل بمهندس\s\+20\s110\s319\s7233$/); // the number's groups are no-break spaces
  const gap = await call.evaluate((a) => {
    const num = a.querySelector(".ltr")!.getBoundingClientRect();
    const text = [...a.querySelector(".lc-btn-label")!.childNodes].find((n) => n.nodeType === 3 && n.textContent!.trim())!;
    const label = document.createRange();
    label.setStart(text, text.textContent!.length - text.textContent!.trimStart().length);
    label.setEnd(text, text.textContent!.trimEnd().length); // the words only, not the space after them
    return label.getBoundingClientRect().left - num.right; // RTL: the label sits right of the number
  });
  expect(gap).toBeGreaterThan(2);

  // zh: email, titled "Urgent", the stopped prompt as the body
  await openThanks(page, "zh", { files: [], skipped: [], urgent: "urgent" });
  const zh = copy("zh");
  const mail = (await page.locator("[data-urgent-now] a[href^='mailto:']").getAttribute("href"))!;
  expect(decodeURIComponent(/subject=([^&]+)/.exec(mail)![1]!)).toBe(zh.thanks.urgentNow.emailSubject.replace("{ref}", "LC-7K3QX"));
  expect(decodeURIComponent(/body=([^&]+)/.exec(mail)![1]!)).toBe(zh.thanks.urgentNow.whatsapp.replace(/\{ref\}/g, "LC-7K3QX").replace(/\n/g, "\r\n"));
});

test.describe("upload timeout", () => {
  // Request interception (page.route) turns Chromium's cross-document view transitions off: the contact page's
  // outgoing transition to the thanks page is then aborted, which Chromium reports as an uncaught page error even with
  // every promise of the transition handled. A test-environment artefact: real visitors get the transition.
  test.use({ allowConsole: [/Transition was aborted because of invalid state\. ViewTransition opt-in disabled/] });
  test("'Send without the files' sends the same request without them; the thanks page names what to send later", async ({ page }) => {
    test.slow();
    const posts: { files: boolean; dropped: string | null }[] = [];
    await page.route("**/api/rfq", async (r) => {
      const body = r.request().postDataBuffer()?.toString("latin1") ?? "";
      posts.push({ files: /filename="/.test(body), dropped: /name="dropped"\r\n\r\n([^\r]*)/.exec(body)?.[1] ?? null });
      if (posts.length === 1) return; // the upload with the files never completes
      await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, ref: "LC-7K3QX" }) });
    });
    await page.clock.install();
    await openForm(page, "/en/contact/");
    await fillStep1(page);
    await page.locator("[data-next]").click();
    await page.locator("#rfq-files").setInputFiles([{ name: "panel-photo.pdf", mimeType: "application/pdf", buffer: Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(200_000)]) }]);
    await page.locator("#rfq-consent").check();
    await page.clock.runFor(5000); // let Turnstile's test key settle
    await turnstileToken(page);
    await page.locator('[data-actions="2"] [data-submit]').click();
    await expect(page.locator("form[data-rfq]")).toHaveAttribute("data-sending", "");
    await page.clock.runFor(60_000);
    await expect(page.locator("[data-alert-text]")).toHaveText(EN.errors.timeout!);
    await expect(page.locator("[data-step-live]")).not.toHaveText(EN.form.buttons.sending!); // A11Y3-03: no stale "Sending…"
    const bare = page.locator("[data-send-bare]");
    await expect(bare).toBeVisible();
    await expect(bare).toHaveAccessibleName(EN.form.buttons.sendWithoutFiles!);
    await expect(bare).toHaveAccessibleDescription(EN.errors.withoutFiles!);
    await bare.click();
    // a fresh security check (real time), then the send and the success animation (the page's clock)
    await expect
      .poll(
        async () => {
          await page.clock.runFor(500);
          return page.url();
        },
        { timeout: 30_000 },
      )
      .toMatch(/\/en\/contact\/thanks\/\?ref=LC-7K3QX$/);
    expect(posts).toEqual([
      { files: true, dropped: null },
      { files: false, dropped: "panel-photo.pdf" },
    ]);
    await expect(page.locator("[data-dropped]")).toHaveText(EN.thanks.dropped.replace("{files}", iso("panel-photo.pdf")));
  });

  test("a slow upload that keeps moving is not cut off after 150 s", { tag: "@desktop-only" }, async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "upload throttling needs the Chrome DevTools Protocol");
    test.slow();
    await page.clock.install();
    await openForm(page, "/en/contact/");
    await fillStep1(page);
    await page.locator("[data-next]").click();
    await page.locator("#rfq-files").setInputFiles([{ name: "slow.pdf", mimeType: "application/pdf", buffer: Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(800_000)]) }]);
    await page.locator("#rfq-consent").check();
    await page.clock.runFor(5000);
    await turnstileToken(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 50, downloadThroughput: 1_000_000, uploadThroughput: 25_000 }); // ~32 s
    await page.locator('[data-actions="2"] [data-submit]').click();
    await expect(page.locator("[data-progress]")).toBeVisible();
    // the page's clock runs ~15× faster than the real upload: past the old 150 s cap while the bytes keep moving
    // (progress events arrive every few page-clock seconds, far inside the 30 s stall check)
    for (let fake = 1000; fake <= 200_000; fake += 1000) {
      await page.clock.runFor(1000);
      await page.waitForTimeout(50);
      expect(await page.locator("[data-alert]").isVisible(), `stopped after ${fake / 1000} s on the page's clock`).toBe(false);
    }
    const stillSending = /\/thanks\//.test(page.url()) || (await page.locator("form[data-rfq]").getAttribute("data-sending")) !== null;
    expect(stillSending, "still uploading (or sent), never stopped").toBe(true);
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await expect
      .poll(
        async () => {
          await page.clock.runFor(500);
          return page.url();
        },
        { timeout: 30_000 },
      )
      .toMatch(/\/en\/contact\/thanks\//);
  });
});

test("320 px: the security check renders compact, so it never widens the form", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.addInitScript(() => {
    (window as unknown as { turnstile: unknown }).turnstile = {
      render: (_el: HTMLElement, o: { size: string }) => ((window as unknown as { __size: string }).__size = o.size, "w1"),
      getResponse: () => "",
      reset() {},
      remove() {},
    };
  });
  for (const l of ["en", "ar"]) {
    await openForm(page, `/${l}/contact/`);
    await page.locator("#rfq-name").focus();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __size?: string }).__size)).toBe("compact");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  }
});

test("photos being reduced never show the 'larger than 4 MB' error (the real total is checked once they are ready)", async ({ page }) => {
  test.slow();
  const sharp = (await import("sharp")).default;
  const photo = await sharp({
    create: { width: 4000, height: 3000, channels: 3, background: { r: 0, g: 0, b: 0 }, noise: { type: "gaussian", mean: 120, sigma: 18 } },
  })
    .jpeg({ quality: 92 })
    .toBuffer();
  expect(2 * photo.byteLength).toBeGreaterThan(4 * 1024 * 1024); // too big together before they are reduced
  await openForm(page, "/en/contact/");
  await fillStep1(page);
  await page.locator("[data-next]").click();
  await page.evaluate(() => {
    const w = window as unknown as { __errs: string[]; __sums: string[] };
    w.__errs = [];
    w.__sums = [];
    const err = document.querySelector<HTMLElement>("#rfq-files-error")!;
    const sum = document.querySelector<HTMLElement>("#rfq-files-summary")!;
    const opts = { attributes: true, childList: true, characterData: true, subtree: true };
    new MutationObserver(() => !err.hidden && err.textContent && w.__errs.push(err.textContent)).observe(err, opts);
    new MutationObserver(() => sum.textContent && w.__sums.push(sum.textContent)).observe(sum, opts);
  });
  await page.locator("#rfq-files").setInputFiles([
    { name: "IMG_6101.jpg", mimeType: "image/jpeg", buffer: photo },
    { name: "IMG_6102.jpg", mimeType: "image/jpeg", buffer: photo },
  ]);
  await expect(page.locator("[data-files-list] .lc-file-note")).toHaveCount(2, { timeout: 15_000 });
  await expect(page.locator("#rfq-files-summary")).not.toContainText("…");
  const seen = await page.evaluate(() => {
    const w = window as unknown as { __errs: string[]; __sums: string[] };
    return { errs: w.__errs, sums: w.__sums };
  });
  expect(seen.sums[0]).toContain("2 of 3 files · … of"); // the total, once it is known
  expect(seen.errs).toEqual([]);
  await expect(page.locator("#rfq-files")).toHaveAttribute("aria-invalid", "false");
});

test("touch screens: the call-now panel's buttons are 44 px tall", { tag: "@phone" }, async ({ page, isMobile }) => {
  test.skip(!isMobile, "touch only (compact with a mouse)");
  await openForm(page, "/en/contact/?service=maintenance-support");
  for (const h of await page.locator("[data-urgent] .lc-btn").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height)))
    expect(h).toBeGreaterThanOrEqual(44);
});

test("thanks cards: the WhatsApp buttons stay on one line from 1024 to 1920 px (short label in narrow cards)", { tag: "@desktop-only" }, async ({
  page,
}) => {
  for (const l of ["en", "ar", "tr"]) {
    for (const width of [1024, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${l}/contact/thanks/`);
      const lines = await page.locator(".lc-thanks .lc-btn[href^='https://wa.me']").evaluateAll((els) =>
        els.map((a) => {
          const label = a.querySelector(".lc-btn-label")!;
          return Math.round(label.getBoundingClientRect().height / parseFloat(getComputedStyle(label).lineHeight));
        }),
      );
      expect(lines, `${l} ${width}`).toEqual(lines.map(() => 1));
    }
  }
  // the accessible name is the visible label (one of the two is display:none)
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en/contact/thanks/");
  await expect(page.locator(".lc-thanks .lc-btn[href^='https://wa.me']").last()).toHaveAccessibleName(`${EN.thanks.more.ctaShort} (opens in a new tab)`);
});

test("click counts: what the page sends is what the Worker accepts; at most 8 per view, no repeat within 3 s", { tag: "@desktop-only" }, async ({
  page,
}) => {
  const bodies: string[] = [];
  await page.route("**/api/evt", async (r) => {
    bodies.push(r.request().postData() ?? "");
    await r.fulfill({ status: 204 });
  });
  await page.goto("/en/");
  await page.evaluate(() => addEventListener("click", (e) => e.preventDefault(), true)); // count, but never leave the page
  await page.locator("header a[href^='tel:']:visible").first().click();
  await page.locator(".lc-float a[href^='https://wa.me']:visible").first().click();
  await page.locator(".lc-hero a[href^='https://wa.me']:visible").first().click();
  await page.locator(".lc-hero a[href*='/contact/']:visible").first().click();
  await expect.poll(() => bodies.length).toBe(4);
  const evts = bodies.map((b) => parseEvt(JSON.parse(b)));
  expect(evts).toEqual([
    { kind: "call", place: "header", locale: "en", path: "/en/" },
    { kind: "whatsapp", place: "fab", locale: "en", path: "/en/" },
    { kind: "whatsapp", place: "hero", locale: "en", path: "/en/" },
    { kind: "quote", place: "hero", locale: "en", path: "/en/" },
  ]);
  // a new page view: every link that counts, clicked twice in a row → repeats dropped, and the view stops at 8
  bodies.length = 0;
  await page.reload();
  await page.evaluate(() => addEventListener("click", (e) => e.preventDefault(), true));
  await page.evaluate(() => {
    for (const a of document.querySelectorAll<HTMLElement>("a[href^='tel:'], a[href^='mailto:'], a[href^='https://wa.me'], a[href*='/contact/']")) {
      a.click();
      a.click();
    }
  });
  await page.waitForTimeout(500);
  expect(bodies.length).toBe(8);
  const all = bodies.map((b) => parseEvt(JSON.parse(b)));
  expect(all.every((e) => e && (EVT_PLACES as readonly string[]).includes(e.place))).toBe(true);
  const keys = all.map((e) => `${e!.kind}|${e!.place}`);
  expect(new Set(keys).size).toBe(keys.length);
});
