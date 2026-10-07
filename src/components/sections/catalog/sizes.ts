/**
 * Responsive image `sizes` / `widths` for card grids, matched to the real rendered box (not a viewport fraction):
 * the site container caps at 78rem (1248px), so a 3-up card is ~395px on any desktop wider than 1280px. On large
 * monitors the root size steps up (global.css, ≥ 1920 / 2560 CSS px, Arabic +6.25% more), and every rem-based box grows
 * with it: a 3-up card measures 419–446px at 1920 and 444–472px at 2560 (en–ar), so those widths get their own slots
 * (DEV3-04; `sizes` lengths cannot follow the root size: rem there means the initial 16px).
 * Widths stop at 1200: 1000 serves a 450–475px card on a 2x large monitor (5K iMac, 4K at 200%), 1200 the wider
 * `sizes` overrides (related / feature cards ≈ 500–590px). Each is capped at the source width by astro:assets, so a
 * small cover adds at most its own width. Phones at 2.5x and more (most current phones: 2.625–3x) ask for ~60% of the
 * card width, i.e. ~2x pixels: 390px @ 3 → 644w and 412px @ 2.625 → 598w take the 640w file instead of 800w (−36%
 * pixels, not visibly softer on a ~360px card; PERF2-10).
 *
 *   CARD_SIZES_3   project cards: 1 col (phone) · 2 col (≥640) · 3 col (≥1024) — projects index, related projects
 *   CARD_SIZES_4   industry / service cards (lc-grid-*): 1 · 2 · 3 (≥1024) · 4 (≥1280)
 */
export const CARD_WIDTHS = [320, 480, 640, 800, 1000, 1200];
const PHONE = "(min-resolution: 2.5dppx) calc(60vw - 1.2rem), calc(100vw - 2rem)";
export const CARD_SIZES_3 = `(min-width: 2560px) 475px, (min-width: 1920px) 450px, (min-width: 1280px) 400px, (min-width: 1024px) calc((100vw - 7rem) / 3), (min-width: 640px) calc((100vw - 5rem) / 2), ${PHONE}`;
export const CARD_SIZES_4 = `(min-width: 2560px) 360px, (min-width: 1920px) 340px, (min-width: 1280px) 300px, (min-width: 1024px) calc((100vw - 7rem) / 3), (min-width: 640px) calc((100vw - 5rem) / 2), ${PHONE}`;
