/** Props shared by every illustration component (and forwarded by ServiceArt / IndustryArt). */
export interface ArtProps {
  /**
   * "light" (cards, white sections) or "dark" (navy hero / bands).
   * Omit it to follow the surface: inside an `.on-dark` ancestor the dark palette is used automatically.
   */
  variant?: "light" | "dark";
  /** Rendered width: a number (px) or any CSS length. Default: 100% of the container (the art is responsive). */
  size?: number | string;
  /** Accessible name. Without it the art is decorative (`aria-hidden`); with it, `role="img"` + `aria-label`. */
  label?: string;
  /** Extra classes on the root <svg>. */
  class?: string;
}

import { uid as baseUid } from "../uid";

/** Per-instance id prefix (ends with "-") so <defs> ids never collide when the same art appears twice on a page.
 *  Same counter as every other generated id (src/components/uid.ts). */
export function uid(prefix: string): string {
  return `${baseUid(prefix)}-`;
}
