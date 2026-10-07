/**
 * Play scheduler for the decorative illustrations ([data-lca], src/components/illustrations). Policy (motion.css §6):
 * a loop plays, then rests — nothing decorative loops forever (WCAG 2.2.2), and an idle page costs ~0% CPU.
 *
 *  - The tape never jumps (MOT2-03). Between turns a piece is PARKED on a frame of its own loop: normally its rest
 *    frame (`data-rest-at`, the loop frame closest to the authored still pose: outputs lit, screens filled). A turn
 *    starts from the frame on screen, eases up to speed (SPIN_UP), and eases to a stop exactly on the next rest frame
 *    (SPIN_DOWN). Parked = `data-play="hold"`: the frame's animated values are written as inline styles and the CSS
 *    loops are removed (paused loops would still cost time in every frame another piece animates); the next turn
 *    removes them again and seeks the recreated loops to the same loop time, so nothing moves at the swap.
 *    The server-rendered still pose (`data-play="rest"`) is swapped for the rest frame before the piece is first
 *    painted (lazy-art.ts fills a slot and registers it in the same task; ArtFrame — for detail-hero art HeroArt —
 *    parks inline art in the first animation frame), so with motion on it is never seen. It stays the pose for no-JS, reduced motion and
 *    "Pause animations" (html[data-motion="off"]), where everything rests and the swap happens once, on request.
 *  - A piece starts when at least 35% of it is in view and a slot is free: at most MAX (2) pieces animate at once, the
 *    others wait in reading order, so a card grid "scans" two at a time, like a PLC scan cycle.
 *  - It plays CYCLES master cycles (1 inside a card grid, 2 for a standalone piece such as a detail hero). The master
 *    cycle is the longest animation in the piece (all sub-loops divide it, STYLE.md), so every turn ends on the rest frame.
 *  - Hover / keyboard focus on its card (`.group`; or a mouse over the piece itself) replays it: it takes a slot (the
 *    longest-running automatic piece runs on to its rest frame if that is close, else eases to a stop where it is),
 *    plays while hovered, and stops on the next rest frame after leave. Focus listeners go on the card only: Blink makes
 *    an <svg> focusable as soon as it has focus listeners, which made decorative art a Tab stop (A11Y2-01).
 *  - Leaving the viewport mid-turn: it stops where it is and waits; its next turn finishes the interrupted cycle.
 *    In a hidden tab: paused mid-cycle (`data-play="0"`), resumed when visible.
 *  - Motion switched back on: the pieces in view take a turn again. Nothing starts during a page transition.
 *
 * `data-play` values: "1" playing · "0" loops paused (transient, hidden tab) · "hold" parked on a frame (inline
 * styles, no loops) · "rest" still pose.
 */
import { motionOff, onMotionChange } from "./motion-pref";

const SEL = "[data-lca]";
const MAX = 2;
const MIN_RATIO = 0.35;
/** ms of wall time to ease a stopped tape up to speed. */
const SPIN_UP = 360;
/** ms of wall time to ease the tape to a stop; at a linear deceleration it covers SPIN_DOWN / 2 ms of the loop. */
const SPIN_DOWN = 560;
/** An evicted piece whose rest frame is at most this far (ms of loop) runs on to it instead of stopping mid-cycle. */
const EVICT_RUN = 1500;
/** A piece that stopped in view keeps its paused loops this long before it is parked: parking swaps Chromium's
 *  rendering of an animated SVG for the static one (a sub-pixel shift of the drawing), which then happens once the
 *  eye has moved on to the next pieces, not at the moment the piece comes to rest. */
const PARK_AFTER = 1500;
/** Keyframe members that are not CSS properties. */
const META = new Set(["offset", "computedOffset", "easing", "composite"]);

type State = "wait" | "play" | "done";
type Play = "1" | "0" | "hold" | "rest";
interface Piece {
  el: Element;
  state: State;
  /** Cycles to play this turn. */
  cycles: number;
  /** Master cycle (ms), measured once its animations exist. */
  cycle: number;
  /** Rest frame (ms into the master cycle). */
  restAt: number;
  /** Loop time (ms, the CSS animations' currentTime) at which the current turn started / stops. */
  from: number;
  end: number;
  /** Swapped from the still pose to a loop frame (since registration, or since motion was switched back on). */
  primed: boolean;
  /** Loop time of the parked frame while `data-play="hold"`. */
  at: number;
  /** Inline styles written while parked: element, property, the element's own inline value before (restored). */
  saved: [ElementCSSInlineStyle, string, string][];
  timer: number;
  /** Pending delayed park (PARK_AFTER). */
  parkTimer: number;
  /** requestAnimationFrame id of a running spin-up / spin-down (0: none). */
  ramp: number;
  /** The running ramp is a spin-down. */
  down: boolean;
  ratio: number;
  onscreen: boolean;
  hover: boolean;
}

