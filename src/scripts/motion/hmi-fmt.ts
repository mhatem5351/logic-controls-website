/**
 * Number formatting and the product-temperature colour scale of the HMI demo (shared by HmiDemo.astro at build time
 * and hmi-demo.ts at run time, so the static snapshot and the live panel agree).
 */

/** One decimal, in the page's convention: Turkish uses a decimal comma ("72,0 °C"), the other locales a point. */
export const fmt1 = (v: number, lang?: string): string => {
  const s = v.toFixed(1);
  return lang === "tr" ? s.replace(".", ",") : s;
};

/** Range of the colour key under the mimic (°C). */
export const KEY_T0 = 4;
export const KEY_T1 = 90;

type RGB = [number, number, number];
const COOL0: RGB = [95, 136, 184]; // cold product: steel blue
const COOL1: RGB = [150, 157, 170]; // just below the legal limit: neutral grey-blue
const WARM0: RGB = [196, 152, 104]; // at the limit: warm tan
const WARM1: RGB = [206, 104, 58]; // hot: copper
const mix = (a: RGB, b: RGB, k: number): RGB => {
  const q = Math.max(0, Math.min(1, k));
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * q)) as RGB;
};
const css = ([r, g, b]: RGB) => `rgb(${r},${g},${b})`;

/**
 * Product colour anchored to the recipe's legal limit: everything below it reads cool, everything at or above it
 * warm, with a 1 °C blend. So under-temperature product in the holding tube is visibly different from good product
 * (67 °C and 73 °C used to be the same copper). Muted on purpose (ISA-101); abnormal states add the amber dashes.
 */
export function productColor(t: number, limit: number): string {
  if (t < limit - 1) return css(mix(COOL0, COOL1, (t - KEY_T0) / (limit - 1 - KEY_T0)));
  if (t < limit) return css(mix(COOL1, WARM0, t - (limit - 1)));
  return css(mix(WARM0, WARM1, (t - limit) / Math.max(1, KEY_T1 - limit)));
}

/** Utilities (the hot-water loop): a plain continuous scale, not tied to the product limit. */
const PLAIN: [number, RGB][] = [
  [4, COOL0],
  [35, COOL1],
  [62, WARM0],
  [85, WARM1],
];
export function plainColor(t: number): string {
  let i = 0;
  while (i < PLAIN.length - 2 && t > PLAIN[i + 1][0]) i++;
  const [t0, c0] = PLAIN[i];
  const [t1, c1] = PLAIN[i + 1];
  return css(mix(c0, c1, (t - t0) / (t1 - t0)));
}

/** Gradient stops [offset 0–1, colour] of the key for a given limit. */
export function keyStops(limit: number): [number, string][] {
  const o = (v: number) => (v - KEY_T0) / (KEY_T1 - KEY_T0);
  return [
    [0, css(COOL0)],
    [o(limit - 1), css(COOL1)],
    [o(limit), css(WARM0)],
    [1, css(WARM1)],
  ];
}
