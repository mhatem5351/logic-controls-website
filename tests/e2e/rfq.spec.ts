/**
 * Quote request form (RfqForm.astro → POST /api/rfq → send_email) end to end on the Workers runtime:
 * localized validation, two-step flow, Turnstile (Cloudflare test keys), the email the binding writes to
 * .wrangler/tmp/email (HTML-escaped, English labels, attachments), ?service= / ?industry= / ?location= preselection,
 * error panel and hand-over links, the request number on the thanks page, and the no-JS round trip.
 * Every test that sends uses a unique stamp to find its own email.
 * No fixed sleeps: negative checks wait for the event that would have produced the effect (CODE2-14).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { LOCALES, ROOT, emailFiles, findEmail, type Locale } from "./helpers";

type Contact = {
  validation: Record<string, string>;
  errors: Record<string, string>;
  form: {
    steps: { counter: string };
    context: { reference: string; referenceMessage: string };
    fields: {
      need: { options: Record<string, string> };
      industry: { options: Record<string, string> };
      files: { label: string; choose: string; addMore: string; remove: string; keepOpen: string };
      contactPreference: { label: string; options: Record<string, string> };
    };
  };
  thanks: { received: string; ref: { whatsapp: string; emailSubject: string } };
};
const copy = (l: Locale): Contact => JSON.parse(readFileSync(join(ROOT, "src/i18n/messages", l, "contact.json"), "utf8"));
/** The owner's email uses the English labels of the select values. */
const EN = copy("en");
const ZONES_EN = (
  JSON.parse(readFileSync(join(ROOT, "src/i18n/messages/en/common.json"), "utf8")) as { zones: { items: Record<string, { name: string }> } }
).zones.items;
const thanksUrl = (l: string) => new RegExp(`/${l}/contact/thanks/\\?ref=LC-[0-9A-Z]{5}$`);
/** A file name as the form and the thanks page write it into a sentence: isolated with its own direction (I18N3-02). */
const iso = (name: string) => `\u2068${name}\u2069`;
const stampOf = (l: string) => `QA-${l}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

async function openForm(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator("form[data-rfq][data-enhanced]")).toHaveCount(1);
}
async function turnstileToken(page: Page) {
  await expect
    .poll(
      () =>
        page
          .locator("input[name='cf-turnstile-response']")
          .first()
          .inputValue()
          .catch(() => ""),
      {
        message: "Turnstile (test site key) issues a token",
        timeout: 25_000,
      },
    )
    .not.toBe("");
}

for (const locale of LOCALES) {
  const t = copy(locale);
  // Phones run the flow in English and Arabic (RTL); desktop runs all four locales.
  const tag = locale === "en" || locale === "ar" ? [] : ["@desktop-only"];

  test(`[${locale}] two-step flow: localized validation, step 2, submit → thanks, escaped email`, { tag }, async ({ page }) => {
    test.slow();
    await openForm(page, `/${locale}/contact/`);
    const zh = locale === "zh"; // zh: email is required in step 1, the phone is optional (WhatsApp is blocked in mainland China)

    // 1. empty step 1 → summary alert (count + one link per field), inline errors, focus on the first invalid field
    await expect(page.locator("#rfq-service")).toHaveAttribute("aria-invalid", "false"); // not "invalid" before any input
    await page.locator("[data-next]").click();
    await expect(page.locator("[data-alert]")).toBeVisible();
    await expect(page.locator("[data-alert-title]")).toHaveText(t.validation.summaryCount!.replace("{count}", "4"));
    await expect(page.locator("[data-alert-list] a")).toHaveCount(4);
    await expect(page.locator("#rfq-name")).toBeFocused();
    await expect(page.locator("#rfq-name")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#rfq-name-error")).toHaveText(t.validation.name!);
    if (zh) await expect(page.locator("#rfq-phone-error")).toBeHidden();
    else await expect(page.locator("#rfq-phone-error")).toHaveText(t.validation.required!);
    await expect(page.locator("#rfq-service-error")).toHaveText(t.validation.select!);
    if (zh) await expect(page.locator("#rfq-email-error")).toHaveText(t.validation.required!);
    await page.locator("[data-alert-list] a").last().click(); // a summary link moves focus to its field
    await expect(page.locator("#rfq-service")).toBeFocused();

    // 2. invalid phone → localized phone message
    await page.locator("#rfq-phone").fill("12");
    await page.locator("[data-next]").click();
    await expect(page.locator("#rfq-phone-error")).toHaveText(t.validation.phone!);

    // 3. valid step 1 (hostile name: must arrive escaped in the HTML email)
    const stamp = stampOf(locale);
    const hostile = `<script>alert("x")</script> ${stamp}`;
    await page.locator("#rfq-name").fill(hostile);
    await page.locator("#rfq-company").fill("QA Factory & Sons");
    await page.locator("#rfq-phone").fill(locale === "ar" ? "+٢٠ ١٠٠ ٠٠٠ ٠٠٠٠" : "+20 100 000 0000");
    if (zh) await page.locator("#rfq-email").fill("qa@example.com");
    await page.locator("#rfq-service").selectOption("process-control");
    await page.locator("[data-next]").click();

    // 4. step 2: active panel, focus on its legend, live step counter, current step, alert gone
    await expect(page.locator('[data-step="2"]')).toHaveAttribute("data-active", "");
    await expect(page.locator('[data-step-tab="2"]')).toHaveAttribute("aria-current", "step");
    await expect(page.locator('[data-step="2"] legend')).toBeFocused();
    await expect(page.locator("[data-step-live]")).toHaveText(t.form.steps.counter.replace("{current}", "2").replace("{total}", "2"));
    await expect(page.locator("[data-alert]")).toBeHidden();
    await expect(page.locator("[data-back]")).toBeVisible();

    await page.locator("#rfq-message").fill(`Automated QA <b>test</b> — please ignore. ${stamp}`);
    await page.locator("#rfq-industry").selectOption("food-beverage");
    await page.locator("#rfq-location").selectOption("obour");
    if (!zh) await page.locator("#rfq-email").fill("qa@example.com");
    await page.locator("#rfq-consent").check();
    await turnstileToken(page);

    await page.locator('[data-actions="2"] [data-submit]').click();
    await page.waitForURL(thanksUrl(locale), { timeout: 20_000 });
    await expect(page.locator("main h1")).toBeVisible();
    await expect(page.locator("[data-ref]")).toHaveText(/^LC-[0-9A-Z]{5}$/);

    // 5. the email the Worker sent (wrangler dev writes it to .wrangler/tmp/email)
    const mail = await findEmail(stamp);
    expect(mail.text).toContain(`Name: ${hostile}`);
    expect(mail.text).toContain("Phone / WhatsApp: +20 100 000 0000"); // Arabic-Indic digits converted client-side
    expect(mail.text).toContain(`Service: ${EN.form.fields.need.options["process-control"]}`);
    expect(mail.text).toContain(`Factory location: ${ZONES_EN.obour!.name}`);
    expect(mail.text).toContain("Reply on WhatsApp: https://wa.me/201000000000");
    expect(mail.text).toContain(`Sent from page: /${locale}/contact/`);
    expect(mail.text).toContain(`Language: ${locale}`);
    expect(mail.html).toContain(`&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; ${stamp}`);
    expect(mail.html).toContain("QA Factory &amp; Sons");
    expect(mail.html).toContain("&lt;b&gt;test&lt;/b&gt;");
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).not.toContain("<b>test</b>");
  });
}

test("step 1 only (“send now”): the description is composed from the selections", async ({ page }) => {
  test.slow();
  await openForm(page, "/en/contact/?service=control-panels&industry=pharmaceutical");
  const stamp = stampOf("now");
  await page.locator("#rfq-name").fill(`QA ${stamp}`);
  await page.locator("#rfq-company").fill("QA");
  await page.locator("#rfq-phone").fill("+20 100 000 0000");
  await page.locator("#rfq-consent").check();
  await turnstileToken(page);
  await page.locator('[data-actions="1"] [data-submit]').click();
  await page.waitForURL(thanksUrl("en"), { timeout: 20_000 });
  const mail = await findEmail(stamp);
  expect(mail.text).toContain(
    `Project details: ${EN.form.fields.need.options["control-panels"]} · ${EN.form.fields.industry.options.pharmaceutical}`,
  );
  expect(mail.text).toContain(`Industry: ${EN.form.fields.industry.options.pharmaceutical}`);
});

test("?service= / ?industry= / ?location= preselect the form; unknown values are ignored", async ({ page }) => {
  await openForm(page, "/ar/contact/?service=scada-data-logging&industry=pharmaceutical&location=ain-sokhna#quote");
  await expect(page.locator("#rfq-service")).toHaveValue("scada-data-logging");
  await expect(page.locator("#rfq-industry")).toHaveValue("pharmaceutical");
  await expect(page.locator("#rfq-location")).toHaveValue("ain-sokhna");

  await openForm(page, "/en/contact/?service=bogus&location=<script>");
  await expect(page.locator("#rfq-service")).toHaveValue("");
  await expect(page.locator("#rfq-location")).toHaveValue("");
});

test("a service page's quote CTA preselects that service", { tag: "@desktop-only" }, async ({ page }) => {
  await page.goto("/en/services/machine-retrofits/");
  await page.locator('a[href^="/en/contact/?service=machine-retrofits"]').first().click();
  await expect(page.locator("form[data-rfq][data-enhanced]")).toHaveCount(1);
  await expect(page.locator("#rfq-service")).toHaveValue("machine-retrofits");
});

test.describe("server error", () => {
  test.use({ allowConsole: [/status of 502/] }); // the simulated 502 itself

  test("→ localized error panel with fallback channels; ?error= on load shows it too", async ({ page }) => {
    await page.route("**/api/rfq", (r) =>
      r.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ ok: false, error: "send" }) }),
    );
    await openForm(page, "/en/contact/");
    await page.locator("#rfq-name").fill("QA");
    await page.locator("#rfq-company").fill("QA");
    await page.locator("#rfq-phone").fill("+20 100 000 0000");
    await page.locator("#rfq-service").selectOption({ index: 1 });
    await page.locator("#rfq-consent").check();
    await page.locator('[data-actions="1"] [data-submit]').click();
    const en = copy("en");
    await expect(page.locator("[data-alert-title]")).toHaveText(en.errors.title!, { timeout: 15_000 });
    await expect(page.locator("[data-alert-text]")).toHaveText(en.errors.send!);
    await expect(page.locator("[data-alert-fallback]")).toBeVisible();
    await expect(page.locator("[data-alert-fallback] a[href^='tel:+20']")).toHaveCount(1);
    await expect(page).toHaveURL("/en/contact/"); // stays on the form

    const ar = copy("ar");
    await openForm(page, "/ar/contact/?error=verification#quote");
    await expect(page.locator("[data-alert]")).toBeVisible();
    await expect(page.locator("[data-alert-text]")).toHaveText(ar.errors.verification!);
  });
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("one long form; a POST without Turnstile comes back to the form with ?error=verification and a visible alert", async ({ page }) => {
    await page.goto("/en/contact/");
    await expect(page.locator('[data-step="2"]')).toBeVisible();
    await expect(page.locator("#rfq-message")).not.toHaveAttribute("required"); // the Worker composes a fallback
    await expect(page.locator('[data-actions="1"]')).toBeHidden();
    await page.locator("#rfq-name").fill("QA NoJS");
    await page.locator("#rfq-company").fill("QA");
    await page.locator("#rfq-phone").fill("+20 100 000 0000");
    await page.locator("#rfq-service").selectOption({ index: 1 });
    await page.locator("#rfq-message").fill("No-JS QA submission. Please ignore.");
    await page.locator("#rfq-consent").check();
    await page.locator('[data-actions="2"] [type=submit]').click();
    await page.waitForURL("**/en/contact/?error=verification#rfq-error-verification");
    await expect(page.locator("#rfq-error-verification")).toBeVisible();
    await expect(page.locator("#rfq-error-verification")).toContainText(copy("en").errors.verification!);
    await expect(page.locator("#rfq-error-send")).toBeHidden();
  });

  test(
    "the form's own POST contract (what a browser without JS sends) with a Turnstile token → 303 thanks + escaped email",
    { tag: "@desktop-only" },
    async ({ page }) => {
      await page.goto("/ar/contact/");
      // the field names come from the rendered no-JS form, so a renamed field breaks this test, not the inbox
      const names = await page.locator("form[data-rfq] [name]").evaluateAll((els) => els.map((e) => e.getAttribute("name")));
      for (const n of [
        "name",
        "company",
        "phone",
        "email",
        "service",
        "industry",
        "location",
        "timeline",
        "country",
        "message",
        "locale",
        "page",
        "lc_hp",
        "consent",
      ]) {
        expect(names, n).toContain(n);
      }
      const stamp = stampOf("nojs");
      const res = await page.request.post("/api/rfq", {
        headers: { Accept: "text/html" },
        form: {
          locale: "ar",
          page: "/ar/contact/",
          lc_hp: "",
          name: `<img src=x onerror=alert(1)> ${stamp}`,
          company: "مصنع الاختبار",
          phone: "+20 100 000 0000",
          service: "control-panels",
          message: "No-JS contract test & <b>escaping</b>",
          consent: "yes",
          "cf-turnstile-response": "XXXX.DUMMY.TOKEN.XXXX",
        },
        maxRedirects: 0,
      });
      expect(res.status()).toBe(303);
      expect(res.headers()["location"]).toMatch(/^\/ar\/contact\/thanks\/\?ref=LC-[0-9A-Z]{5}$/);
      const mail = await findEmail(stamp);
      expect(mail.text).toContain("Language: ar");
      expect(mail.html).toContain(`&lt;img src=x onerror=alert(1)&gt; ${stamp}`);
      expect(mail.html).toContain("No-JS contract test &amp; &lt;b&gt;escaping&lt;/b&gt;");
      expect(mail.html).not.toContain("<img");
    },
  );

  test("honeypot: a filled hidden field gets the thanks page and no email is sent", { tag: "@desktop-only" }, async ({ page }) => {
    const stamp = stampOf("hp");
    await page.goto("/tr/contact/");
    await page.locator("#rfq-hp").fill("https://spam.example", { force: true });
    await page.locator("#rfq-name").fill(`Bot ${stamp}`);
    await page.locator("#rfq-company").fill("Bot");
    await page.locator("#rfq-phone").fill("+20 100 000 0000");
    await page.locator("#rfq-service").selectOption({ index: 1 });
    await page.locator("#rfq-message").fill("spam");
    await page.locator("#rfq-consent").check();
    await page.locator('[data-actions="2"] [type=submit]').click();
    await page.waitForURL(thanksUrl("tr"));
    // The binding writes emails after the Worker has answered (waitUntil), so "no file yet" proves nothing on its own.
    // A real request sent afterwards is the barrier: once ITS email is on disk, the bot's would be too.
    const control = stampOf("hp-control");
    const res = await page.request.post("/api/rfq", {
      headers: { Accept: "application/json" },
      form: { locale: "tr", name: `QA ${control}`, phone: "+20 100 000 0000", consent: "yes", "cf-turnstile-response": "XXXX.DUMMY.TOKEN.XXXX" },
    });
    expect(res.status()).toBe(200);
    await findEmail(control);
    const sent = emailFiles("text").some((f) => readFileSync(f, "utf8").includes(stamp));
    expect(sent).toBe(false);
  });
});

/** Step 1 filled (English), then on to step 2. */
async function toStep2(page: Page, stamp: string, phone = "010 0000 0000") {
  await page.locator("#rfq-name").fill(`QA ${stamp}`);
  await page.locator("#rfq-company").fill("QA");
  await page.locator("#rfq-phone").fill(phone);
  await page.locator("#rfq-service").selectOption("control-panels");
  await page.locator("#rfq-phone").press("Enter"); // Enter continues to step 2 (it must not send)
  await expect(page.locator('[data-step="2"]')).toHaveAttribute("data-active", "");
}
const pdf = (name: string, size = 2048) => ({
  name,
  mimeType: "application/pdf",
  buffer: Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(size)]),
});
const filesLive = (page: Page) => page.locator("[data-files-live]");

test("attachments: chosen files are listed, limits are explained, and they reach the owner's email", async ({ page }) => {
  test.slow();
  await openForm(page, "/en/contact/");
  const stamp = stampOf("files");
  await toStep2(page, stamp); // Egyptian local format → wa.me/20…
  await page.locator("#rfq-files").setInputFiles([pdf("1.pdf"), pdf("2.pdf"), pdf("3.pdf"), pdf("4.pdf")]);
  await expect(page.locator("#rfq-files-error")).toHaveText(EN.validation.filesCount!.replace("{max}", "3"));
  await expect(filesLive(page)).toHaveText(EN.validation.filesCount!.replace("{max}", "3")); // announced when picked (A11Y2-05)
  await page.locator(".lc-file-remove").first().click();
  await expect(page.locator("[data-files-list] li")).toHaveCount(3);
  await expect(page.locator("#rfq-files-error")).toBeHidden();
  await page.locator("#rfq-consent").check();
  await turnstileToken(page);
  await page.locator('[data-actions="2"] [data-submit]').click();
  await page.waitForURL(thanksUrl("en"), { timeout: 20_000 });
  await expect(page.locator("[data-received]")).toHaveText(EN.thanks.received.replace("{files}", ["2.pdf", "3.pdf", "4.pdf"].map(iso).join(", "))); // UX2-20
  const mail = await findEmail(stamp);
  expect(mail.text).toContain("Attachments: 2.pdf (2 KB), 3.pdf (2 KB), 4.pdf (2 KB)");
  expect(mail.html).toContain('<a href="https://wa.me/201000000000">Reply on WhatsApp</a>');
});

test("attachments: each pick adds to the list (phones pick one photo at a time), duplicates are ignored, any file can be removed", async ({
  page,
}) => {
  await openForm(page, "/en/contact/");
  await toStep2(page, stampOf("multi"));
  const name = page.locator("[data-files-list] .lc-file-name");
  await page.locator("#rfq-files").setInputFiles([pdf("drawing.pdf")]);
  await expect(page.locator("#rfq-files-choose")).toHaveText(EN.form.fields.files.addMore); // the button says "add more"
  await page.locator("#rfq-files").setInputFiles([pdf("panel.pdf", 4096)]);
  await page.locator("#rfq-files").setInputFiles([pdf("drawing.pdf")]); // the same file again
  await expect(name).toHaveText(["drawing.pdf", "panel.pdf"]);
  await expect(page.locator("#rfq-files-summary")).toContainText("2 of 3 files");
  await page.getByRole("button", { name: EN.form.fields.files.remove.replace("{name}", "drawing.pdf") }).click();
  await expect(name).toHaveText(["panel.pdf"]);
  await page.getByRole("button", { name: EN.form.fields.files.remove.replace("{name}", "panel.pdf") }).click();
  await expect(name).toHaveCount(0);
  await expect(page.locator("#rfq-files-summary")).toBeHidden();
  await expect(page.locator("#rfq-files")).toBeFocused(); // focus never falls to the page
  await expect(page.locator("#rfq-files-choose")).toHaveText(EN.form.fields.files.choose);
});

test("attachments: a rejected type is named in the error, on the file and in the announcement; a content mismatch only warns", async ({
  page,
}) => {
  await openForm(page, "/en/contact/");
  await toStep2(page, stampOf("types"));
  await page
    .locator("#rfq-files")
    .setInputFiles([pdf("drawing.pdf"), { name: "setup.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") }]);
  const msg = EN.validation.filesType!.replace("{files}", iso("setup.exe"));
  await expect(page.locator("#rfq-files-error")).toHaveText(msg);
  await expect(page.locator("#rfq-files")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("[data-files-list] li[data-issue=type]")).toContainText("setup.exe");
  await expect(filesLive(page)).toContainText(msg);
  await page.getByRole("button", { name: EN.form.fields.files.remove.replace("{name}", "setup.exe") }).click();
  await expect(page.locator("#rfq-files")).toHaveAttribute("aria-invalid", "false");
  // renamed file: the content does not match → a warning on that file (the request can still be sent)
  await page
    .locator("#rfq-files")
    .setInputFiles([{ name: "plan.dxf", mimeType: "application/octet-stream", buffer: Buffer.from([0, 1, 2, 3, 4]) }]);
  await expect(page.locator("[data-files-list] li[data-issue=content]")).toContainText("plan.dxf");
  await expect(page.locator("#rfq-files")).toHaveAttribute("aria-invalid", "false");
});

test("attachments: large photos are reduced in the browser before they count against 4 MB", async ({ page }) => {
  test.slow();
  // A 4000×3000 camera-like JPEG (noise compresses badly, like a real photo), ~3 MB
  const sharp = (await import("sharp")).default;
  const photo = await sharp({
    create: { width: 4000, height: 3000, channels: 3, background: { r: 0, g: 0, b: 0 }, noise: { type: "gaussian", mean: 120, sigma: 18 } },
  })
    .jpeg({ quality: 88 })
    .toBuffer();
  expect(photo.byteLength).toBeGreaterThan(1.5 * 1024 * 1024);
  await openForm(page, "/en/contact/");
  await toStep2(page, stampOf("photo"));
  await page.locator("#rfq-files").setInputFiles([
    { name: "IMG_4021.jpg", mimeType: "image/jpeg", buffer: photo },
    { name: "IMG_4022.jpg", mimeType: "image/jpeg", buffer: photo },
  ]);
  await expect(page.locator("[data-files-list] .lc-file-note").first()).toContainText(/Photo reduced for sending/, { timeout: 15_000 });
  await expect(page.locator("[data-files-list] .lc-file-note")).toHaveCount(2, { timeout: 15_000 });
  // two typical phone photos now fit the 4 MB total (they used to be rejected together)
  await expect(page.locator("#rfq-files")).toHaveAttribute("aria-invalid", "false");
  const total = await page.locator("#rfq-files-summary").textContent();
  expect(total).toMatch(/2 of 3 files · \D?\d+(\.\d)?\s(KB|MB)\D? of/);
});

test.describe("attachments: per-file answer", () => {
  test.use({ allowConsole: [/status of 422/] }); // the simulated 422 itself

  test("attachments: per-file answer from the server marks that file and sends the visitor to it", async ({ page }) => {
    await page.route("**/api/rfq", (r) =>
      r.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: "attachments", problem: "type", files: ["drawing.pdf"] }),
      }),
    );
    await openForm(page, "/en/contact/");
    await toStep2(page, stampOf("perfile"));
    await page.locator("#rfq-files").setInputFiles([pdf("drawing.pdf"), pdf("other.pdf")]);
    await page.locator("#rfq-consent").check();
    await turnstileToken(page);
    await page.locator('[data-actions="2"] [data-submit]').click();
    const msg = EN.validation.filesType!.replace("{files}", iso("drawing.pdf"));
    await expect(page.locator("[data-alert-list] a")).toHaveText(`${EN.form.fields.files.label}: ${msg}`);
    await expect(page.locator("[data-files-list] li[data-issue=type]")).toHaveCount(1);
    await expect(page.locator("[data-files-list] li[data-issue=type]")).toContainText("drawing.pdf");
    await expect(page.locator("#rfq-files")).toHaveAttribute("aria-invalid", "true");
  });
});

test("attachments: drag and drop onto the box adds files (desktop)", { tag: "@desktop-only" }, async ({ page }) => {
  await openForm(page, "/en/contact/");
  await toStep2(page, stampOf("drop"));
  const dt = await page.evaluateHandle(() => {
    const d = new DataTransfer();
    d.items.add(new File(["%PDF-1.7\n"], "dropped.pdf", { type: "application/pdf" }));
    return d;
  });
  await page.dispatchEvent("[data-file-zone]", "dragenter", { dataTransfer: dt });
  await expect(page.locator("[data-file-zone]")).toHaveAttribute("data-drag", "");
  await page.dispatchEvent("[data-file-zone]", "drop", { dataTransfer: dt });
  await expect(page.locator("[data-files-list] .lc-file-name")).toHaveText(["dropped.pdf"]);
  await expect(page.locator("[data-file-zone]")).not.toHaveAttribute("data-drag", "");
});

test("attachments: long, similar names stay distinguishable at 320px and never widen the page", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  for (const l of ["en", "ar"] as const) {
    await openForm(page, `/${l}/contact/`);
    await page.locator("#rfq-name").fill("QA QA");
    await page.locator("#rfq-company").fill("QA");
    await page.locator("#rfq-phone").fill("010 0000 0000");
    await page.locator("#rfq-service").selectOption("control-panels");
    await page.locator("[data-next]").click();
    const names = ["ACME_Pasteurizer_Electrical_Schematic_Rev06.pdf", "ACME_Pasteurizer_Electrical_Schematic_Rev07.pdf"];
    await page.locator("#rfq-files").setInputFiles(names.map((n) => pdf(n)));
    for (const n of names) await expect(page.locator(".lc-file-name", { hasText: n })).toBeVisible();
    const fits = await page.locator(".lc-file-name").evaluateAll((els) => els.every((e) => e.scrollWidth <= e.clientWidth + 1));
    expect(fits, "the whole name is shown (wrapped), nothing clipped").toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  }
});

test("upload: progress is shown while files go up on a slow connection (button + bar), then the thanks page", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "upload throttling needs the Chrome DevTools Protocol");
  test.slow();
  await openForm(page, "/en/contact/");
  const stamp = stampOf("progress");
  await toStep2(page, stamp);
  await page.locator("#rfq-files").setInputFiles([pdf("drawing.pdf", 600_000)]);
  await page.locator("#rfq-consent").check();
  await turnstileToken(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 50,
    downloadThroughput: 1_000_000,
    uploadThroughput: 120_000,
  }); // ~5 s
  await page.locator('[data-actions="2"] [data-submit]').click();
  const bar = page.locator("[data-progress] [role=progressbar]");
  await expect(page.locator("[data-progress]")).toBeVisible();
  await expect(page.locator("[data-progress]")).toContainText(EN.form.fields.files.keepOpen);
  await expect.poll(async () => Number(await bar.getAttribute("aria-valuenow")), { timeout: 10_000 }).toBeGreaterThan(0);
  // A11Y3-03: the percentage is shown beside the label, never part of the focused button's name
  await expect(page.locator('[data-actions="2"] [data-submit-label]')).toHaveText("Uploading files…");
  await expect(page.locator('[data-actions="2"] [data-submit-pct]')).toHaveText(/^\s*\d+%$/);
  await expect(page.locator('[data-actions="2"] [data-submit]')).toHaveAccessibleName("Uploading files…");
  await page.waitForURL(thanksUrl("en"), { timeout: 30_000 });
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  const mail = await findEmail(stamp);
  expect(mail.text).toContain("Attachments: drawing.pdf");
});

test("upload: a request that never answers is stopped by the watchdog, with the hand-over and Try again (files kept)", async ({ page }) => {
  test.slow();
  await page.route("**/api/rfq", () => {}); // never answers
  await page.clock.install();
  await openForm(page, "/en/contact/");
  await toStep2(page, stampOf("stall"));
  await page.locator("#rfq-files").setInputFiles([pdf("drawing.pdf", 200_000)]);
  await page.locator("#rfq-consent").check();
  await page.clock.runFor(5000); // let Turnstile's test key settle
  await turnstileToken(page);
  await page.locator('[data-actions="2"] [data-submit]').click();
  await expect(page.locator("form[data-rfq]")).toHaveAttribute("data-sending", "");
  await page.clock.runFor(160_000);
  await expect(page.locator("[data-alert-text]")).toHaveText(EN.errors.timeout!, { timeout: 10_000 });
  await expect(page.locator("[data-retry]")).toBeVisible();
  await expect(page.locator("[data-alert-fallback] a[data-fallback=whatsapp]")).toHaveAttribute("href", /drawing\.pdf/);
  await expect(page.locator("[data-progress]")).toBeHidden();
  await expect(page.locator("form[data-rfq]")).not.toHaveAttribute("data-sending", "");
  await expect(page.locator("[data-files-list] li")).toHaveCount(1); // Try again keeps the files
});

test("urgent: troubleshooting (or 'a machine is stopped') shows the call-now panel", async ({ page }) => {
  await openForm(page, "/en/contact/?service=maintenance-support");
  await expect(page.locator("[data-urgent]")).toBeVisible();
  await expect(page.locator("[data-urgent] a[href='tel:+201103197233']")).toHaveCount(1);
  await page.locator("#rfq-service").selectOption("control-panels");
  await expect(page.locator("[data-urgent]")).toBeHidden();
});

test("urgent: 'Skip and send now' with 'a machine is stopped now' → [URGENT] email and call-now first on the thanks page", async ({
  page,
}) => {
  test.slow();
  await openForm(page, "/en/contact/?service=maintenance-support");
  const stamp = stampOf("urgent");
  await page.locator("#rfq-name").fill(`QA ${stamp}`);
  await page.locator("#rfq-company").fill("QA Line 2");
  await page.locator("#rfq-phone").fill("+20 100 000 0000");
  await page.locator("#rfq-stopped").check(); // the switch in the call-now panel (step 1)
  await expect(page.locator("#rfq-timeline")).toHaveValue("urgent");
  await page.locator("#rfq-consent").check();
  await turnstileToken(page);
  await page.locator('[data-actions="1"] [data-submit]').click();
  await page.waitForURL(thanksUrl("en"), { timeout: 20_000 });
  await expect(page.locator("[data-urgent-now]")).toBeVisible();
  await expect(page.locator("[data-urgent-now] a[href='tel:+201103197233']")).toBeInViewport();
  await expect(page.locator("[data-default-actions]")).toBeHidden();
  const mail = await findEmail(stamp);
  expect(mail.text.startsWith("URGENT: a machine is stopped.")).toBe(true);
  expect(mail.text).toContain("Timeline: Urgent: a machine is stopped");
});

test("urgent: troubleshooting sent without a timeline is flagged as possibly urgent", { tag: "@desktop-only" }, async ({ page }) => {
  test.slow();
  await openForm(page, "/ar/contact/?service=maintenance-support");
  const stamp = stampOf("likely");
  await page.locator("#rfq-name").fill(`QA ${stamp}`);
  await page.locator("#rfq-company").fill("QA");
  await page.locator("#rfq-phone").fill("01000000000");
  await page.locator("#rfq-consent").check();
  await turnstileToken(page);
  await page.locator('[data-actions="1"] [data-submit]').click();
  await page.waitForURL(thanksUrl("ar"), { timeout: 20_000 });
  await expect(page.locator("[data-urgent-now]")).toBeVisible();
  const mail = await findEmail(stamp);
  expect(mail.text.startsWith("POSSIBLY URGENT")).toBe(true);
});

test("reply channel: Email makes the email required and brings it into step 1; Phone call / WhatsApp need a number", async ({ page }) => {
  await openForm(page, "/en/contact/");
  await page.locator("#rfq-reply-email").check();
  await expect(page.locator('[data-step="1"] #rfq-email')).toBeVisible();
  await expect(page.locator("#rfq-email")).toHaveAttribute("aria-required", "true");
  await expect(page.locator('[data-field="rfq-email"] [data-opt-mark]')).toBeHidden();
  await page.locator("#rfq-name").fill("QA QA");
  await page.locator("#rfq-company").fill("QA");
  await page.locator("#rfq-phone").fill("+20 100 000 0000");
  await page.locator("#rfq-service").selectOption("control-panels");
  await page.locator("[data-next]").click();
  await expect(page.locator("#rfq-email-error")).toHaveText(EN.validation.emailForReply!);
  await expect(page.locator("#rfq-email")).toBeFocused();
  await page.locator("#rfq-reply-whatsapp").check(); // released again, back at the end of step 2
  await expect(page.locator('[data-step="2"] #rfq-email')).toHaveCount(1);
  await expect(page.locator("#rfq-email")).toHaveAttribute("aria-required", "false");

  const zh = copy("zh");
  await openForm(page, "/zh/contact/");
  await page.locator("#rfq-reply-phone").check();
  // the English page's draft (saved 300 ms after its last change) may carry the number over: start without one
  await page.locator("#rfq-phone").fill("");
  await page.locator("#rfq-name").fill("QA QA");
  await page.locator("#rfq-company").fill("QA");
  await page.locator("#rfq-email").fill("qa@example.com");
  await page.locator("#rfq-service").selectOption("control-panels");
  await page.locator("[data-next]").click();
  await expect(page.locator("#rfq-phone-error")).toHaveText(zh.validation.phoneForReply!);
});

test("phone: a local number the owner could not dial gets a gentle country-code hint (never an error)", async ({ page }) => {
  await openForm(page, "/en/contact/");
  await page.locator("#rfq-phone").fill("0532 123 45 67");
  await page.locator("#rfq-phone").blur();
  await expect(page.locator("#rfq-phone-hint")).toBeVisible();
  await expect(page.locator("#rfq-phone")).toHaveAttribute("aria-invalid", "false");
  await page.locator("#rfq-phone").fill("+90 532 123 45 67");
  await page.locator("#rfq-phone").blur();
  await expect(page.locator("#rfq-phone-hint")).toBeHidden();
  await openForm(page, "/tr/contact/"); // the Turkish form reads Turkish mobiles
  await page.locator("#rfq-phone").fill("0532 123 45 67");
  await page.locator("#rfq-phone").blur();
  await expect(page.locator("#rfq-phone-hint")).toBeHidden();
});

test("phone hint: clicking Continue right after fixing the number still continues (the hint must not move the button mid-click)", async ({
  page,
}) => {
  await openForm(page, "/en/contact/");
  await page.locator("#rfq-name").fill("QA QA");
  await page.locator("#rfq-company").fill("QA");
  await page.locator("#rfq-service").selectOption("control-panels");
  await page.locator("#rfq-phone").fill("0532 123 45 67");
  await page.locator("#rfq-phone").blur();
  await expect(page.locator("#rfq-phone-hint")).toBeVisible();
  await page.locator("#rfq-phone").fill("+90 532 123 45 67");
  await page.locator("[data-next]").click(); // mousedown blurs the phone: the hint goes away only after the click
  await expect(page.locator('[data-step="2"]')).toHaveAttribute("data-active", "");
  await expect(page.locator("#rfq-phone-hint")).toBeHidden();
});

test("validation: tabbing past the consent box does not mark it invalid; an error appearing on blur does not swallow the click on Back", async ({
  page,
}) => {
  await openForm(page, "/en/contact/");
  await page.locator("#rfq-consent").focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("#rfq-consent")).toHaveAttribute("aria-invalid", "false");
  await toStep2(page, stampOf("blur"));
  await page.locator("#rfq-email").fill("bad@");
  await page.locator("[data-back]").click(); // mousedown blurs the email; the click must still land
  await expect(page.locator('[data-step="1"]')).toHaveAttribute("data-active", "");
});

test("case study / reference CTAs: the form says what it is about and starts the description", async ({ page }) => {
  await openForm(page, "/en/contact/?project=milk-pasteurizer#quote");
  await expect(page.locator("[data-context]")).toBeVisible();
  await expect(page.locator("#rfq-message")).toHaveValue(/^I have a project similar to your case study “/);
  await openForm(page, "/en/contact/?service=other&intent=reference#quote");
  await expect(page.locator("[data-context-text]")).toHaveText(EN.form.context.reference);
  await expect(page.locator("#rfq-message")).toHaveValue(`${EN.form.context.referenceMessage}\n`);
  await openForm(page, "/en/contact/?project=<script>");
  await expect(page.locator("[data-context]")).toBeHidden();
});

/** The stored draft (sessionStorage, saved 300 ms after the last change). */
const storedDraft = (page: Page) => page.evaluate(() => JSON.parse(sessionStorage.getItem("lcRfqDraft") ?? "{}") as Record<string, string>);

test("draft: kept across a language switch, never defaults the visitor did not choose, gone after sending", async ({ page }) => {
  test.slow();
  await openForm(page, "/ar/contact/"); // WhatsApp is preselected on Arabic pages
  await page.locator("#rfq-name").fill("QA Draft");
  await expect.poll(() => storedDraft(page), { message: "the name only, not the untouched WhatsApp chip" }).toEqual({ name: "QA Draft" });
  await openForm(page, "/en/contact/");
  await expect(page.locator("#rfq-name")).toHaveValue("QA Draft");
  await expect(page.locator("input[name=reply]:checked")).toHaveCount(0); // no WhatsApp carried over from ar
  await openForm(page, "/zh/contact/");
  await expect(page.locator("#rfq-name")).toHaveValue("QA Draft");
  await expect(page.locator("input[name=reply]:checked")).toHaveValue("email"); // the zh default is not wiped (CODE2-19)
  await openForm(page, "/en/contact/");
  const stamp = stampOf("draft");
  await page.locator("#rfq-name").fill(`QA ${stamp}`);
  await page.locator("#rfq-company").fill("QA");
  await page.locator("#rfq-phone").fill("+20 100 000 0000");
  await page.locator("#rfq-service").selectOption("control-panels");
  await turnstileToken(page);
  await page.locator("#rfq-consent").check();
  await page.locator('[data-actions="1"] [data-submit]').click(); // within the 300 ms draft debounce (UX2-21)
  await page.waitForURL(thanksUrl("en"), { timeout: 20_000 });
  await expect(page.locator("[data-ref]")).toHaveText(/^LC-/); // the thanks script has read (and deleted) the summary
  // a debounced save that resurrected the draft would have run on the form page, before it navigated
  expect(await page.evaluate(() => [sessionStorage.getItem("lcRfqDraft"), sessionStorage.getItem("lcRfqSent")])).toEqual([null, null]);
});

test("draft: a reply channel zh does not offer waits there and comes back; a restored long description shows its counter", async ({
  page,
}) => {
  await openForm(page, "/en/contact/");
  await page.locator("#rfq-reply-whatsapp").check();
  await toStep2(page, stampOf("carry"));
  await page.locator("#rfq-message").fill("x".repeat(1900));
  await expect.poll(async () => (await storedDraft(page)).message?.length).toBe(1900);
  expect((await storedDraft(page)).reply).toBe("whatsapp");
  await openForm(page, "/zh/contact/");
  await expect(page.locator("input[name=reply]:checked")).toHaveValue("email"); // WhatsApp is not offered: zh's own default
  await page.locator("#rfq-company").fill("QA zh");
  await expect.poll(async () => (await storedDraft(page)).company).toBe("QA zh");
  expect((await storedDraft(page)).reply, "the visitor's channel is kept for the next page").toBe("whatsapp");
  await openForm(page, "/en/contact/");
  await expect(page.locator("input[name=reply]:checked")).toHaveValue("whatsapp");
  await page.locator("[data-next]").click(); // step 1 is complete from the draft
  await expect(page.locator('[data-step="2"]')).toHaveAttribute("data-active", "");
  await expect(page.locator("[data-count]")).toBeVisible(); // before any typing (it used to wait for an input event)
  await expect(page.locator("[data-count]")).toHaveText("1900 / 2000");
});

test.describe("back from the thanks page", () => {
  test("restored from the back/forward cache: a fresh form, never the 'sent' overlay over an inert form", async ({ page }) => {
    await page.route("**/api/rfq", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, ref: "LC-7K3F9" }) }));
    // a 204 answer cancels the navigation: the form page stays, as the back/forward cache keeps it
    const leaving = page.waitForRequest(/\/contact\/thanks\//);
    await page.route(/\/contact\/thanks\//, (r) => r.fulfill({ status: 204 }));
    await openForm(page, "/en/contact/?service=control-panels");
    await page.locator("#rfq-name").fill("QA Back");
    await page.locator("#rfq-company").fill("QA");
    await page.locator("#rfq-phone").fill("+20 100 000 0000");
    await page.locator("#rfq-consent").check();
    await turnstileToken(page);
    await page.locator('[data-actions="1"] [data-submit]').click();
    await expect(page.locator("[data-success]")).toBeVisible();
    await leaving;
    await expect(page.locator("[data-rfq-body]")).toHaveJSProperty("inert", true);
    const reloaded = page.waitForEvent("load");
    // what the browser fires when it shows the page again from the back/forward cache
    await page.evaluate(() => dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    await reloaded;
    await expect(page.locator("form[data-rfq][data-enhanced]")).toHaveCount(1);
    await expect(page.locator("[data-success]")).toBeHidden();
    await expect(page.locator("[data-rfq-body]")).toHaveJSProperty("inert", false);
    await expect(page.locator("form[data-rfq]")).not.toHaveAttribute("data-sending", "");
    await expect(page.locator("#rfq-name")).toHaveValue(""); // the request is gone: nothing to send twice
    await expect(page.locator("#rfq-service")).toHaveValue("control-panels"); // the page's own preselection is back
    await page.locator("#rfq-name").fill("QA Again"); // interactive
    await expect(page.locator("#rfq-name")).toHaveValue("QA Again");
  });
});

test("thanks page: the request number survives a language switch (switcher keeps ?ref=, else the tab's last one)", async ({ page }) => {
  const ar = copy("ar");
  await page.goto("/en/contact/thanks/?ref=LC-7K3F9&skipped=1&name=Ahmed");
  await expect(page.locator("[data-ref]")).toHaveText("LC-7K3F9");
  // the language links carry the context (?ref=, ?skipped=), never anything else
  const arLink = page.locator("a[data-set-lang=ar]").first();
  await expect(arLink).toHaveAttribute("href", "/ar/contact/thanks/?ref=LC-7K3F9&skipped=1");
  await page.goto("/ar/contact/thanks/"); // no ?ref= at all (an older page, a bookmark…)
  await expect(page.locator("[data-ref]")).toHaveText("LC-7K3F9");
  // the hand-over links are the server's templates with the number filled in
  const wa = page.locator("a[data-ref-href^='https://wa.me/'][data-handoff-href]").first();
  expect(decodeURIComponent((await wa.getAttribute("href")) ?? "")).toBe(`https://wa.me/201103197233?text=${ar.thanks.ref.whatsapp.replace("{ref}", "LC-7K3F9")}`);
  const mail = page.locator("a[data-ref-href^='mailto:']").first();
  expect(decodeURIComponent((await mail.getAttribute("href")) ?? "")).toBe(
    `mailto:info@logic-controls.com?subject=${ar.thanks.ref.emailSubject.replace("{ref}", "LC-7K3F9")}`,
  );
  await page.goto("/en/contact/thanks/?ref=bogus"); // a broken number falls back too, never shows the bogus one
  await expect(page.locator("[data-ref]")).toHaveText("LC-7K3F9");
});

