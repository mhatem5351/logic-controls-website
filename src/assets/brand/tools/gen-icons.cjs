const sharp = require("sharp");
const fs = require("fs");
const ROOT = process.cwd() + "/";
const markLight = fs.readFileSync(ROOT + "src/assets/brand/mark.svg", "utf8");
const markDark = fs.readFileSync(ROOT + "src/assets/brand/mark-dark.svg", "utf8");
const square = (svg) => svg.replace(/viewBox="[^"]+"/, 'viewBox="314.5 318.5 312 312"');
async function renderMark(svg, size, pad, bg) {
  const inner = Math.round(size * (1 - 2 * pad));
  const m = await sharp(Buffer.from(square(svg)), { density: 600 }).resize(inner, inner).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: m, left: Math.round((size - inner) / 2), top: Math.round((size - inner) / 2) }])
    .png({ compressionLevel: 9 }).toBuffer();
}
(async () => {
  const T = { r: 0, g: 0, b: 0, alpha: 0 };
  // ICO with embedded PNGs (16, 32, 48)
  const sizes = [16, 32, 48];
  const pngs = await Promise.all(sizes.map((s) => renderMark(markLight, s, s <= 16 ? 0.0 : 0.02, T)));
  const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  let offset = 6 + 16 * sizes.length; const dirs = [];
  sizes.forEach((s, i) => { const d = Buffer.alloc(16); d.writeUInt8(s === 256 ? 0 : s, 0); d.writeUInt8(s === 256 ? 0 : s, 1); d.writeUInt8(0, 2); d.writeUInt8(0, 3); d.writeUInt16LE(1, 4); d.writeUInt16LE(32, 6); d.writeUInt32LE(pngs[i].length, 8); d.writeUInt32LE(offset, 12); offset += pngs[i].length; dirs.push(d); });
  fs.writeFileSync(ROOT + "public/favicon.ico", Buffer.concat([header, ...dirs, ...pngs]));
  // Apple touch icon: white tile (iOS fills transparency with black) with breathing room
  fs.writeFileSync(ROOT + "public/apple-touch-icon.png", await renderMark(markLight, 180, 0.14, "#ffffff"));
  // PWA / Android icons (navy tile, light mark) + maskable variant with safe zone
  fs.writeFileSync(ROOT + "public/icon-192.png", await renderMark(markDark, 192, 0.16, "#040e27"));
  fs.writeFileSync(ROOT + "public/icon-512.png", await renderMark(markDark, 512, 0.16, "#040e27"));
  fs.writeFileSync(ROOT + "public/icon-maskable-512.png", await renderMark(markDark, 512, 0.24, "#040e27"));
  // Preview sheet
  const prev = await Promise.all([16, 32, 48, 180].map(async (s) => sharp(await renderMark(markLight, s, s === 180 ? 0.14 : 0.02, s === 180 ? "#ffffff" : T)).resize(s * 3, s * 3, { kernel: s < 64 ? "nearest" : "lanczos3" }).png().toBuffer()));
  const p512 = await sharp(ROOT + "public/icon-512.png").resize(240).toBuffer();
  let left = 10; const comps = [];
  for (const b of prev) { const m = await sharp(b).metadata(); comps.push({ input: b, left, top: 10 }); left += m.width + 20; }
  comps.push({ input: p512, left, top: 10 });
  await sharp({ create: { width: left + 260, height: 560, channels: 3, background: "#e5e6eb" } }).composite(comps).png().toFile(require("os").tmpdir() + "/icons-preview.png");
  console.log("icons ok");
})();
