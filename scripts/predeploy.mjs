// Gate for `npm run deploy` (CODE2-12, CODE3-08), which runs it twice around the build:
//
//   node scripts/predeploy.mjs           before the build, a few seconds:
//     1. refuses a working tree with uncommitted changes (what is deployed must be what is committed);
//     2. warns (never refuses: a hotfix may have to ship first) when HEAD is not on origin/main, so CI has not tested
//        this commit, and, when the GitHub CLI is set up, when CI's run on HEAD is not green;
//     3. refuses when node_modules does not match package-lock.json (after a `git pull` that changed dependencies
//        without `npm ci`, the build would use the old ones);
//     4. refuses on stale page dates (scripts/content-dates.mjs --check: the sitemap <lastmod> / Article dateModified
//        of edited pages would be the build time instead of the edit), a broken copy contract (scripts/check-i18n.mjs)
//        or a red unit test (vitest).
//   node scripts/predeploy.mjs --built   after the build, on the very dist/ that wrangler uploads:
//     5. the content-honesty test on the built pages (tests/unit/honesty.test.ts; it skips itself without dist/, so a
//        skipped test refuses here), the dist crawl (tests/static/check-dist.mjs) and the budgets (check-budgets.mjs);
//     6. a phone smoke: `npm run test:e2e:phone`, the @phone E2E tests on Pixel 7 (~1 min: the menu drawer and the other
//        phone-only behaviour that CI's desktop run skips). Needs the E2E setup: .dev.vars (README → "Local
//        development") and `npx playwright install chromium`.
// The slow suites (astro check, E2E in three browsers) stay with CI and the release checklist (README).
// Overrides, each for one run and not recommended: ALLOW_DIRTY_DEPLOY=1, ALLOW_STALE_DEPS=1, SKIP_PHONE_SMOKE=1.
import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const refuse = (/** @type {string} */ why, /** @type {string} */ override = "") => {
  console.error(`\nRefusing to deploy: ${why}`);
  if (override) console.error(`Override (not recommended): ${override}=1 npm run deploy`);
  process.exit(1);
};
const warn = (/** @type {string} */ msg) => console.warn(`predeploy: WARNING: ${msg}`);
const step = (/** @type {string} */ label, /** @type {() => void} */ fn) => {
  try {
    fn();
  } catch {
    refuse(label);
  }
};
const node = (/** @type {string[]} */ ...args) => execFileSync(process.execPath, args, { stdio: "inherit" });
// For git / gh: a missing credential fails at once (no password prompt nobody answers), and the deploy shell's .env
// (README → Deploy) GITHUB_TOKEN_PERSONAL lets `gh`, and git through gh's credential helper, read the private repo.
const env = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
if (!env.GH_TOKEN && env.GITHUB_TOKEN_PERSONAL) env.GH_TOKEN = env.GITHUB_TOKEN_PERSONAL;
/** Quiet command output, or undefined when it fails or takes too long (network, a missing CLI). */
const quiet = (/** @type {string} */ cmd, /** @type {string[]} */ args, timeout = 15_000) => {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", timeout, stdio: ["ignore", "pipe", "ignore"], env }).trim();
  } catch {
    return undefined;
  }
};

/** Installed packages (node_modules/.package-lock.json, written by npm) against package-lock.json: problems found. */
export function lockDrift(/** @type {any} */ lock, /** @type {any} */ installed) {
  const want = lock?.packages ?? {};
  const have = installed?.packages ?? {};
  const out = [];
  for (const [path, entry] of Object.entries(want)) {
    if (!path || !path.startsWith("node_modules/")) continue;
    const got = have[path];
    // Optional packages for other platforms (e.g. @esbuild/linux-x64) are never installed here.
    if (!got) {
      if (!entry.optional && !entry.peer) out.push(`${path.slice(13)} ${entry.version} is not installed`);
    } else if (got.version !== entry.version) out.push(`${path.slice(13)} is ${got.version}, package-lock.json wants ${entry.version}`);
  }
  for (const path of Object.keys(have))
    if (path.startsWith("node_modules/") && !want[path]) out.push(`${path.slice(13)} is installed but no longer in package-lock.json`);
  return out;
}

