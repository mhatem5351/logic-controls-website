/**
 * Site-wide "Pause animations" preference (WCAG 2.2.2) — the one switch every decorative loop listens to.
 * Client-side module (reads document / matchMedia on import): import it from <script> tags only.
 *
 * Contract (stable; used by MotionToggle, play-when-visible, CircuitTraces, the hero video, HMI, ControlLoop, map):
 *  - `<html data-motion="off">` ⇔ decorative motion must be still. Absent ⇔ motion allowed. Set before first paint by
 *    the BaseLayout head script, so CSS can rely on it from frame 1: `:root[data-motion="off"] …` (see motion.css).
 *  - `prefers-reduced-motion: reduce` always means "off" (the OS setting is a floor the toggle cannot lift), and it
 *    sets the same attribute, so ONE still pose serves both (motion.css §0). Scripts never read the media query
 *    themselves: they call motionOff() / scrollBehavior().
 *  - The user's choice persists in `localStorage.lcMotion` ("off" | "on"); written only on a toggle press.
 *  - Every change dispatches `document` event "lc:motion" with `detail: { off, locked }` (toggle press, OS setting
 *    change, or a change made in another tab). It also fires when only `locked` (the OS floor) changed, so a
 *    "locked by your device" state can never go stale.
 *  - Switching motion back ON does not replay first-load entrances (hero settle, LED strike, edge / trace draw-in,
 *    logo signal, floating-button ping): they count as played (html[data-vt], motion.css §2 / §6).
 */
const KEY = "lcMotion";
const EVENT = "lc:motion";
const root = document.documentElement;
const reduce = matchMedia("(prefers-reduced-motion: reduce)");

type MotionChange = CustomEvent<{ off: boolean; locked: boolean }>;

/** True while decorative motion must be still (user paused it, or the OS asks for reduced motion). */
export const motionOff = (): boolean => root.dataset.motion === "off";
/** True when the OS asks for reduced motion (the toggle then can't switch motion on). */
export const systemReduced = (): boolean => reduce.matches;
/** `behavior` for scripted scrolls (scrollIntoView / scrollTo / scrollBy): instant while motion is off. An explicit
 *  "smooth" overrides the CSS `scroll-behavior: auto` catch-all, so every scripted scroll must ask here. */
export const scrollBehavior = (): ScrollBehavior => (motionOff() ? "auto" : "smooth");

function stored(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function apply(off: boolean, force = false): void {
  if (off === motionOff() && !force) return;
  if (off) root.dataset.motion = "off";
  else {
    delete root.dataset.motion;
    // MOT2-20: the entrances were "played" while motion was off — switching it back on must not reboot the page.
    root.dataset.vt = "";
    delete root.dataset.intro;
    delete root.dataset.fabPing;
  }
  document.dispatchEvent(new CustomEvent(EVENT, { detail: { off, locked: reduce.matches } }));
}

/** Persist the user's choice and apply it (reduced motion still wins). */
export function setMotionOff(off: boolean): void {
  try {
    localStorage.setItem(KEY, off ? "off" : "on");
  } catch {}
  apply(off || reduce.matches);
}

/** Subscribe to changes (`locked`: the OS asks for reduced motion). Returns an unsubscribe function. */
export function onMotionChange(cb: (off: boolean, locked: boolean) => void): () => void {
  const h = (e: Event) => {
    const d = (e as MotionChange).detail;
    cb(d.off, d.locked);
  };
  document.addEventListener(EVENT, h);
  return () => document.removeEventListener(EVENT, h);
}

const resync = (force = false) => apply(reduce.matches || stored() === "off", force);
reduce.addEventListener("change", () => resync(true)); // `locked` changed even when `off` did not
addEventListener("storage", (e) => e.key === KEY && resync());
