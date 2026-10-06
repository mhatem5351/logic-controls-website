/**
 * Shared play-state helper for the decorative SVG/CSS illustrations (src/components/illustrations).
 *
 * - One IntersectionObserver for every `[data-lca]` element: `data-play="0"` while offscreen or while
 *   the tab is hidden, `"1"` otherwise. CSS pauses every animation inside `[data-play="0"]`.
 * - Hovering / focusing a parent `.group` card smoothly speeds the loop up (updatePlaybackRate keeps
 *   the current position, so there is no jump).
 * - Reduced motion is handled in CSS (animations are removed), so nothing here needs to know about it.
 */
const SEL = "[data-lca]";
const visible = new WeakMap<Element, boolean>();
let io: IntersectionObserver | undefined;

function sync(el: Element) {
  el.setAttribute("data-play", visible.get(el) && !document.hidden ? "1" : "0");
}

function rate(el: Element, r: number) {
  for (const a of el.getAnimations({ subtree: true })) a.updatePlaybackRate(r);
}

export function playWhenVisible(root: ParentNode = document): void {
  if (typeof IntersectionObserver === "undefined") return;
  io ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        visible.set(e.target, e.isIntersecting);
        sync(e.target);
      }
    },
    { rootMargin: "80px 0px" },
  );
  for (const el of root.querySelectorAll(SEL)) {
    if (visible.has(el)) continue;
    visible.set(el, false);
    io.observe(el);
    const card = el.closest(".group");
    if (!card) continue;
    const fast = () => rate(el, 1.6);
    const slow = () => rate(el, 1);
    card.addEventListener("pointerenter", fast);
    card.addEventListener("pointerleave", slow);
    card.addEventListener("focusin", fast);
    card.addEventListener("focusout", slow);
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => document.querySelectorAll(SEL).forEach(sync));
}
