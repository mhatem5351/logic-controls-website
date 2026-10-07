/**
 * Home hero media (files in public/media/). Bump the -vN suffix whenever a file changes: /media/* is cached for
 * 30 days (public/_headers), so a changed file under the same name would not reach returning visitors.
 *
 * Desktop (≥1024px): 1920×1080 poster (AVIF, WebP fallback) = the LCP image, then the muted loop (AV1 WebM where the
 * browser decodes it, H.264 MP4 otherwise). Below 1024px: the poster in a visible band (480/640/960 w), no video.
 * All frames come from the 1080p master with the third-party product brand blurred (see the media notes in git log).
 */
export interface HeroVideo {
  /** H.264 MP4: every browser plays it. */
  src: string;
  /** AV1 WebM, tried first when `canPlayType` says "probably". */
  webm?: string;
  /** Desktop poster (WebP or JPEG, the largest file) and optional srcsets ("url 1280w, url 1920w") incl. AVIF. */
  poster: string;
  posterSrcset?: string;
  posterAvifSrcset?: string;
  width?: number;
  height?: number;
  /** Phones and tablets: srcset strings ("url 480w, url 640w, …") or a single URL. */
  posterSmall?: string;
  posterSmallAvif?: string;
}

/** 1×1 transparent GIF: the <source> a <picture> picks where it must not download anything (CSP allows data: images). */
export const BLANK_IMAGE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const M = "/media/hero-filling";
export const HOME_HERO_VIDEO: HeroVideo = {
  src: `${M}-v3.mp4`,
  webm: `${M}-v3.webm`,
  poster: `${M}-poster-v3.webp`,
  posterSrcset: `${M}-poster-v3-1280.webp 1280w, ${M}-poster-v3.webp 1920w`,
  posterAvifSrcset: `${M}-poster-v3-1280.avif 1280w, ${M}-poster-v3.avif 1920w`,
  width: 1920,
  height: 1080,
  posterSmall: [480, 640, 960].map((w) => `${M}-poster-v3-${w}.webp ${w}w`).join(", "),
  posterSmallAvif: [480, 640, 960].map((w) => `${M}-poster-v3-${w}.avif ${w}w`).join(", "),
};

/** The desktop panel is ~54vw wide but taller than 16:9 allows, so object-fit: cover needs about the viewport width. */
export const HERO_PANEL_SIZES = "100vw";

/** <BaseLayout preloadImage>: the desktop poster, only where it is the LCP image (keep in sync with Hero's breakpoint). */
export const HOME_HERO_PRELOAD = {
  href: `${M}-poster-v3.avif`,
  srcset: HOME_HERO_VIDEO.posterAvifSrcset,
  sizes: HERO_PANEL_SIZES,
  type: "image/avif",
  media: "(min-width: 1024px)",
};
