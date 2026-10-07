// Click counts from the Workers Analytics Engine dataset `lc_clicks` (written by POST /api/evt, see README → "Click
// counts"): WhatsApp / call / email / copy-email / quote clicks and sent forms, per language, kind and placement.
//
//   npm run clicks                 last 7 days
//   npm run clicks -- 30           last 30 days
//   npm run clicks -- 7 --pages    … per page instead of per placement
// Needs CLOUDFLARE_ACCOUNT_ID and a token with Account Analytics: Read (CLOUDFLARE_API_TOKEN in .env has it).
const days = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) ?? 7);
const byPage = process.argv.includes("--pages");
const { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: token } = process.env;
if (!account || !token) throw new Error("CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN are not set (npm run clicks reads .env)");

const group = byPage ? "blob3 AS locale, blob1 AS kind, blob4 AS page" : "blob3 AS locale, blob1 AS kind, blob2 AS placement";
const keys = byPage ? "locale, kind, page" : "locale, kind, placement";
// SUM(_sample_interval), not COUNT(): Analytics Engine may sample at high volume.
const sql = `SELECT ${group}, SUM(_sample_interval) AS clicks FROM lc_clicks
  WHERE timestamp > NOW() - INTERVAL '${days}' DAY GROUP BY ${keys} ORDER BY clicks DESC FORMAT JSONEachRow`;

const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/analytics_engine/sql`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
  body: sql,
});
const text = await res.text();
if (!res.ok) throw new Error(`Analytics Engine SQL API: HTTP ${res.status} ${text.slice(0, 300)}`);
const rows = text.trim()
  ? text
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l))
  : [];

if (!rows.length) console.log(`No clicks in the last ${days} days.`);
else {
  const total = rows.reduce((n, r) => n + Number(r.clicks), 0);
  console.log(`Clicks in the last ${days} days: ${total}\n`);
  console.table(rows.map((r) => ({ ...r, clicks: Number(r.clicks) })));
}
