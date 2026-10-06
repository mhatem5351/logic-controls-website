// Derive transparent light/dark logo variants from the white-background JPG.
const sharp = require("sharp");
const OUT = process.cwd() + "/src/assets/brand/";
const S = require("os").tmpdir() + "/";
const toLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const fromLin = (c) => { const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; return Math.round(Math.min(1, Math.max(0, v)) * 255); };
function rgb2oklab(r, g, b) {
  [r, g, b] = [r, g, b].map(toLin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function oklab2rgb(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map(fromLin);
}
(async () => {
  const { data, info } = await sharp(process.cwd() + "/client-data/brand/logo-original.jpg").raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, N = W * H;
  // distance-to-white
  const d = new Float32Array(N);
  for (let i = 0; i < N; i++) d[i] = 255 - Math.min(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]);
  // anchor = most-solid pixel (max d) in a 7x7 neighbourhood (separable arg-max)
  const R = 3, DMIN = 140, NOISE = 8;
  const rowIdx = new Int32Array(N), anc = new Int32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let bi = y * W + x; for (let k = -R; k <= R; k++) { const xx = x + k; if (xx >= 0 && xx < W && d[y * W + xx] > d[bi]) bi = y * W + xx; } rowIdx[y * W + x] = bi; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let bi = rowIdx[y * W + x]; for (let k = -R; k <= R; k++) { const yy = y + k; if (yy >= 0 && yy < H) { const c = rowIdx[yy * W + x]; if (d[c] > d[bi]) bi = c; } } anc[y * W + x] = bi; }
  const light = Buffer.alloc(N * 4), dark = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) {
    const di = d[i], ai = anc[i], da = d[ai];
    const ref = Math.max(da, DMIN);
    const a = di <= NOISE ? 0 : Math.min(1, (di - NOISE) / (ref - NOISE));
    let r, g, b;
    if (da >= DMIN && a < 1) { r = data[ai * 3]; g = data[ai * 3 + 1]; b = data[ai * 3 + 2]; }
    else {
      r = data[i * 3]; g = data[i * 3 + 1]; b = data[i * 3 + 2];
      if (a > 0 && a < 1) { r = Math.round(Math.min(255, Math.max(0, (r - (1 - a) * 255) / a))); g = Math.round(Math.min(255, Math.max(0, (g - (1 - a) * 255) / a))); b = Math.round(Math.min(255, Math.max(0, (b - (1 - a) * 255) / a))); }
    }
    const A = Math.round(a * 255);
    light[i * 4] = r; light[i * 4 + 1] = g; light[i * 4 + 2] = b; light[i * 4 + 3] = A;
    // dark variant
    const x = i % W, y = (i / W) | 0;
    const [L, aa, bb] = rgb2oklab(r, g, b);
    const C = Math.hypot(aa, bb);
    let out;
    if (C < 0.05) {
      const wordmark = x >= 625 && y < 600;
      const nL = wordmark ? 0.995 : Math.min(0.93, 0.70 + Math.max(0, L - 0.39) * 0.6);
      out = oklab2rgb(nL, aa * 0.5, bb * 0.5);
    } else {
      const nL = Math.min(0.80, 0.37 + L * 0.72);
      out = oklab2rgb(nL, aa * 1.08, bb * 1.08);
    }
    dark[i * 4] = out[0]; dark[i * 4 + 1] = out[1]; dark[i * 4 + 2] = out[2]; dark[i * 4 + 3] = A;
  }
  const trimBox = { left: 322, top: 316, width: 1124 - 322, height: 660 - 316 };
  for (const [name, buf] of [["logo", light], ["logo-dark", dark]]) {
    const base = sharp(buf, { raw: { width: W, height: H, channels: 4 } }).extract(trimBox);
    const png = await base.png({ compressionLevel: 9, palette: false }).toBuffer();
    // tighter trim on alpha
    const trimmed = await sharp(png).trim({ threshold: 1 }).png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
    console.log(name, trimmed.info.width, trimmed.info.height, trimmed.info.trimOffsetLeft, trimmed.info.trimOffsetTop);
    await sharp(trimmed.data).png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(OUT + name + ".png");
    await sharp(trimmed.data).webp({ quality: 92, alphaQuality: 100, smartSubsample: true }).toFile(OUT + name + ".webp");
  }
  // previews on various backgrounds
  const lp = await sharp(OUT + "logo.png").resize({ width: 600 }).toBuffer();
  const dp = await sharp(OUT + "logo-dark.png").resize({ width: 600 }).toBuffer();
  const meta = await sharp(lp).metadata();
  const h = meta.height + 60;
  const tiles = [["#ffffff", lp], ["#f3f3f6", lp], ["#040e27", dp], ["#061b45", dp], ["#363740", dp]];
  await sharp({ create: { width: 660 * 2, height: h * 3, channels: 3, background: "#888" } })
    .composite(tiles.flatMap(([bg, img], i) => {
      const left = (i % 2) * 660, top = Math.floor(i / 2) * h;
      return [{ input: { create: { width: 660, height: h, channels: 3, background: bg } }, left, top }, { input: img, left: left + 30, top: top + 30 }];
    }))
    .png().toFile(S + "logo-preview.png");
  console.log("ok");
})();
