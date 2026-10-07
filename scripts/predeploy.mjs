// Refuses to deploy a working tree with uncommitted changes: the build dates pages (sitemap lastmod, Article
// dateModified) from git history, so building before committing would publish stale dates.
import { execSync } from "node:child_process";

const dirty = execSync("git status --porcelain", { encoding: "utf8" }).trim();
if (dirty && !process.env.ALLOW_DIRTY_DEPLOY) {
  console.error("Refusing to deploy: commit your changes first (page dates come from git).\n" + dirty);
  console.error("Override (not recommended): ALLOW_DIRTY_DEPLOY=1 npm run deploy");
  process.exit(1);
}
console.log("predeploy: working tree clean");
