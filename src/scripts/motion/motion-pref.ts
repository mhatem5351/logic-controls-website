/**
 * Site-wide "Pause animations" preference (WCAG 2.2.2) — the one switch every decorative loop listens to.
 * Client-side module (reads document / matchMedia on import): import it from <script> tags only.
 *
 * Contract (stable; used by MotionToggle, play-when-visible, CircuitTraces, the hero video, HMI, ControlLoop, map):
 *  - `<html data-motion="off">` ⇔ decorative motion must be still. Absent ⇔ motion allowed. Set before first paint by
 *    the BaseLayout head script, so CSS can rely on it from frame 1: `:root[data-motion="off"] …` (see motion.css).
 *  - `prefers-reduced-motion: reduce` always means "off" (the OS setting is a floor the toggle cannot lift).
 *  - The user's choice persists in `localStorage.lcMotion` ("off" | "on"); written only on a toggle press.
 *  - Every change dispatches `document` event "lc:motion" with `detail: { off: boolean }` (toggle press, OS setting
 *    change, or a change made in another tab).
 */
const KEY = "lcMotion";
const EVENT = "lc:motion";
const root = document.documentElement;
const reduce = matchMedia("(prefers-reduced-motion: reduce)");

export type MotionChange = CustomEvent<{ off: boolean }>;

/** True while decorative motion must be still (user paused it, or the OS asks for reduced motion). */
export const motionOff = (): boolean => root.dataset.motion === "off";
/** True when the OS asks for reduced motion (the toggle then can't switch motion on). */
export const systemReduced = (): boolean => reduce.matches;

function stored(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function apply(off: boolean): void {
  if (off === motionOff()) return;
  if (off) root.dataset.motion = "off";
  else delete root.dataset.motion;
  document.dispatchEvent(new CustomEvent(EVENT, { detail: { off } }));
}

/** Persist the user's choice and apply it (reduced motion still wins). */
export function setMotionOff(off: boolean): void {
  try {
    localStorage.setItem(KEY, off ? "off" : "on");
  } catch {}
  apply(off || reduce.matches);
}

/** Subscribe to changes. Returns an unsubscribe function. */
export function onMotionChange(cb: (off: boolean) => void): () => void {
  const h = (e: Event) => cb((e as MotionChange).detail.off);
  document.addEventListener(EVENT, h);
  return () => document.removeEventListener(EVENT, h);
}

const resync = () => apply(reduce.matches || stored() === "off");
reduce.addEventListener("change", resync);
addEventListener("storage", (e) => e.key === KEY && resync());
