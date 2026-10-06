/**
 * Fail fast (before wrangler starts) when the prerequisites of the E2E run are missing.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = (p: string) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
/** Cloudflare's public always-pass Turnstile secret (https://developers.cloudflare.com/turnstile/troubleshooting/testing/). */
export const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";

export default function globalSetup() {
  if (!existsSync(root("dist/sitemap-0.xml"))) {
    throw new Error("dist/ is missing: run `npm run build` before `npm run test:e2e`.");
  }
  const devVars = root(".dev.vars");
  const vars = existsSync(devVars) ? readFileSync(devVars, "utf8") : "";
  if (!/^TURNSTILE_SECRET=1x0000000000000000000000000000000AA\s*$/m.test(vars)) {
    throw new Error(
      ".dev.vars must set Cloudflare's always-pass Turnstile TEST secret for the form tests:\n" +
        `  TURNSTILE_SECRET=${TURNSTILE_TEST_SECRET}\n` +
        "  ALLOWED_HOSTNAMES=logic-controls.com,www.logic-controls.com,example.com,localhost,127.0.0.1\n" +
        "(never the production secret: it would reject the test site key's tokens).",
    );
  }
  if (!/^ALLOWED_HOSTNAMES=.*\bexample\.com\b/m.test(vars)) {
    throw new Error(".dev.vars must allow the hostname Turnstile test tokens carry: ALLOWED_HOSTNAMES=…,example.com,localhost,127.0.0.1");
  }
}
