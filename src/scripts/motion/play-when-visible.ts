/**
 * Play scheduler for the decorative illustrations ([data-lca], src/components/illustrations). Policy (motion.css §6):
 * a loop plays, then rests — nothing decorative loops forever (WCAG 2.2.2), and an idle page costs ~0% CPU.
 *
 *  - A piece starts when at least 35% of it is in view and a slot is free: at most MAX (2) pieces animate at once, the
 *    others wait in reading order, so a card grid "scans" two at a time, like a PLC scan cycle.
 *  - It plays CYCLES master cycles (1 inside a card grid, 2 for a standalone piece such as a detail hero), then rests:
 *    `data-play="rest"` — CSS removes its animations and shows the informative still pose (the reduced-motion pose).
 *    The master cycle is the longest animation in the piece (all sub-loops divide it, STYLE.md), so it rests on a
 *    cycle boundary.
 *  - Hover / keyboard focus on its card (`.group`, or the piece itself) replays it: it takes a slot (pausing the
 *    longest-running automatic piece if needed), plays while hovered, and rests at the end of the cycle after leave.
 *  - Leaving the viewport mid-turn: it rests and waits for its next turn (nothing freezes mid-pose offscreen).
 *    In a hidden tab: paused mid-cycle (`data-play="0"`), the remaining time is kept.
 *  - html[data-motion="off"] ("Pause animations", or reduced motion): everything rests; switching motion back on
 *    replays the pieces in view.
 *
 * `data-play` values: "1" playing · "0" paused mid-cycle · "rest" still (also the server-rendered state, so nothing
 * animates before its turn, and without JS the art is simply still).
 */
import { motionOff, onMotionChange } from "./motion-pref";

const SEL = "[data-lca]";
const MAX = 2;
const MIN_RATIO = 0.35;

type State = "wait" | "play" | "done";
interface Piece {
  el: Element;
  state: State;
  /** Cycles to play this turn. */
  cycles: number;
  /** Master cycle (ms), measured on first play. */
  cycle: number;
  /** ms played in the current turn. */
  played: number;
  /** performance.now() when the current run started (while data-play="1"). */
  since: number;
  timer: number;
  ratio: number;
  onscreen: boolean;
  hover: boolean;
}

const pieces = new Map<Element, Piece>();
let io: IntersectionObserver | undefined;

const running = (p: Piece) => p.el.getAttribute("data-play") === "1";
const set = (p: Piece, v: "1" | "0" | "rest") => p.el.setAttribute("data-play", v);
const allowed = () => !motionOff() && !document.hidden;

function measure(p: Piece): number {
  if (p.cycle) return p.cycle;
  let max = 0;
  for (const a of p.el.getAnimations({ subtree: true })) {
    const d = Number(a.effect?.getComputedTiming().duration);
    if (Number.isFinite(d) && d > max) max = d;
  }
  const own = Number((p.el as HTMLElement).dataset.cycle);
  return (p.cycle = own > 0 ? own : Math.min(12000, Math.max(3000, max || 6000)));
}

function stopClock(p: Piece) {
  clearTimeout(p.timer);
  if (running(p)) p.played += performance.now() - p.since;
}

function arm(p: Piece) {
  clearTimeout(p.timer);
  const total = p.cycles * p.cycle;
  p.timer = window.setTimeout(() => finish(p), Math.max(0, total - p.played));
}

function start(p: Piece) {
  const fresh = p.state !== "play";
  p.state = "play";
  if (fresh) p.played = 0;
  set(p, "1");
  p.since = performance.now();
  measure(p);
  arm(p);
}

function pause(p: Piece) {
  if (!running(p)) return;
  stopClock(p);
  set(p, "0");
}

function rest(p: Piece, state: State = "done") {
  stopClock(p);
  p.state = state;
  p.played = 0;
  set(p, "rest");
}

function finish(p: Piece) {
  p.played += performance.now() - p.since;
  p.since = performance.now();
  if (p.hover && allowed()) {
    // still hovered: keep playing, check again at the end of the next cycle
    p.cycles = Math.round(p.played / p.cycle) + 1;
    arm(p);
    return;
  }
  rest(p);
  schedule();
}

/** Fill the free slots with waiting pieces in view, in reading order. A piece that leaves the viewport mid-turn
 *  goes back to waiting (it rests, so nothing freezes mid-pose); in a hidden tab playing pieces are paused. */
function schedule() {
  if (motionOff()) return;
  const all = [...pieces.values()];
  if (document.hidden) {
    for (const p of all) if (p.state === "play") pause(p);
    return;
  }
  let active = 0;
  for (const p of all) {
    if (p.state !== "play") continue;
    if (!p.onscreen) {
      rest(p, "wait");
      continue;
    }
    if (!running(p)) {
      set(p, "1");
      p.since = performance.now();
      arm(p);
    }
    active++;
  }
  const waiting = all
    .filter((p) => p.state === "wait" && p.onscreen && p.ratio >= MIN_RATIO)
    .sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  for (const p of waiting) {
    if (active >= MAX) break;
    start(p);
    active++;
  }
}

function replay(p: Piece) {
  p.hover = true;
  if (!allowed() || p.state === "play") return;
  // take a slot: if both are busy, the automatic piece that has played longest rests now
  const busy = [...pieces.values()].filter((q) => q.state === "play" && q.onscreen && running(q) && !q.hover);
  if (busy.length >= MAX) {
    const now = performance.now();
    busy.sort((a, b) => b.played + (now - b.since) - (a.played + (now - a.since)));
    rest(busy[0]!, "done");
  }
  p.cycles = 1;
  start(p);
}

function observe(el: Element) {
  if (pieces.has(el)) return;
  const p: Piece = {
    el,
    state: "wait",
    cycles: el.closest(".group") ? 1 : 2,
    cycle: 0,
    played: 0,
    since: 0,
    timer: 0,
    ratio: 0,
    onscreen: false,
    hover: false,
  };
  pieces.set(el, p);
  if (!el.hasAttribute("data-play")) set(p, "rest");
  io!.observe(el);
  const host = el.closest(".group") ?? el;
  const enter = () => replay(p);
  const leave = () => {
    p.hover = false;
  };
  host.addEventListener("pointerenter", (e) => (e as PointerEvent).pointerType === "mouse" && enter());
  host.addEventListener("pointerleave", leave);
  host.addEventListener("focusin", enter);
  host.addEventListener("focusout", leave);
}

/** Register every illustration under `root` (call again after injecting art). */
export function playWhenVisible(root: ParentNode = document): void {
  if (typeof IntersectionObserver === "undefined") return;
  io ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const p = pieces.get(e.target);
        if (!p) continue;
        p.onscreen = e.isIntersecting;
        p.ratio = e.intersectionRatio;
      }
      schedule();
    },
    { threshold: [0, MIN_RATIO] },
  );
  root.querySelectorAll(SEL).forEach(observe);
  if (root instanceof Element && root.matches(SEL)) observe(root);
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", schedule);
  onMotionChange((off) => {
    for (const p of pieces.values()) {
      if (off) rest(p, p.state === "play" ? "wait" : p.state);
      else if (p.onscreen) p.state = "wait";
    }
    schedule();
  });
}
