/**
 * Quote request form (RfqForm.astro → POST /api/rfq → send_email) end to end on the Workers runtime:
 * localized validation, two-step flow, Turnstile (Cloudflare test keys), the email the binding writes to
 * .wrangler/tmp/email (HTML-escaped, English labels, attachments), ?service= / ?industry= / ?location= preselection,
 * error panel and hand-over links, the request number on the thanks page, and the no-JS round trip.
 * Every test that sends uses a unique stamp to find its own email.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { LOCALES, ROOT, emailFiles, findEmail, type Locale } from "./helpers";

type Contact = {
  validation: Record<string, string>;
  errors: Record<string, string>;
  form: { steps: { counter: string }; fields: { need: { options: Record<string, string> }; industry: { options: Record<string, string> } } };
};
const copy = (l: Locale): Contact => JSON.parse(readFileSync(join(ROOT, "src/i18n/messages", l, "contact.json"), "utf8"));
/** The owner's email uses the English labels of the select values. */
const EN = copy("en");
const ZONES_EN = (JSON.parse(readFileSync(join(ROOT, "src/i18n/messages/en/common.json"), "utf8")) as { zones: { items: Record<string, { name: string }> } }).zones.items;
const thanksUrl = (l: string) => new RegExp(`/${l}/contact/thanks/\\?ref=LC-[0-9A-Z]{5}$`);
const stampOf = (l: string) => `QA-${l}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

async function openForm(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator("form[data-rfq][data-enhanced]")).toHaveCount(1);
}
async function turnstileToken(page: Page) {
  await expect
    .poll(() => page.locator("input[name='cf-turnstile-response']").first().inputValue().catch(() => ""), {
      message: "Turnstile (test site key) issues a token",
      timeout: 25_000,
    })
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
    await expect(page.locator("h1")).toBeVisible();
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
  expect(mail.text).toContain(`Project details: ${EN.form.fields.need.options["control-panels"]} · ${EN.form.fields.industry.options.pharmaceutical}`);
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
    await page.route("**/api/rfq", (r) => r.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ ok: false, error: "send" }) }));
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

  test("the form's own POST contract (what a browser without JS sends) with a Turnstile token → 303 thanks + escaped email", { tag: "@desktop-only" }, async ({ page }) => {
    await page.goto("/ar/contact/");
    // the field names come from the rendered no-JS form, so a renamed field breaks this test, not the inbox
    const names = await page.locator("form[data-rfq] [name]").evaluateAll((els) => els.map((e) => e.getAttribute("name")));
    for (const n of ["name", "company", "phone", "email", "service", "industry", "location", "timeline", "country", "message", "locale", "page", "company_website", "consent"]) {
      expect(names, n).toContain(n);
    }
    const stamp = stampOf("nojs");
    const res = await page.request.post("/api/rfq", {
      headers: { Accept: "text/html" },
      form: {
        locale: "ar",
        page: "/ar/contact/",
        company_website: "",
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
  });

  test("honeypot: a filled hidden field gets the thanks page and no email is sent", { tag: "@desktop-only" }, async ({ page }) => {
    const stamp = stampOf("hp");
    await page.goto("/tr/contact/");
    await page.locator("#rfq-company-website").fill("https://spam.example", { force: true });
    await page.locator("#rfq-name").fill(`Bot ${stamp}`);
    await page.locator("#rfq-company").fill("Bot");
    await page.locator("#rfq-phone").fill("+20 100 000 0000");
    await page.locator("#rfq-service").selectOption({ index: 1 });
    await page.locator("#rfq-message").fill("spam");
    await page.locator("#rfq-consent").check();
    await page.locator('[data-actions="2"] [type=submit]').click();
    await page.waitForURL(thanksUrl("tr"));
    await page.waitForTimeout(1500);
    const sent = emailFiles("text").some((f) => readFileSync(f, "utf8").includes(stamp));
    expect(sent).toBe(false);
  });
});

test("attachments: chosen files are listed, limits are explained, and they reach the owner's email", async ({ page }) => {
  test.slow();
  await openForm(page, "/en/contact/");
  const stamp = stampOf("files");
  await page.locator("#rfq-name").fill(`QA ${stamp}`);
  await page.locator("#rfq-company").fill("QA");
  await page.locator("#rfq-phone").fill("010 0000 0000"); // Egyptian local format → wa.me/20…
  await page.locator("#rfq-service").selectOption("control-panels");
  await page.locator("#rfq-phone").press("Enter"); // Enter continues to step 2 (it must not send)
  await expect(page.locator('[data-step="2"]')).toHaveAttribute("data-active", "");
  const pdf = (name: string) => ({ name, mimeType: "application/pdf", buffer: Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(2048)]) });
  await page.locator("#rfq-files").setInputFiles([pdf("1.pdf"), pdf("2.pdf"), pdf("3.pdf"), pdf("4.pdf")]);
  await expect(page.locator("#rfq-files-error")).toHaveText(EN.validation.filesCount!.replace("{max}", "3"));
  await page.locator(".lc-file-remove").first().click();
  await expect(page.locator("[data-files-list] li")).toHaveCount(3);
  await expect(page.locator("#rfq-files-error")).toBeHidden();
  await page.locator("#rfq-consent").check();
  await turnstileToken(page);
  await page.locator('[data-actions="2"] [data-submit]').click();
  await page.waitForURL(thanksUrl("en"), { timeout: 20_000 });
  const mail = await findEmail(stamp);
  expect(mail.text).toContain("Attachments: 2.pdf (2 KB), 3.pdf (2 KB), 4.pdf (2 KB)");
  expect(mail.html).toContain('<a href="https://wa.me/201000000000">Reply on WhatsApp</a>');
});

test("urgent: troubleshooting (or 'a machine is stopped') shows the call-now panel", async ({ page }) => {
  await openForm(page, "/en/contact/?service=maintenance-support");
  await expect(page.locator("[data-urgent]")).toBeVisible();
  await expect(page.locator("[data-urgent] a[href='tel:+201103197233']")).toHaveCount(1);
  await page.locator("#rfq-service").selectOption("control-panels");
  await expect(page.locator("[data-urgent]")).toBeHidden();
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
    await openForm(page, "/en/contact/");
    await page.waitForTimeout(1000);
    expect(ts, "no Turnstile traffic before the visitor touches the form").toEqual([]);
    await page.locator("#rfq-name").fill("Blocked Visitor");
    await page.locator("#rfq-company").fill("Proxy Corp");
    await page.locator("#rfq-phone").fill("+20 100 000 0000");
    await page.locator("#rfq-service").selectOption("plc-hmi-programming");
    await page.locator("#rfq-consent").check();
    await page.locator('[data-actions="1"] [data-submit]').click();
    await expect(page.locator("[data-alert-text]")).toHaveText(EN.errors.verificationBlocked!, { timeout: 15_000 });
    const wa = decodeURIComponent((await page.locator("[data-alert-fallback] a[data-fallback=whatsapp]").getAttribute("href")) ?? "");
    expect(wa).toContain("Blocked Visitor");
    expect(wa).toContain(EN.form.fields.need.options["plc-hmi-programming"]!);
    await expect(page.locator("[data-retry]")).toBeVisible();
  });
});