const pieces = new Map<Element, Piece>();
let io: IntersectionObserver | undefined;

const isCss = (a: Animation) => typeof CSSAnimation === "undefined" || a instanceof CSSAnimation;
/** The piece's own CSS loops (not a Web Animation on the root, e.g. lazy-art's fill-in fade). Flushes style. */
const anims = (p: Piece): Animation[] =>
  p.el.getAnimations({ subtree: true }).filter((a) => isCss(a) && (a.effect as KeyframeEffect | null)?.target !== p.el);
const pos = (list: Animation[]) => Number(list[0]?.currentTime ?? 0);
const seek = (list: Animation[], t: number) => list.forEach((a) => (a.currentTime = t));
const rate = (list: Animation[], r: number) => list.forEach((a) => (a.playbackRate = r));
const play = (p: Piece) => p.el.getAttribute("data-play");
const running = (p: Piece) => play(p) === "1";
const set = (p: Piece, v: Play) => p.el.setAttribute("data-play", v);
const allowed = () => !motionOff() && !document.hidden;
const kebab = (s: string) => (s.startsWith("--") ? s : s.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase()));

function measure(p: Piece, list: Animation[]): void {
  if (p.cycle || !list.length) return;
  let max = 0;
  for (const a of list) {
    const d = Number(a.effect?.getComputedTiming().duration);
    if (Number.isFinite(d) && d > max) max = d;
  }
  const own = Number((p.el as HTMLElement).dataset.cycle);
  p.cycle = own > 0 ? own : Math.min(12000, Math.max(3000, max || 6000));
  p.restAt = (Math.max(0, Number((p.el as HTMLElement).dataset.restAt) || 0) * 1000) % p.cycle;
}

/** Park: write the current frame's animated values inline, then drop the loops ("hold"). Same task, so no paint
 *  ever sees a different pose. Batched: every read first (one style flush), then every write. */
function holdMany(ps: Piece[]): void {
  const jobs: [Piece, number, [Element & ElementCSSInlineStyle, string, string][]][] = [];
  for (const p of ps) {
    clearTimeout(p.parkTimer);
    if (play(p) !== "0") continue;
    const list = anims(p);
    if (!list.length) continue;
    const reads: [Element & ElementCSSInlineStyle, string, string][] = [];
    for (const a of list) {
      const fx = a.effect as KeyframeEffect;
      const el = fx.target as (Element & ElementCSSInlineStyle) | null;
      if (!el?.style) continue;
      const cs = getComputedStyle(el);
      const props = new Set<string>();
      for (const k of fx.getKeyframes()) for (const key of Object.keys(k)) if (!META.has(key)) props.add(kebab(key));
      for (const prop of props) reads.push([el, prop, cs.getPropertyValue(prop)]);
    }
    jobs.push([p, pos(list), reads]);
  }
  for (const [p, at, reads] of jobs) {
    set(p, "hold");
    p.saved = reads.map(([el, prop, v]) => {
      const own = el.style.getPropertyValue(prop);
      el.style.setProperty(prop, v);
      return [el, prop, own];
    });
    p.at = at;
  }
}
const hold = (p: Piece) => holdMany([p]);

/** Undo a hold's inline styles (the loops come back with the next data-play change). */
function unhold(p: Piece): void {
  for (const [el, prop, own] of p.saved) {
    if (own) el.style.setProperty(prop, own);
    else el.style.removeProperty(prop);
  }
  p.saved = [];
}

/** Bring a parked piece's loops back, paused on the frame it was holding. */
function release(p: Piece): Animation[] {
  clearTimeout(p.parkTimer);
  if (play(p) !== "hold") return anims(p);
  unhold(p);
  set(p, "0");
  const list = anims(p); // recreated (currentTime 0) …
  seek(list, p.at); // … and back on the held frame before anything is painted
  return list;
}

/** Swap the still pose for the rest frame and park there (at registration, and after motion was switched back on).
 *  Batched, phase by phase (all writes, then all reads…), so a grid of pieces costs a few style flushes, not a few per
 *  piece; `park` false leaves them paused (a piece about to start). */
