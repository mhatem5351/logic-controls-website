// Unit tests (Vitest): src/lib, src/data, scripts/check-i18n.mjs and the Worker (worker/index.ts, called in Node with a
// mocked env — see tests/unit/worker.test.ts for why not @cloudflare/vitest-pool-workers).
// E2E tests are Playwright (playwright.config.ts) and live in tests/e2e/.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "~": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    // check-i18n tests spawn `node` on fixture trees; keep them comfortably inside the default timeout.
    testTimeout: 15_000,
  },
});
