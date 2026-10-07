// Gate for `npm run deploy` (CODE2-12): fast checks that must pass before a build is uploaded. The slow suites
// (astro check, the full E2E run in three browsers) are the release checklist's job (README → "Release checklist")
// and CI's; this only stops the obvious mistakes, in a few seconds:
//   1. a working tree with uncommitted changes (what is deployed must be what is committed);
//   2. stale page dates: src/data/content-dates.json must match the content (scripts/content-dates.mjs --check), or
//      the sitemap <lastmod> / Article dateModified of edited pages would be the build time instead of the edit;
//   3. the copy contract (scripts/check-i18n.mjs) and the unit tests (vitest).
// After the build, `npm run deploy` also runs the dist crawl and the budgets on the very files it uploads.
import { execFileSync, execSync } from "node:child_process";

const step = (label, fn) => {
  try {
    fn();
  } catch {
    console.error(`\nRefusing to deploy: ${label}`);
    process.exit(1);
  }
};

const dirty = execSync("git status --porcelain", { encoding: "utf8" }).trim();
if (dirty && !process.env.ALLOW_DIRTY_DEPLOY) {
  console.error("Refusing to deploy: commit your changes first (what is deployed must be what is committed).\n" + dirty);
  console.error("Override (not recommended): ALLOW_DIRTY_DEPLOY=1 npm run deploy");
  process.exit(1);
}
console.log("predeploy: working tree clean");

const node = (...args) => execFileSync(process.execPath, args, { stdio: "inherit" });
step('page dates are stale — run "node scripts/content-dates.mjs --write" and commit src/data/content-dates.json', () =>
  node("scripts/content-dates.mjs", "--check"),
);
step("the i18n check failed (scripts/check-i18n.mjs)", () => node("scripts/check-i18n.mjs"));
step("unit tests failed (npm run test:unit)", () => execSync("npx vitest run", { stdio: "inherit" }));
console.log("predeploy: content dates current, i18n and unit tests green");