function beforeBuild() {
  const dirty = execSync("git status --porcelain", { encoding: "utf8" }).trim();
  if (dirty && !process.env.ALLOW_DIRTY_DEPLOY) {
    console.error(dirty);
    refuse("commit your changes first (what is deployed must be what is committed).", "ALLOW_DIRTY_DEPLOY");
  }
  if (dirty) warn("deploying uncommitted changes (ALLOW_DIRTY_DEPLOY).");
  else console.log("predeploy: working tree clean");

  // Tested by CI? Warnings only. `git fetch` refreshes origin/main first (15 s cap: offline must not block a deploy);
  // without it, origin/main is as last fetched or pushed from this clone, which a push from here keeps current.
  const head = quiet("git", ["rev-parse", "--short", "HEAD"]);
  const fetched = quiet("git", ["fetch", "--quiet", "origin", "main"]) !== undefined;
  const asOf = fetched ? "" : " (as last fetched or pushed from here: fetching origin failed)";
  if (quiet("git", ["merge-base", "--is-ancestor", "HEAD", "origin/main"]) === undefined)
    warn(`HEAD ${head} is not on origin/main${asOf}: CI has not run on this commit. Push it and wait for CI if you can.`);
  else console.log(`predeploy: HEAD ${head} is on origin/main${asOf}`);
  const sha = quiet("git", ["rev-parse", "HEAD"]);
  const runs = sha && quiet("gh", ["run", "list", "--commit", sha, "--limit", "5", "--json", "workflowName,status,conclusion,url"], 10_000);
  if (runs) {
    /** @type {Array<{ workflowName: string, status: string, conclusion: string, url: string }>} */
    const list = JSON.parse(runs);
    const ci = list.find((r) => r.workflowName === "CI");
    if (!ci) warn("no CI run for HEAD yet (docs-only commits do not run CI).");
    else if (ci.status !== "completed") warn(`CI on HEAD is still ${ci.status}: ${ci.url}`);
    else if (ci.conclusion !== "success") warn(`CI on HEAD ended "${ci.conclusion}": ${ci.url}`);
    else console.log("predeploy: CI on HEAD is green");
  }

  if (!existsSync("node_modules/.package-lock.json"))
    warn("node_modules/.package-lock.json is missing: cannot tell whether node_modules matches package-lock.json (run npm ci).");
  else {
    const drift = lockDrift(
      JSON.parse(readFileSync("package-lock.json", "utf8")),
      JSON.parse(readFileSync("node_modules/.package-lock.json", "utf8")),
    );
    if (drift.length && !process.env.ALLOW_STALE_DEPS) {
      console.error(drift.slice(0, 10).join("\n") + (drift.length > 10 ? `\n… and ${drift.length - 10} more` : ""));
      refuse("node_modules does not match package-lock.json: run `npm ci`.", "ALLOW_STALE_DEPS");
    }
    console.log("predeploy: node_modules matches package-lock.json");
  }

  step('page dates are stale — run "node scripts/content-dates.mjs --write" and commit src/data/content-dates.json', () =>
    node("scripts/content-dates.mjs", "--check"),
  );
  step("the i18n check failed (scripts/check-i18n.mjs)", () => node("scripts/check-i18n.mjs"));
  step("unit tests failed (npm run test:unit)", () => execSync("npx vitest run", { stdio: "inherit" }));
  console.log("predeploy: content dates current, i18n and unit tests green");
}

function afterBuild() {
  if (!existsSync("dist/sitemap-0.xml")) refuse("dist/ is missing: `npm run deploy` builds before this step.");
  // The honesty guard reads the built pages and skips itself without them: here a skip is a failure.
  const dir = mkdtempSync(join(tmpdir(), "lc-predeploy-"));
  try {
    const report = join(dir, "honesty.json");
    step("the content-honesty test failed on the built site (tests/unit/honesty.test.ts)", () =>
      execSync(`npx vitest run tests/unit/honesty.test.ts --reporter=default --reporter=json --outputFile.json=${JSON.stringify(report)}`, {
        stdio: "inherit",
      }),
    );
    const r = JSON.parse(readFileSync(report, "utf8"));
    if (!r.numPassedTests || r.numPendingTests || r.numTodoTests || r.numFailedTests)
      refuse(`the content-honesty test did not run on dist/ (${r.numPassedTests} passed, ${r.numPendingTests} skipped).`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  step("the dist crawl failed (tests/static/check-dist.mjs)", () => node("tests/static/check-dist.mjs"));
  step("a performance budget failed (tests/static/check-budgets.mjs)", () => node("tests/static/check-budgets.mjs"));
  console.log("predeploy: honesty, dist crawl and budgets green on the build being deployed");

  if (process.env.SKIP_PHONE_SMOKE) warn("phone smoke skipped (SKIP_PHONE_SMOKE).");
  else {
    step("the phone smoke failed (npm run test:e2e:phone; report: npx playwright show-report)", () =>
      execSync("npm run test:e2e:phone", { stdio: "inherit" }),
    );
    console.log("predeploy: phone smoke green");
  }
}

// Only as the entry point (tests/unit/predeploy.test.ts imports lockDrift).
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  if (process.argv.includes("--built")) afterBuild();
  else beforeBuild();
}
