// End-to-end tests (Playwright Test) against the production build served by the real Worker runtime:
// `wrangler dev` serves dist/ + worker/index.ts exactly as Cloudflare does (redirects, _headers, 404 page, /api/rfq,
// send_email written to .wrangler/tmp/email). Port 8788 so it never collides with a `npm run preview` on 8787.
// Served over https (wrangler's self-signed local certificate) so the production CSP's `upgrade-insecure-requests`
// and Secure cookies behave as on the live site in every browser (WebKit upgrades http://127.0.0.1 subresources).
//
// Needs: `npm run build` first, and a .dev.vars with Cloudflare's always-pass Turnstile TEST secret
// (TURNSTILE_SECRET=1x0000000000000000000000000000000AA) — see tests/e2e/global-setup.ts.
//
//   npm run test:e2e                         all projects (chromium desktop + mobile, webkit mobile)
//   npm run test:e2e -- --project=chromium-desktop tests/e2e/rfq.spec.ts
//   npm run test:visual                      screenshot comparisons (@visual, local only)
//
// Tags: @visual (excluded unless VISUAL=1), @desktop-only (skipped by the two mobile projects: the full sitemap
// crawl and checks that are viewport-independent run once).
import { defineConfig, devices } from "@playwright/test";

const PORT = 8788;
const CI = !!process.env.CI;
const VISUAL = !!process.env.VISUAL;
const invert = (...tags: string[]) => new RegExp(tags.join("|"));
const base = VISUAL ? [] : ["@visual"];

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  outputDir: "test-results",
  snapshotPathTemplate: "tests/e2e/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 7_000, toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled", caret: "hide" } },
  reporter: CI ? [["github"], ["list"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `https://127.0.0.1:${PORT}`,
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Fresh state per test; the site keeps only the `lang` cookie and a few sessionStorage flags.
    serviceWorkers: "block",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      grepInvert: base.length ? invert(...base) : undefined,
    },
    {
      name: "chromium-mobile",
      use: { ...devices["Pixel 7"] },
      grepInvert: invert(...base, "@desktop-only"),
    },
    {
      name: "webkit-mobile",
      use: { ...devices["iPhone 15"] },
      grepInvert: invert(...base, "@desktop-only"),
    },
  ],
  webServer: {
    // --inspector-port: the default 9229 may belong to another `wrangler dev` (npm run preview) on this machine.
    command: `npx wrangler dev --port ${PORT} --ip 127.0.0.1 --local-protocol https --inspector-port 9239 --show-interactive-dev-session=false --log-level warn`,
    url: `https://127.0.0.1:${PORT}/en/`,
    ignoreHTTPSErrors: true,
    reuseExistingServer: false,
    timeout: 90_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