function primeMany(ps: Piece[], park = true): void {
  if (motionOff()) return;
  const todo = ps.filter((p) => !p.primed);
  for (const p of todo) if (play(p) === "rest") set(p, "0");
  const lists = todo.map((p) => [p, anims(p)] as const); // the first call flushes style: the paused loops exist now
  const done: Piece[] = [];
  for (const [p, list] of lists) {
    if (!list.length) continue; // not rendered (display: none): primed at its first turn
    measure(p, list);
    if (Math.abs(pos(list) - p.restAt) > 1) seek(list, p.restAt); // ArtFrame's inline script may have done it
    p.primed = true;
    done.push(p);
  }
  if (park) holdMany(done);
}
const prime = (p: Piece) => primeMany([p], false);
/** Pieces registered before the same frame (a grid's slots filled together) are primed together, before the next
 *  paint: in that frame's animation callbacks, whose style flush the frame needed anyway, not in the registering task
 *  (an extra forced style + layout pass while the module evaluates). */
const primeQueue = new Set<Piece>();
function primeSoon(p: Piece): void {
  primeQueue.add(p);
  if (primeQueue.size === 1)
    requestAnimationFrame(() => {
      const ps = [...primeQueue];
      primeQueue.clear();
      primeMany(ps);
    });
}

/** Stop the tape (optionally exactly on loop time `at`) and park there: at once when `park` is "now" (offscreen),
 *  after PARK_AFTER when "later" (it stopped in view), never when false (hidden tab: it resumes). */
function freeze(p: Piece, at?: number, park: "now" | "later" | false = "later"): void {
  clearTimeout(p.timer);
  cancelAnimationFrame(p.ramp);
  p.ramp = 0;
  p.down = false;
  if (play(p) === "hold") return;
  set(p, "0");
  const list = anims(p);
  rate(list, 1);
  if (at !== undefined) seek(list, at);
  if (park === "now") hold(p);
  else if (park) {
    clearTimeout(p.parkTimer);
    p.parkTimer = window.setTimeout(() => p.state !== "play" && hold(p), PARK_AFTER);
  }
}

/** Ease the playback rate from where it is to 1 (up) or to 0 (down), then call `done`. A spin-down with a `target`
 *  (loop time) steers the deceleration so the tape comes to rest exactly there. */
function spin(p: Piece, up: boolean, done?: () => void, target?: number): void {
  cancelAnimationFrame(p.ramp);
  const list = anims(p);
  const t0 = performance.now();
  const T = up ? SPIN_UP : SPIN_DOWN;
  const from = Number(list[0]?.playbackRate ?? 1);
  p.down = !up;
  const step = () => {
    const el = performance.now() - t0;
    const k = Math.min(1, el / T);
    let r: number;
    if (up) r = from + (1 - from) * (1 - (1 - k) * (1 - k)); // quick, then settling on full speed
    else if (target === undefined) r = from * (1 - k); // linear: a full-speed tape covers T/2 before it stops
    else r = Math.min(1.25, Math.max(0, (2 * (target - pos(list))) / Math.max(16, T - el))); // linear decel onto target
    rate(list, r);
    if (k < 1) p.ramp = requestAnimationFrame(step);
    else {
      p.ramp = 0;
      p.down = false;
      done?.();
    }
  };
  p.ramp = requestAnimationFrame(step);
}

/** Wait until the tape reaches the point where the spin-down must begin, so it stops exactly on `end`. */
function arm(p: Piece): void {
  clearTimeout(p.timer);
  const left = p.end - SPIN_DOWN / 2 - pos(anims(p));
  if (left > 24) p.timer = window.setTimeout(() => arm(p), left); // re-checked: the spin-up runs slower than the clock
  else due(p);
}

function due(p: Piece): void {
  if (p.hover && allowed()) {
    // still hovered: keep playing to the next rest frame
    p.end += p.cycle;
    arm(p);
    return;
  }
  spin(
    p,
    false,
    () => {
      freeze(p, p.end);
      p.state = "done";
      schedule();
    },
    p.end,
  );
}

function run(p: Piece): void {
  const list = release(p);
  set(p, "1");
  rate(list, 0); // a stopped tape starts from standstill
  spin(p, true);
  arm(p);
}

