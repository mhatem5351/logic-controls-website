// Builds the Logic Controls icon mark (gear half + "P" + 3 circuit traces) from measurements of logo-original.jpg.
// Coordinates are in original-image pixels; viewBox crops around the mark.
import { writeFileSync } from "node:fs";
const f = (n) => +n.toFixed(2);
const pt = (p) => `${f(p[0])} ${f(p[1])}`;
const G = { c: [465.8, 465.2], rb: 119, rt: 147, hb: 24.5, ht: 22.5, teeth: [18.4, 55.6, 92.8, 130, 167.2] };
const HOLE = { c: [458.2, 460.1], r: 94.6 };
const D = { c: [458.4, 459.1], r: 81.5 };
const CUT_TOP = [[497.5, 321], [488, 369]]; // ~11° italic slant
const CUT_X = 477.5;
const rad = (d) => (d * Math.PI) / 180;
const polar = (c, r, deg) => [c[0] + r * Math.sin(rad(deg)), c[1] - r * Math.cos(rad(deg))];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
function lineCircle(p, q, c, r) { // intersections of line pq with circle, return params t
  const d = sub(q, p), m = sub(p, c);
  const A = d[0] ** 2 + d[1] ** 2, B = 2 * (m[0] * d[0] + m[1] * d[1]), C = m[0] ** 2 + m[1] ** 2 - r * r;
  const disc = Math.sqrt(B * B - 4 * A * C);
  return [(-B - disc) / (2 * A), (-B + disc) / (2 * A)].map((t) => add(p, mul(d, t)));
}
function segIntersect(p1, p2, p3, p4) {
  const d1 = sub(p2, p1), d2 = sub(p4, p3);
  const den = d1[0] * d2[1] - d1[1] * d2[0];
  const t = ((p3[0] - p1[0]) * d2[1] - (p3[1] - p1[1]) * d2[0]) / den;
  return add(p1, mul(d1, t));
}
// tooth geometry
function tooth(deg) {
  const db = (Math.asin(G.hb / G.rb) * 180) / Math.PI;
  const axis = [Math.sin(rad(deg)), -Math.cos(rad(deg))];
  const perp = [Math.cos(rad(deg)), Math.sin(rad(deg))]; // clockwise direction
  const tipC = add(G.c, mul(axis, G.rt));
  return {
    base0: polar(G.c, G.rb, deg - db), base1: polar(G.c, G.rb, deg + db),
    tip0: add(tipC, mul(perp, -G.ht)), tip1: add(tipC, mul(perp, G.ht)),
  };
}
const T = G.teeth.map(tooth);
// start: top cut ∩ first tooth tip edge
const start = segIntersect(CUT_TOP[0], CUT_TOP[1], T[0].tip0, T[0].tip1);
let d = `M${pt(start)}L${pt(T[0].tip1)}L${pt(T[0].base1)}`;
for (let i = 1; i < T.length; i++) {
  d += `A${G.rb} ${G.rb} 0 0 1 ${pt(T[i].base0)}L${pt(T[i].tip0)}`;
  if (i < T.length - 1) d += `L${pt(T[i].tip1)}L${pt(T[i].base1)}`;
}
// last tooth: tip edge until x = CUT_X
const last = T[T.length - 1];
const endTip = segIntersect(last.tip0, last.tip1, [CUT_X, 0], [CUT_X, 1000]);
d += `L${pt(endTip)}`;
const holeBottom = [CUT_X, HOLE.c[1] + Math.sqrt(HOLE.r ** 2 - (CUT_X - HOLE.c[0]) ** 2)];
d += `L${pt(holeBottom)}`;
const holeTop = lineCircle(CUT_TOP[0], CUT_TOP[1], HOLE.c, HOLE.r).sort((a, b) => a[1] - b[1])[0];
d += `A${HOLE.r} ${HOLE.r} 0 0 0 ${pt(holeTop)}Z`;
const ring = d;
// "P": stem + chamfer + D bowl
const dTop = [CUT_X, D.c[1] - Math.sqrt(D.r ** 2 - (CUT_X - D.c[0]) ** 2)];
const STEM = { x0: 440, x1: 464 };
const dBot = [STEM.x1, D.c[1] + Math.sqrt(D.r ** 2 - (STEM.x1 - D.c[0]) ** 2)];
const chamferTopY = 449.5;
const P = `M${STEM.x0} 627.5V${f(chamferTopY + (CUT_X - STEM.x0))}L${CUT_X} ${chamferTopY}V${f(dTop[1])}A${D.r} ${D.r} 0 0 1 ${pt(dBot)}V621Z`;
// traces (stroke centerlines)
const SW = 13.5;
const traces = [
  "M347 471V547.3L420 602.1V464.5L459.5 425V360", // T1 + floor + T3
  "M403.5 413V455.8L371.5 487.8V566",              // T2
];
const stub = "M389 518.5L402 505.5V590H389Z";
const rings = [[347, 453], [403.5, 395], [459.5, 342]];
const RR = 14.75, RW = 8.5;
export function markSvg({ gradient = true, mono = null, viewBox = "324 318 300 312", id = "lc" } = {}) {
  const blue = mono ?? (gradient ? `url(#${id}-b)` : "#034091");
  const gray = mono ?? (gradient ? `url(#${id}-g)` : "#5B5D66");
  const defs = gradient && !mono ? `<defs><linearGradient id="${id}-b" x1="0" y1="320" x2="0" y2="628" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#0558AE"/><stop offset="1" stop-color="#00276C"/></linearGradient><linearGradient id="${id}-g" x1="0" y1="322" x2="0" y2="616" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#A4A5A9"/><stop offset="1" stop-color="#43464F"/></linearGradient></defs>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${defs}<path fill="${blue}" d="${ring}"/><path fill="${blue}" d="${P}"/><g fill="none" stroke="${gray}" stroke-width="${SW}" stroke-miterlimit="10">${traces.map((t) => `<path d="${t}"/>`).join("")}</g><path fill="${gray}" d="${stub}"/><g fill="none" stroke="${gray}" stroke-width="${RW}">${rings.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${RR}"/>`).join("")}</g></svg>`;
}
export const parts = { ring, P, traces, stub, rings, RR, RW, SW };
if (process.argv[2]) writeFileSync(process.argv[2], markSvg());