test("zh: email only (no phone) is enough", { tag: "@desktop-only" }, async ({ page }) => {
  test.slow();
  await openForm(page, "/zh/contact/");
  const stamp = stampOf("zh-email");
  await page.locator("#rfq-name").fill(`QA ${stamp}`);
  await page.locator("#rfq-company").fill("QA");
  await page.locator("#rfq-email").fill("qa@example.com");
  await page.locator("#rfq-service").selectOption("control-panels");
  await page.locator("#rfq-consent").check();
  await turnstileToken(page);
  await page.locator('[data-actions="1"] [data-submit]').click();
  await page.waitForURL(thanksUrl("zh"), { timeout: 20_000 });
  const mail = await findEmail(stamp);
  expect(mail.text).not.toContain("Phone / WhatsApp");
  expect(mail.text).toContain("Email: qa@example.com");
});

test.describe("security check blocked", () => {
  test.use({ allowConsole: [/challenges\.cloudflare\.com|ERR_FAILED|net::/] });

  test("Turnstile is loaded only on interaction; when it cannot load, the request is handed over pre-filled", async ({ page }) => {
    const ts: string[] = [];
    page.on("request", (r) => /challenges\.cloudflare\.com/.test(r.url()) && ts.push(r.url()));
    await page.route(/challenges\.cloudflare\.com/, (r) => r.abort());
    await openForm(page, "/en/contact/"); // form[data-enhanced]: the form script has run
    await page.waitForLoadState("load");
    expect(ts, "no Turnstile traffic before the visitor touches the form").toEqual([]);
    const apiJs = () => ts.filter((u) => u.includes("/turnstile/v0/api.js")).length;
    await page.locator("#rfq-name").focus(); // the first interaction loads it
    await expect.poll(apiJs, { message: "api.js requested on the first interaction" }).toBe(1);
    await page.locator("#rfq-name").fill("Blocked Visitor");
    await page.locator("#rfq-company").fill("Proxy Corp");
    await page.locator("#rfq-phone").fill("+20 100 000 0000");
    await page.locator("#rfq-service").selectOption("plc-hmi-programming");
    await page.locator("#rfq-reply-whatsapp").check();
    await page.locator("#rfq-consent").check();
    await page.locator('[data-actions="1"] [data-submit]').click();
    await expect(page.locator("[data-alert-text]")).toHaveText(EN.errors.verificationBlocked!, { timeout: 15_000 });
    const wa = decodeURIComponent((await page.locator("[data-alert-fallback] a[data-fallback=whatsapp]").getAttribute("href")) ?? "");
    expect(wa).toContain("Blocked Visitor");
    expect(wa).toContain(EN.form.fields.need.options["plc-hmi-programming"]!);
    // UX2-19: the chosen chip's label, not the field name ("…?: reply")
    expect(wa).toContain(
      `${EN.form.fields.contactPreference.label.replace(/\?$/, "")}: ${EN.form.fields.contactPreference.options.whatsapp}`,
    );
    expect(wa).not.toContain(": reply");
    await expect(page.locator("[data-retry]")).toBeVisible();
    expect(apiJs(), "requested once: sending does not inject it again").toBe(1);
  });
});
