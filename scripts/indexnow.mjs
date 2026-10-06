// Submit every URL in the built sitemap to IndexNow (Bing, Yandex, Naver, Seznam…). Free, no account.
// Usage: INDEXNOW_KEY=… node scripts/indexnow.mjs   (key file must already be deployed at /<key>.txt)
import { readFileSync, readdirSync } from "node:fs";

const host = "logic-controls.com";
const key = process.env.INDEXNOW_KEY;
if (!key) throw new Error("INDEXNOW_KEY is not set");

const urls = readdirSync("dist")
  .filter((f) => /^sitemap-\d+\.xml$/.test(f))
  .flatMap((f) => [...readFileSync(`dist/${f}`, "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host, key, keyLocation: `https://${host}/${key}.txt`, urlList: urls }),
});
console.log(`IndexNow: submitted ${urls.length} URLs → HTTP ${res.status} ${res.statusText}`);
if (!res.ok && res.status !== 202) console.log(await res.text());
