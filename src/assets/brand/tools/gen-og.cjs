const sharp = require("sharp");
const ROOT = process.cwd() + "/";
(async () => {
  const W = 1200, H = 630;
  let grid = "";
  for (let x = 0; x <= W; x += 24) grid += `<line x1="${x}.5" y1="0" x2="${x}.5" y2="${H}" stroke="rgb(150,182,232)" stroke-opacity="${x % 120 === 0 ? 0.09 : 0.04}"/>`;
  for (let y = 0; y <= H; y += 24) grid += `<line x1="0" y1="${y}.5" x2="${W}" y2="${y}.5" stroke="rgb(150,182,232)" stroke-opacity="${y % 120 === 0 ? 0.09 : 0.04}"/>`;
  const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs><radialGradient id="glow" cx="0.72" cy="0.35" r="0.75"><stop offset="0" stop-color="#0d2552"/><stop offset="1" stop-color="#040e27"/></radialGradient>
  <linearGradient id="fade" x1="0" x2="1"><stop offset="0" stop-color="#040e27" stop-opacity="0.9"/><stop offset="0.6" stop-color="#040e27" stop-opacity="0"/></linearGradient></defs>
  <rect width="100%" height="100%" fill="url(#glow)"/>${grid}<rect width="100%" height="100%" fill="url(#fade)"/>
  <g fill="none" stroke="#5fa4fa" stroke-opacity="0.32" stroke-width="2">
    <path d="M1200 150 H1060 L1000 210 V330"/><circle cx="1000" cy="341" r="10"/>
    <path d="M1200 190 H1090 L1040 240 V400"/><circle cx="1040" cy="411" r="10"/>
    <path d="M1200 230 H1120 L1080 270 V300"/><circle cx="1080" cy="311" r="10"/>
  </g>
  <circle cx="1040" cy="411" r="4" fill="#ffb02b"/>
  <polygon points="84,500 146,500 144.6,492 82.6,492" fill="#ffb02b"/>
  <text x="80" y="540" font-family="Menlo, DejaVu Sans Mono, monospace" font-size="22" letter-spacing="4" fill="#c1d6f6">PLC · HMI · SCADA · MACHINE AUTOMATION</text>
  <text x="${W - 80}" y="540" text-anchor="end" font-family="Menlo, DejaVu Sans Mono, monospace" font-size="22" letter-spacing="2" fill="#96b6e8">logic-controls.com</text>
</svg>`;
  const logo = await sharp(ROOT + "src/assets/brand/logo-dark.png").resize({ width: 640 }).toBuffer();
  const meta = await sharp(logo).metadata();
  await sharp(Buffer.from(bg)).composite([{ input: logo, left: 72, top: Math.round((470 - meta.height) / 2) }]).png({ compressionLevel: 9, palette: true, quality: 90 }).toFile(ROOT + "public/og-default.png");
  console.log("og ok");
})();
