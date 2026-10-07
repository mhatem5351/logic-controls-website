/**
 * When src/scripts/site.ts loads a page feature (dynamic import: the preload scanner never sees it, so it stays out of
 * the first-paint window). Each helper does nothing on a page without the feature's element. While a feature's code
 * is on its way, a click on a link or button inside its element (a fast tap, Enter on a focused link) is held and
 * replayed once the code has run, so the first tap is never lost (e.g. a gallery thumbnail opens the lightbox, not the
 * bare image file).
 * If the code cannot load — after a deploy, a tab opened before it still asks for the previous build's chunks, which
 * are gone (CODE3-05) — a held tap reloads the page once per tab session (the visitor asked for that feature);
 * otherwise the page carries on without it and a held tap gets its default action.
 */
type Load = () => Promise<unknown>;

/** sessionStorage flag: this tab has already reloaded for a feature that failed to load (never a reload loop). */
const RELOADED = "lcReload";

/**
 * Reloads the page to get the current build, at most once per tab session. Returns false (and does nothing) when it
 * already did, or when sessionStorage is unavailable (no loop guard, so no reload).
 */
export function reloadOnce(): boolean {
  try {
    if (sessionStorage.getItem(RELOADED)) return false;
    sessionStorage.setItem(RELOADED, "1");
  } catch {
    return false;
  }
  location.reload();
  return true;
}

/** Returns the function that starts `load` (once); until it has run, clicks inside `selector` are held and replayed. */
function feature(selector: string, load: Load): () => void {
  let started = false;
  let ready = false;
  let held: HTMLElement | undefined;
  const hold = (e: MouseEvent) => {
    if (ready || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    // A link or button inside the feature's element only: a card link around a lazy picture is not the feature's.
    const t = (e.target as Element | null)?.closest?.<HTMLElement>("a[href], button");
    if (!t?.closest(selector)) return;
    e.preventDefault();
    e.stopPropagation();
    held = t;
    start();
  };
  const settle = (ok: boolean) => {
    ready = true;
    document.removeEventListener("click", hold, true);
    const t = held;
    held = undefined;
    // Never reload a form away (it may hold the visitor's input; the native form still works).
    if (!ok && t && !t.closest("form") && reloadOnce()) return;
    t?.click();
  };
  const start = () => {
    if (started) return;
    started = true;
    load().then(
      () => settle(true),
      () => settle(false),
    );
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

/** After the load event and an idle moment. */
function whenIdle(fn: () => void): void {
  afterLoad(() => ("requestIdleCallback" in window ? requestIdleCallback(() => fn(), { timeout: 2000 }) : setTimeout(fn, 1)));
}

/** After the load event and an idle moment: features that wait anyway (hero loop, hover replays). */
export function idle(selector: string, load: Load): void {
  if (document.querySelector(selector)) whenIdle(() => void load().catch(() => {}));
}

/**
 * When an element matching `selector` comes within `margin` of the viewport (an element inside `display: none` never
 * does), or as soon as the visitor touches / focuses / clicks one. In-view elements load at once. `idle`: also after
 * the load event and an idle moment, whichever comes first — for small chunks whose replayed tap changes the layout
 * (on a slow link a replay > 500 ms after the tap counts as an unexpected layout shift, PERF3-07).
 */
export function near(
  selector: string,
  load: Load,
  { margin = "1000px 0px", idle: soon = false }: { margin?: string; idle?: boolean } = {},
): void {
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
  if (soon) whenIdle(start);
}
