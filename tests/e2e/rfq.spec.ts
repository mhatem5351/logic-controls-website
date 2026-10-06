/**
 * Quote request form (RfqForm.astro → POST /api/rfq → send_email) end to end on the Workers runtime:
 * localized validation, two-step flow, Turnstile (Cloudflare test keys), the email the binding writes to
 * .wrangler/tmp/email (HTML-escaped), ?service= / ?industry= / ?location= preselection, error panel, and the
 * no-JS round trip. Every test that sends uses a unique stamp to find its own email.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { LOCALES, ROOT, emailFiles, findEmail, type Locale } from "./helpers";

type Contact = {
  validation: Record<string, string>;
  errors: Record<string, string>;
  form: { steps: { counter: string }; fields: { need: { options: Record<string, string> } } };
};
const copy = (l: Locale): Contact => JSON.parse(readFileSync(join(ROOT, "src/i18n/messages", l, "contact.json"), "utf8"));
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
    const zh = locale === "zh"; // zh: email is required in step 1 (WhatsApp is blocked in mainland China)

    // 1. empty step 1 → summary alert, inline errors, focus on the first invalid field
    await page.locator("[data-next]").click();
    await expect(page.locator("[data-alert]")).toBeVisible();
    await expect(page.locator("[data-alert-title]")).toHaveText(t.validation.summary!);
    await expect(page.locator("#rfq-name")).toBeFocused();
    await expect(page.locator("#rfq-name")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#rfq-name-error")).toHaveText(t.validation.name!);
    await expect(page.locator("#rfq-phone-error")).toHaveText(t.validation.required!);
    await expect(page.locator("#rfq-service-error")).toHaveText(t.validation.select!);
    if (zh) await expect(page.locator("#rfq-email-error")).toHaveText(t.validation.required!);

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

    // 4. step 2: active panel, focus on its legend, live step counter, alert gone
    await expect(page.locator('[data-step="2"]')).toHaveAttribute("data-active", "");
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
    await page.waitForURL(`**/${locale}/contact/thanks/`, { timeout: 20_000 });
    await expect(page.locator("h1")).toBeVisible();

    // 5. the email the Worker sent (wrangler dev writes it to .wrangler/tmp/email)
    const mail = await findEmail(stamp);
    expect(mail.text).toContain(`Name: ${hostile}`);
    expect(mail.text).toContain("Phone / WhatsApp: +20 100 000 0000"); // Arabic-Indic digits converted client-side
    expect(mail.text).toContain("Service: process-control");
    expect(mail.text).toContain("Factory location: obour");
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
  await page.waitForURL("**/en/contact/thanks/", { timeout: 20_000 });
  const mail = await findEmail(stamp);
  const t = copy("en");
  expect(mail.text).toContain(`Project details: ${t.form.fields.need.options["control-panels"]} · `);
  expect(mail.text).toContain("Industry: pharmaceutical");
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

  test("one long form; a POST without Turnstile comes back to the form with ?error=verification", async ({ page }) => {
    await page.goto("/en/contact/");
    await expect(page.locator('[data-step="2"]')).toBeVisible();
    await expect(page.locator("#rfq-message")).toHaveAttribute("required", "");
    await expect(page.locator('[data-actions="1"]')).toBeHidden();
    await page.locator("#rfq-name").fill("QA NoJS");
    await page.locator("#rfq-company").fill("QA");
    await page.locator("#rfq-phone").fill("+20 100 000 0000");
    await page.locator("#rfq-service").selectOption({ index: 1 });
    await page.locator("#rfq-message").fill("No-JS QA submission. Please ignore.");
    await page.locator("#rfq-consent").check();
    await page.locator('[data-actions="2"] [type=submit]').click();
    await page.waitForURL("**/en/contact/?error=verification#quote");
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
    expect(res.headers()["location"]).toBe("/ar/contact/thanks/");
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
    await page.waitForURL("**/tr/contact/thanks/");
    await page.waitForTimeout(1500);
    const sent = emailFiles("text").some((f) => readFileSync(f, "utf8").includes(stamp));
    expect(sent).toBe(false);
  });
});
