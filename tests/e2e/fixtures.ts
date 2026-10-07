/**
 * Shared Playwright fixtures for the E2E suite.
 *
 * - The server is `wrangler dev --local-protocol https` (playwright.config.ts), so the production headers (CSP, HSTS)
 *   and Secure cookies behave as on https://logic-controls.com without rewriting responses.
 * - The production Turnstile site key only works on logic-controls.com: an init script swaps it for Cloudflare's
 *   always-pass TEST site key before the widget renders (it pairs with the test secret in .dev.vars). No network
 *   interception, so cross-document view transitions and redirects behave exactly as in production.
 * - Console errors and uncaught page errors fail the test. Ignored, precisely:
 *     - messages EMITTED BY third-party code (the console message's source URL / the error's stack is on
 *       challenges.cloudflare.com or static.cloudflareinsights.com, incl. their blob: URLs — Turnstile's iframe logs
 *       its own 401s / warnings, and WebKit reports "WebKitBlobResource error" when the widget is reset);
 *     - WebKit's own media-control icon noise ("Button failed to load, iconName = …"), logged by the browser when a
 *       page with a <video controls> is left quickly (not page code);
 *     - messages a test allows with `test.use({ allowConsole: [/…/] })`.
 *   A Content-Security-Policy violation is NEVER ignored (CODE2-01): Chromium's CSP message quotes the policy, which
 *   names challenges.cloudflare.com, so matching third parties by message text used to hide every CSP regression.
 */
import { test as base, expect, type ConsoleMessage } from "@playwright/test";

export const PROD_SITEKEY = "0x4AAAAAAFPM3y4LCAOP7pVT";
/** Cloudflare's always-pass (visible) Turnstile test site key. */
export const TEST_SITEKEY = "1x00000000000000000000AA";
/** Third-party script origins whose own console output is not ours to fix (matched against source URLs only). */
const THIRD_PARTY_SOURCE = /^(?:blob:)?https:\/\/(?:challenges\.cloudflare\.com|static\.cloudflareinsights\.com)\//;
/** A stack frame in third-party code (uncaught errors thrown inside Turnstile's script). */
const THIRD_PARTY_FRAME = /https:\/\/(?:challenges\.cloudflare\.com|static\.cloudflareinsights\.com)\//;
/** Browser-internal noise, per engine: exact message shapes, never page code. */
const BROWSER_NOISE: Record<string, RegExp[]> = {
  // WebKit's own <video> control icons ("pip-placard", "airplay-placard"…) when a page with a video is left quickly
  webkit: [/^Button failed to load, iconName = [\w.-]+-placard(?:, layoutTraits = \[[^\]]*\])?(?:, src = blob:https:\/\/[^\s,]+)?$/],
};
const CSP = /Content[- ]Security[- ]Policy/i;

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
      const noise = BROWSER_NOISE[page.context().browser()?.browserType().name() ?? ""] ?? [];
      const onConsole = (m: ConsoleMessage) => {
        if (m.type() !== "error") return;
        const where = m.location()?.url ?? "";
        const text = m.text();
        const csp = CSP.test(text);
        // CSP violations of OUR pages are reported at the page's URL, so a third-party source can only be a message
        // from inside Turnstile's own frame (its own policy). Everything else is filtered by source, never by text.
        if (THIRD_PARTY_SOURCE.test(where)) return;
        if (!csp && (noise.some((re) => re.test(text)) || allowConsole.some((re) => re.test(text)))) return;
        errors.push(`${text}${where ? ` @ ${where}` : ""}`);
      };
      page.on("console", onConsole);
      page.on("pageerror", (e) => {
        const firstFrame = (e.stack ?? "").split("\n").find((l) => /:\d+:\d+\)?$/.test(l.trim())) ?? "";
        if (THIRD_PARTY_FRAME.test(firstFrame) || (!CSP.test(e.message) && allowConsole.some((re) => re.test(e.message)))) return;
        errors.push(`pageerror: ${e.message}`);
      });
      await use(errors);
      if (testInfo.status === testInfo.expectedStatus) expect(errors, "console errors / uncaught page errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
