/** Deterministic per-build id generator for SVG gradients / ARIA relationships. */
let n = 0;
export function uid(prefix = "lc"): string {
  n = (n + 1) % 1_000_000;
  return `${prefix}-${n.toString(36)}`;
}
