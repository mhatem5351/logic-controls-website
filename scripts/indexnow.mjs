// Tell IndexNow (Bing, Yandex, Naver, Seznam…) which URLs changed. Free, no account. Run after a content deploy:
//   npm run indexnow                 submit the URLs whose sitemap <lastmod> changed since the last submission, plus new
//                                    and removed ones (CS3-06: IndexNow is for added, updated or deleted URLs)
//   npm run indexnow -- --dry-run    list them; no request, no file written, no key needed
//   npm run indexnow -- --all        submit every sitemap URL (a deliberate full resubmit)
// The last submission is recorded in scripts/indexnow-state.json (sitemap path → the <lastmod> submitted), written only
// after IndexNow accepted the list: commit it (predeploy refuses a dirty tree). Without that file every URL is submitted.
// Before submitting, the live sitemap must equal dist/'s: the engines would otherwise crawl pages not deployed yet.
// Needs INDEXNOW_KEY (from .env via the npm script); the key file /<key>.txt must already be deployed.
import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const HOST = "logic-controls.com";
export const STATE_FILE = "scripts/indexnow-state.json";

/** <loc> → <lastmod> ("" when absent) of every sitemap-N.xml text, keyed by path. */
export function sitemapDates(/** @type {string[]} */ xmls) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const xml of xmls)
    for (const [, body] of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
      const loc = /<loc>([^<]+)<\/loc>/.exec(body)?.[1];
      if (loc) out[new URL(loc).pathname] = /<lastmod>([^<]+)<\/lastmod>/.exec(body)?.[1] ?? "";
    }
  return out;
}

/**
 * The paths to submit: new or re-dated pages and pages gone since the last submission (all of them without a record).
 * @param {Record<string, string>} current path → lastmod now
 * @param {Record<string, string> | undefined} submitted path → lastmod at the last accepted submission
 * @param {{ all?: boolean }} [opts]
 */
export function toSubmit(current, submitted, { all = false } = {}) {
  if (all || !submitted) return { paths: Object.keys(current).sort(), added: [], changed: [], removed: [], full: true };
  const added = Object.keys(current).filter((p) => !(p in submitted));
  const changed = Object.keys(current).filter((p) => p in submitted && submitted[p] !== current[p]);
  const removed = Object.keys(submitted).filter((p) => !(p in current));
  return { paths: [...added, ...changed, ...removed].sort(), added, changed, removed, full: false };
}

/** The state file's text: paths sorted, 2-space indent, trailing newline. */
export const serializeState = (/** @type {Record<string, string>} */ map) =>
  `${JSON.stringify(
    Object.fromEntries(
      Object.keys(map)
        .sort()
        .map((p) => [p, map[p]]),
    ),
    null,
    2,
  )}\n`;

async function main(/** @type {string[]} */ args) {
  const dryRun = args.includes("--dry-run");
  const files = existsSync("dist")
    ? readdirSync("dist")
        .filter((f) => /^sitemap-\d+\.xml$/.test(f))
        .sort()
    : [];
  if (!files.length) throw new Error("dist/ has no sitemap: build (and deploy) first");
  const xmls = files.map((f) => readFileSync(`dist/${f}`, "utf8"));
  const current = sitemapDates(xmls);
  const submitted = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : undefined;
  const plan = toSubmit(current, submitted, { all: args.includes("--all") });
  if (plan.full) console.log(`IndexNow: ${submitted ? "--all" : `no ${STATE_FILE} yet`}: all ${plan.paths.length} sitemap URLs`);
  else
    console.log(
      `IndexNow: ${plan.added.length} new, ${plan.changed.length} re-dated, ${plan.removed.length} removed since the last submission`,
    );
  for (const p of plan.paths) console.log(`  ${p}`);
  if (!plan.paths.length) return 0;
  if (dryRun) return 0;

  const key = process.env.INDEXNOW_KEY;
  if (!key) throw new Error("INDEXNOW_KEY is not set (npm run indexnow reads it from .env)");
  for (const [i, f] of files.entries()) {
    const live = await fetch(`https://${HOST}/${f}`, { cache: "no-store" }).then((r) => (r.ok ? r.text() : ""));
    if (live !== xmls[i]) throw new Error(`the live /${f} differs from dist/${f}: deploy first, then submit`);
  }
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host: HOST,
      key,
      keyLocation: `https://${HOST}/${key}.txt`,
      urlList: plan.paths.map((p) => `https://${HOST}${p}`),
    }),
  });
  console.log(`IndexNow: submitted ${plan.paths.length} URLs → HTTP ${res.status} ${res.statusText}`);
  if (!res.ok) {
    console.log(await res.text());
    return 1;
  }
  writeFileSync(STATE_FILE, serializeState(current));
  console.log(`  recorded in ${STATE_FILE}: commit it`);
  return 0;
}

// Only as the entry point (tests/unit/indexnow.test.ts imports the helpers).
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).then(
    (code) => (process.exitCode = code),
    (e) => {
      console.error(`IndexNow: ${e.message}`);
      process.exitCode = 1;
    },
  );
}