function start(p: Piece): void {
  prime(p);
  const list = release(p);
  measure(p, list);
  p.state = "play";
  const now = pos(list);
  // the next rest frame at least (cycles − ¾) cycles ahead: a whole turn from a rest frame, or the remainder of an
  // interrupted cycle (never a stub of a few hundred ms)
  const k = Math.floor((now + (p.cycles - 0.75) * p.cycle - p.restAt) / p.cycle) + 1;
  p.from = now;
  p.end = p.restAt + Math.max(1, k) * p.cycle;
  run(p);
}

/** Motion paused: back to the still pose (loops removed, inline frame dropped). */
function rest(p: Piece, state: State): void {
  clearTimeout(p.timer);
  clearTimeout(p.parkTimer);
  cancelAnimationFrame(p.ramp);
  p.ramp = 0;
  p.down = false;
  p.primed = false;
  p.state = state;
  unhold(p);
  set(p, "rest");
}

/** Fill the free slots with waiting pieces in view, in reading order. Not while a page transition runs
 *  (html[data-vting], BaseLayout): a piece that plays inside a live view-transition snapshot makes every frame of the
 *  morph re-render it; the waiting pieces start on "lc:vt-end". */
function schedule(): void {
  if (motionOff() || document.documentElement.hasAttribute("data-vting")) return;
  const all = [...pieces.values()];
  if (document.hidden) {
    for (const p of all) {
      if (p.state !== "play" || !running(p)) continue;
      if (p.down) {
        freeze(p, p.end); // was stopping anyway
        p.state = "done";
      } else freeze(p, undefined, false); // resumes when visible
    }
    return;
  }
  let active = 0;
  for (const p of all) {
    if (p.state !== "play") continue;
    if (!p.onscreen) {
      freeze(p, undefined, "now"); // offscreen: park where it is, finish the cycle on its next turn
      p.state = "wait";
      continue;
    }
    if (!running(p)) run(p); // back from a hidden tab
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

function replay(p: Piece): void {
  p.hover = true;
  if (!allowed()) return;
  if (p.state === "play") {
    if (p.down) {
      // caught while stopping: spin back up and play on to the following rest frame
      p.end += p.cycle;
      spin(p, true);
      arm(p);
    }
    return;
  }
  // take a slot: if both are busy, the automatic piece that has played longest gives it up — it runs on to its rest
  // frame if that is close (briefly a third piece), else it eases to a stop where it is
  const busy = [...pieces.values()].filter((q) => q.state === "play" && q.onscreen && running(q) && !q.hover);
  if (busy.length >= MAX) {
    const q = busy.sort((a, b) => pos(anims(b)) - b.from - (pos(anims(a)) - a.from))[0]!;
    const now = pos(anims(q));
    const next = q.restAt + Math.ceil((now + SPIN_DOWN / 2 - q.restAt) / q.cycle) * q.cycle;
    q.state = "done";
    if (next - now <= EVICT_RUN) {
      q.end = next;
      arm(q);
    } else {
      clearTimeout(q.timer);
      spin(q, false, () => freeze(q));
    }
  }
  p.cycles = 1;
  start(p);
}

function observe(el: Element): void {
  if (pieces.has(el)) return;
  const p: Piece = {
    el,
    state: "wait",
    cycles: el.closest(".group") ? 1 : 2,
    cycle: 0,
    restAt: 0,
    from: 0,
    end: 0,
    primed: false,
    at: 0,
    saved: [],
    timer: 0,
    parkTimer: 0,
    ramp: 0,
    down: false,
    ratio: 0,
    onscreen: false,
    hover: false,
  };
  pieces.set(el, p);
  if (!el.hasAttribute("data-play")) set(p, "rest");
  primeSoon(p);
  io!.observe(el);
  const card = el.closest<HTMLElement>(".group");
  const enter = () => replay(p);
  const leave = () => {
    p.hover = false;
  };
  (card ?? el).addEventListener("pointerenter", (e) => (e as PointerEvent).pointerType === "mouse" && enter());
  (card ?? el).addEventListener("pointerleave", leave);
  if (card) {
    card.addEventListener("focusin", enter);
    card.addEventListener("focusout", leave);
  }
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
  document.addEventListener("lc:vt-end", schedule);
  onMotionChange((off) => {
    for (const p of pieces.values()) {
      if (off) rest(p, p.state === "play" ? "wait" : p.state);
      else if (p.onscreen) p.state = "wait";
    }
    if (!off) primeMany([...pieces.values()]);
    schedule();
  });
}
