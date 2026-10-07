/**
 * The site's client entry: ONE module per page (BaseLayout), instead of one per component (PERF2-01).
 *
 * `import "<component>.astro?lc-script"` pulls that component's own <script> blocks in here (integrations/site-scripts.mjs):
 * the code stays in the component, the page gets no separate <script> for it. Each block keeps its own scope and still
 * guards on its own elements, so it does nothing on a page without the component.
 *
 * - Bundled (run at DOMContentLoaded, as before): what the first screen and the first tap need — header, menus and
 *   drawer, language links, copy buttons, the motion switch, the floating button, and the small component
 *   controllers (tables of contents, collapsible panels, the HMI bootstrap that fits the mimic before it is seen).
 *   Bundled code runs on every page, so it must find its own elements by selectors only its component renders.
 * - On demand (own chunks via dynamic import, never in the first-paint window; see ./site-load.ts): heavy or
 *   below-the-fold features, loaded when their element comes near the viewport or is touched, or after the load event.
 * - At once but only where needed (own chunk, fetched right away on the page that has the element): the RFQ form
 *   (it re-lays itself out as a stepper, so it must not wait), the thank-you page's reference box and the page
 *   scripts (home, privacy, foreign manufacturers).
 * A component script added later and not listed here still works (Astro bundles it on its own); the build warns and
 * tests/static/check-budgets.mjs counts module scripts per page. Site-wide modules (not component scripts) are plain
 * imports here, never a second <script> in BaseLayout: a module shared by two entries becomes a chained request.
 */
import { afterLoad, idle, near, now } from "./site-load";

// Left to Astro on purpose (an inline module on its page, no request): it must hide the native controls before WebKit
// draws them, i.e. without waiting for this file. lc-own: ~/components/VideoPlayer.astro

// Contact-channel click counts (UX2-18): one delegated listener for the whole page.
import "./analytics";
// Copied text without the invisible line-break hints of the text engine (CS2-13).
import "./clean-copy";

import "~/components/Header.astro?lc-script";
import "~/components/HeaderDrawer.astro?lc-script";
import "~/components/LanguageSwitcher.astro?lc-script";
import "~/components/CopyEmail.astro?lc-script";
import "~/components/MotionToggle.astro?lc-script";
import "~/components/WhatsAppButton.astro?lc-script";
import "~/components/sections/main/PageToc.astro?lc-script";
import "~/components/sections/main/ChecklistPanel.astro?lc-script";
import "~/components/sections/main/DemoTeaser.astro?lc-script";
import "~/components/motion/HmiDemo.astro?lc-script";

// Page-specific, needed at once. Page scripts load only on their own page: their selectors are generic (the home's
// "Show all" handler, [data-cap], would also grab the foreign page's list).
if (/^\/[a-z]{2}\/$/.test(location.pathname)) now("[data-snap], [data-cap]", () => import("~/pages/[lang]/index.astro?lc-script"));
now("[data-toc]", () => import("~/pages/[lang]/privacy.astro?lc-script"));
now(".lc-cap-needs[data-cap]", () => import("~/pages/[lang]/foreign-manufacturers.astro?lc-script"));
now("form[data-rfq]", () => import("~/components/sections/main/RfqForm.astro?lc-script"));
now("[data-ref-box]", () => import("~/pages/[lang]/contact/thanks/index.astro?lc-script"));
// Waits for first paint + 2.4 s anyway (desktop loop); hover replays.
idle(".lc-hero-video[data-src]", () => import("~/components/Hero.astro?lc-script"));
if (matchMedia("(any-hover: hover)").matches) idle(".lc-traces", () => import("~/components/CircuitTraces.astro?lc-script")); // mouse only
// Near the viewport (1000px) or on first touch / focus.
near("[data-lca]", () => import("~/components/illustrations/ArtFrame.astro?lc-script"));
near("[data-loop]", () => import("~/components/motion/ControlLoop.astro?lc-script"));
// Small, and a replayed tap expands content: also at idle, so a tap rarely has to wait (PERF3-07).
near("[data-zones]", () => import("~/components/sections/main/ZonesBlock.astro?lc-script"), { idle: true });
near("[data-gallery]", () => import("~/components/Gallery.astro?lc-script"), { idle: true });

// Lazy illustration fragments: not before the load event (PERF2-07), then as their slots come near. Except the card a
// view transition is morphing into (back / up from its detail page; BaseLayout names it at pagereveal, which comes
// before or after this module): at once, so the flight lands on its picture, not on an empty box (MOT3-02).
const lazyArt = () => import("~/components/illustrations/LazyArt.astro?lc-script");
const morph = () => {
  if (!document.querySelector('svg[data-art-src][style*="view-transition-name"]')) return false;
  void lazyArt().catch(() => {});
  return true;
};
if (!morph()) addEventListener("pagereveal", morph, { once: true });
afterLoad(() => near("svg[data-art-src]", lazyArt));
// A detail page warms what going back / up to its index needs: the index's art fragment (~15 KB, cached as immutable)
// and the code that fills the cards. Not with Save-Data.
const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
const warm = (url = "") => fetch(url, { priority: "low" } as RequestInit).then((r) => r.arrayBuffer());
if (!saveData)
  idle("[data-art-warm]", () => Promise.all([warm(document.querySelector<HTMLElement>("[data-art-warm]")?.dataset.artWarm), lazyArt()]));
