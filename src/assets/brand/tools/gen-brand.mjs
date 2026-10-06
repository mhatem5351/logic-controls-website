// Brand asset generators (run from the project root): node src/assets/brand/tools/logo-extract.cjs · node src/assets/brand/tools/gen-brand.mjs · node src/assets/brand/tools/gen-icons.cjs · node src/assets/brand/tools/gen-og.cjs
import { writeFileSync } from "node:fs";
import { parts } from "./mark.mjs";
const ROOT = process.cwd() + "/";
const VB = "326 319 289 311";
const SQ = "314.5 318.5 312 312"; // square, centred on the mark
const { ring, P, traces, stub, rings, RR, RW, SW } = parts;
const body = (blue, gray) =>
  `<path fill="${blue}" d="${ring}"/><path fill="${blue}" d="${P}"/><g fill="none" stroke="${gray}" stroke-width="${SW}" stroke-miterlimit="10">${traces.map((t) => `<path d="${t}"/>`).join("")}</g><path fill="${gray}" d="${stub}"/><g fill="none" stroke="${gray}" stroke-width="${RW}">${rings.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${RR}"/>`).join("")}</g>`;
const grad = (id, y1, y2, a, b) => `<linearGradient id="${id}" x1="0" y1="${y1}" x2="0" y2="${y2}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
const LIGHT = { b: ["#0558AE", "#00276C"], g: ["#A4A5A9", "#43464F"] };
const DARK = { b: ["#6AACFF", "#2A74DA"], g: ["#E9EAEE", "#9C9EA6"] };
const svg = (vb, pal, extra = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"${extra}><defs>${grad("b", 320, 628, ...pal.b)}${grad("g", 322, 616, ...pal.g)}</defs>${body("url(#b)", "url(#g)")}</svg>\n`;
writeFileSync(ROOT + "src/assets/brand/mark.svg", svg(VB, LIGHT));
writeFileSync(ROOT + "src/assets/brand/mark-dark.svg", svg(VB, DARK));
writeFileSync(ROOT + "src/assets/brand/mark-mono.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VB}">${body("currentColor", "currentColor")}</svg>\n`);
// favicon: light palette, switches to the dark palette when the browser UI is dark
const fav = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${SQ}"><style>.d{display:none}@media (prefers-color-scheme:dark){.l{display:none}.d{display:inline}}</style><defs>${grad("b", 320, 628, ...LIGHT.b)}${grad("g", 322, 616, ...LIGHT.g)}${grad("B", 320, 628, ...DARK.b)}${grad("G", 322, 616, ...DARK.g)}</defs><g class="l">${body("url(#b)", "url(#g)")}</g><g class="d">${body("url(#B)", "url(#G)")}</g></svg>\n`;
writeFileSync(ROOT + "public/favicon.svg", fav);
// TS module for inline use in components
const ts = `// Generated from measurements of client-data/brand/logo-original.jpg (gear half + "P" + three circuit traces).
// Coordinates are in original-image pixels; use MARK_VIEWBOX (tight) or MARK_VIEWBOX_SQUARE.
export const MARK_VIEWBOX = ${JSON.stringify(VB)};
export const MARK_VIEWBOX_SQUARE = ${JSON.stringify(SQ)};
export const MARK = {
  ring: ${JSON.stringify(ring)},
  p: ${JSON.stringify(P)},
  traces: ${JSON.stringify(traces)},
  stub: ${JSON.stringify(stub)},
  rings: ${JSON.stringify(rings)} as [number, number][],
  ringRadius: ${RR},
  ringStroke: ${RW},
  traceStroke: ${SW},
} as const;
export const MARK_PALETTES = {
  light: { blue: ${JSON.stringify(LIGHT.b)}, gray: ${JSON.stringify(LIGHT.g)} },
  dark: { blue: ${JSON.stringify(DARK.b)}, gray: ${JSON.stringify(DARK.g)} },
} as const;
`;
writeFileSync(ROOT + "src/components/brand-mark.ts", ts);
console.log("ok", fav.length);
