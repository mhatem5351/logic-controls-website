/**
 * Content version of the illustration sources (build time only). Lazy art placeholders fetch their fragment as
 * `/en/art/<kind>/?v=<ART_VERSION>`, so the fragments can be cached as immutable (public/_headers): any change to an
 * illustration, the frame or this folder's helpers changes the URL.
 */
const sources = import.meta.glob<string>("./**/*.{astro,ts}", { query: "?raw", import: "default", eager: true });

let h = 0x811c9dc5;
for (const key of Object.keys(sources).sort()) {
  const text = key + (sources[key] ?? "");
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
}
export const ART_VERSION = (h >>> 0).toString(36);
