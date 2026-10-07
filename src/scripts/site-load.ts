/**
 * When src/scripts/site.ts loads a page feature (dynamic import: the preload scanner never sees it, so it stays out of
 * the first-paint window). Each helper does nothing on a page without the feature's element. While a feature's code
 * is on its way, a click inside its element (a fast tap, Enter on a focused link) is held and replayed once the code
 * has run, so the first tap is never lost (e.g. a gallery thumbnail opens the lightbox, not the bare image file).
 */
type Load = () => Promise<unknown>;

/** Returns the function that starts `load` (once); until it has run, clicks inside `selector` are held and replayed. */
function feature(selector: string, load: Load): () => void {
  let started = false;
  let ready = false;
  let held: HTMLElement | undefined;
  const hold = (e: MouseEvent) => {
    if (ready || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const t = (e.target as Element | null)?.closest?.(selector) && (e.target as Element).closest<HTMLElement>("a[href], button");
    if (!t) return;
    e.preventDefault();
    e.stopPropagation();
    held = t;
    start();
  };
  const done = () => {
    ready = true;
    document.removeEventListener("click", hold, true);
    const t = held;
    held = undefined;
    t?.click();
  };
  const start = () => {
    if (started) return;
    started = true;
    load().then(done, done);
  };
  document.addEventListener("click", hold, true);
  return start;
}

/** At once, on pages that have the element (its code is only fetched there). */
export function now(selector: string, load: Load): void {
  if (document.querySelector(selector)) feature(selector, load)();
}

/** After the load event (now, if it has fired). */
export function afterLoad(fn: () => void): void {
  if (document.readyState === "complete") fn();
  else addEventListener("load", () => fn(), { once: true });
}

/** After the load event and an idle moment: features that wait anyway (hero loop, hover replays). */
export function idle(selector: string, load: Load): void {
  if (!document.querySelector(selector)) return;
  afterLoad(() =>
    "requestIdleCallback" in window
      ? requestIdleCallback(() => void load().catch(() => {}), { timeout: 2000 })
      : setTimeout(() => void load().catch(() => {}), 1),
  );
}

/**
 * When an element matching `selector` comes within `margin` of the viewport (an element inside `display: none` never
 * does), or as soon as the visitor touches / focuses / clicks one. In-view elements load at once.
 */
export function near(selector: string, load: Load, margin = "1000px 0px"): void {
  const els = document.querySelectorAll(selector);
  if (!els.length) return;
  const start = feature(selector, () => {
    io?.disconnect();
    document.removeEventListener("pointerdown", early, true);
    document.removeEventListener("focusin", early, true);
    return load();
  });
  const early = (e: Event) => (e.target as Element | null)?.closest?.(selector) && start();
  const io =
    "IntersectionObserver" in window
      ? new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && start(), { rootMargin: margin })
      : undefined;
  document.addEventListener("pointerdown", early, { capture: true, passive: true });
  document.addEventListener("focusin", early, true);
  if (io) els.forEach((el) => io.observe(el));
  else start();
}
