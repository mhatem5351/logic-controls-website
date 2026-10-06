/**
 * Shared Playwright fixtures for the E2E suite.
 *
 * - The server is `wrangler dev --local-protocol https` (playwright.config.ts), so the production CSP
 *   (`upgrade-insecure-requests`) and cookies behave as on https://logic-controls.com without rewriting responses.
 * - The production Turnstile site key only works on logic-controls.com: an init script swaps it for Cloudflare's
 *   always-pass TEST site key before the widget renders (it pairs with the test secret in .dev.vars). No network
 *   interception, so cross-document view transitions and redirects behave exactly as in production.
 * - Console errors and uncaught page errors fail the test, except third-party Turnstile noise
 *   (challenges.cloudflare.com) and messages a test allows with `test.use({ allowConsole: [/…/] })`.
 */
import { test as base, expect, type ConsoleMessage } from "@playwright/test";

export const PROD_SITEKEY = "0x4AAAAAAFPM3y4LCAOP7pVT";
/** Cloudflare's always-pass (visible) Turnstile test site key. */
export const TEST_SITEKEY = "1x00000000000000000000AA";
const THIRD_PARTY = /challenges\.cloudflare\.com|turnstile|cloudflareinsights/i;

/** Runs in every page before its scripts: rewrites the widget's site key as soon as the parser inserts it. */
function useTestSitekey({ prod, test }: { prod: string; test: string }) {
  const patch = (root: ParentNode) =>
    root.querySelectorAll?.(`.cf-turnstile[data-sitekey="${prod}"]`).forEach((el) => el.setAttribute("data-sitekey", test));
  const mo = new MutationObserver(() => patch(document));
  mo.observe(document, { childList: true, subtree: true });
  addEventListener("DOMContentLoaded", () => (patch(document), mo.disconnect()));
}

interface Fixtures {
  /** Extra console messages (regexps) a test expects, e.g. the 404 resource error. */
  allowConsole: RegExp[];
  /** Collected console errors / page errors of the test's page (third-party noise filtered). */
  consoleErrors: string[];
}

export const test = base.extend<Fixtures>({
  allowConsole: [[], { option: true }],
  context: async ({ context }, use) => {
    await context.addInitScript(useTestSitekey, { prod: PROD_SITEKEY, test: TEST_SITEKEY });
    await use(context);
  },
  consoleErrors: [
    async ({ page, allowConsole }, use, testInfo) => {
      const errors: string[] = [];
      const onConsole = (m: ConsoleMessage) => {
        if (m.type() !== "error") return;
        const where = m.location()?.url ?? "";
        const text = m.text();
        if (THIRD_PARTY.test(where) || THIRD_PARTY.test(text) || allowConsole.some((re) => re.test(text))) return;
        errors.push(`${text}${where ? ` @ ${where}` : ""}`);
      };
      page.on("console", onConsole);
      page.on("pageerror", (e) => {
        if (!THIRD_PARTY.test(e.stack ?? "") && !allowConsole.some((re) => re.test(e.message))) errors.push(`pageerror: ${e.message}`);
      });
      await use(errors);
      if (testInfo.status === testInfo.expectedStatus) expect(errors, "console errors / uncaught page errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
