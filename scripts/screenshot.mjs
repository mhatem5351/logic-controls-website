// Visual QA: serves dist/ (like Workers static assets: /path/ → /path/index.html) and captures pages with Playwright.
// Usage: node scripts/screenshot.mjs [outDir] [--pages=styleguide,home] [--locales=en,ar] [--slice=1600]
// Full-page captures are also cut into slices (easier to review). Requires `npm run build` (or astro build) first.
import { createServer } from "node:http";
import { readFile, stat, mkdir } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";

const args = process.argv.slice(2);
const flag = (name, def) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? def;
const outDir = resolve(args.find((a) => !a.startsWith("--")) ?? "screenshots");
const pages = flag("pages", "home,styleguide").split(",");
const locales = flag("locales", "en,ar").split(",");
const sliceH = Number(flag("slice", "1600"));
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 },
];
const ROUTES = { home: "", styleguide: "styleguide/", "404": null };

const DIST = resolve("dist");
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif", ".woff2": "font/woff2", ".mp4": "video/mp4", ".ico": "image/x-icon", ".json": "application/json", ".webmanifest": "application/manifest+json", ".xml": "application/xml", ".txt": "text/plain" };

const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path === "/") path = "/en/";
  let file = join(DIST, path);
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
  } catch {
    file = join(DIST, "404.html");
    res.statusCode = 404;
  }
  try {
    const body = await readFile(file);
    res.setHeader("content-type", TYPES[extname(file)] ?? "application/octet-stream");
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end("not found");
  }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
for (const vp of viewports) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor ?? 1, isMobile: vp.isMobile ?? false, hasTouch: vp.isMobile ?? false, reducedMotion: "no-preference" });
  const page = await context.newPage();
  for (const p of pages) {
    for (const l of p === "404" ? ["xx"] : locales) {
      const url = p === "404" ? `${base}/does-not-exist/` : `${base}/${l}/${ROUTES[p] ?? ""}`;
      await page.goto(url, { waitUntil: "networkidle" });
      // Trigger lazy images, then return to top.
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 600) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 60));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(1800);
      const name = `${p}-${l}-${vp.name}`;
      const fold = join(outDir, `${name}-fold.png`);
      await page.screenshot({ path: fold });
      const fullPath = join(outDir, `${name}-full.png`);
      await page.screenshot({ path: fullPath, fullPage: true });
      // Slices for review (in CSS px × DPR).
      const meta = await sharp(fullPath).metadata();
      const dpr = vp.deviceScaleFactor ?? 1;
      const h = sliceH * dpr;
      let i = 0;
      for (let top = 0; top < meta.height; top += h, i++) {
        await sharp(fullPath)
          .extract({ left: 0, top, width: meta.width, height: Math.min(h, meta.height - top) })
          .resize({ width: Math.min(meta.width, 1440) })
          .toFile(join(outDir, `${name}-s${String(i).padStart(2, "0")}.png`));
      }
      console.log(`${name}: ${meta.height / dpr}px, ${i} slices`);
      // Interactive states on the home page: mobile drawer / desktop language menu / scrolled header.
      if (p === "home") {
        if (vp.isMobile) {
          await page.click(".lc-menu-open");
          await page.waitForTimeout(500);
          await page.screenshot({ path: join(outDir, `${name}-drawer.png`) });
          await page.keyboard.press("Escape");
        } else {
          await page.click(".lc-lang-menu button");
          await page.waitForTimeout(300);
          await page.screenshot({ path: join(outDir, `${name}-langmenu.png`), clip: { x: 640, y: 0, width: 800, height: 400 } });
          await page.keyboard.press("Escape");
          await page.evaluate(() => window.scrollTo(0, 1400));
          await page.waitForTimeout(500);
          await page.screenshot({ path: join(outDir, `${name}-scrolled.png`) });
        }
      }
    }
  }
  await context.close();
}
await browser.close();
server.close();
