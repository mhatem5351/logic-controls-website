/**
 * Responsive image `sizes` / `widths` for card grids, matched to the real rendered box (not a viewport fraction):
 * the site container caps at 78rem (1248px), so a 3-up card is ~395px on any desktop wider than 1280px.
 * Widths stop at 800 (a 2x cap): a card is never wider than ~470 CSS px, so 800w covers 2x screens, and high-density
 * phones (DPR 2.6-3) get 800w for their ~380px card instead of a 1200w file that is ~1.5x heavier and not visibly sharper.
 *
 *   CARD_SIZES_3   project cards: 1 col (phone) · 2 col (≥640) · 3 col (≥1024) — projects index, related projects
 *   CARD_SIZES_4   industry / service cards (lc-grid-*): 1 · 2 · 3 (≥1024) · 4 (≥1280)
 */
export const CARD_WIDTHS = [320, 480, 640, 800];
export const CARD_SIZES_3 = "(min-width: 1280px) 400px, (min-width: 1024px) calc((100vw - 7rem) / 3), (min-width: 640px) calc((100vw - 5rem) / 2), calc(100vw - 2rem)";
export const CARD_SIZES_4 = "(min-width: 1280px) 300px, (min-width: 1024px) calc((100vw - 7rem) / 3), (min-width: 640px) calc((100vw - 5rem) / 2), calc(100vw - 2rem)";
