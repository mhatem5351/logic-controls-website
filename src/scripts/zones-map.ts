/**
 * "Where we work" map (ZonesBlock.astro). Vanilla, no dependencies; every string it shows is server-rendered.
 *
 * preview(zone): hover (real hover only; list rows after an 80 ms hover intent) or keyboard focus on a pin / list row
 *   → pin + row + trace light up, an amber signal travels the trace from our base (≤ 240 ms), the pin pings, and a
 *   tooltip appears beside the pin on the side that covers the fewest other pins and the trace.
 * select(zone):
 *   - pin (click / tap / Enter / Space): the detail card replaces the legend under the map (next Tab stops: close,
 *     CTA). A tap goes to the pin nearest the finger (≤ 28px): it rescues near misses and settles where the 44px touch
 *     halos overlap (ZonesBlock.astro).
 *   - list row: a disclosure — its own detail (distance + CTA) opens right under it; the map lights the zone. No
 *     scrolling away from the list.
 *   The same control again, Escape or the close button deselects (focus goes back to the control that opened it).
 * Pins are one toolbar (roving tabindex: arrows / Home / End); while a pin has keyboard focus the arrow-key hint
 * shows in the legend's place (panel[data-kbd]). Region headings (hover) light all pins of their
 * region. A one-time hint chip appears with the pins' intro. Motion (signal, ping) stops with reduced motion or the
 * site's pause switch.
 */
import { motionOff, scrollBehavior } from "./motion/motion-pref";

/**
 * Roving-tabindex target of a key pressed on pin `i` of `n` (pure; unit-tested). "Next" follows the reading direction
 * (ArrowRight in LTR, ArrowLeft in RTL), ArrowDown / ArrowUp are next / previous in both, Home / End the first / last
 * pin; next / previous wrap around the ends. null: not a navigation key.
 */
export function rovingTarget(key: string, i: number, n: number, rtl: boolean): number | null {
  if (n < 1) return null;
  const next = rtl ? "ArrowLeft" : "ArrowRight";
  const prev = rtl ? "ArrowRight" : "ArrowLeft";
  const to = key === next || key === "ArrowDown" ? i + 1 : key === prev || key === "ArrowUp" ? i - 1 : key === "Home" ? 0 : key === "End" ? n - 1 : null;
  return to === null ? null : (to + n) % n;
}

for (const root of document.querySelectorAll<HTMLElement>("[data-zones]")) init(root);

function init(root: HTMLElement) {
  const $ = <T extends Element = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const $$ = <T extends Element = HTMLElement>(s: string) => [...root.querySelectorAll<T>(s)];
  const wrap = $("[data-zm]");
  const panel = $("[data-zm-panel]");
  const bar = $("[data-zm-pins]");
  const tip = $("[data-zm-tip]");
  const live = $("[data-zm-live]");
  const hint = $("[data-zm-hint]");
  const strip = $("[data-zm-card]");
  const sig = $<SVGPathElement>(".lc-map-sig");
  const ping = $<SVGCircleElement>(".lc-map-ping");
  const ctrls = $$<HTMLButtonElement>("[data-zm-ctrl]");
  const pins = ctrls.filter((b) => b.hasAttribute("data-zm-pin"));
  const rows = ctrls.filter((b) => b.hasAttribute("data-zm-row"));
  const marks = $$<HTMLElement | SVGElement>(".lc-map-pin,.lc-map-links path,[data-zm-row]");
  const cards = $$("[data-card]");
  const details = $$("[data-zm-detail]");
  const [bx, by] = wrap.dataset.base!.split(" ").map(Number);
  const MAP_W = Number(wrap.dataset.mapW) || 380;
  const [R_HOME, R_ZONE] = (wrap.dataset.r || "8.5 7").split(" ").map(Number);
  const home = wrap.dataset.home;
  let hl = "";
  let sel = "";
  let selFrom: "" | "pin" | "row" = "";
  let over: HTMLElement | null = null;
  let inTip = false;
  let invoker: HTMLElement | null = null;
  let timer = 0;
  let tipTimer = 0;
  let intent = 0;
  let sigA: Animation | undefined;
  let pingA: Animation | undefined;

  const css = (k: string) => getComputedStyle(document.documentElement).getPropertyValue(k).trim();
  const ms = (v: string) => (v.endsWith("ms") ? parseFloat(v) : parseFloat(v) * 1000) || 0;
  const xy = (z: string) => ctrls.find((b) => b.dataset.zone === z)!.dataset.xy!.split(" ").map(Number);
  const card = (z: string) => cards.find((c) => c.dataset.card === z)!;
  const kindOf = (b: HTMLElement): "pin" | "row" => (b.hasAttribute("data-zm-row") ? "row" : "pin");
  const flag = (attr: string, test: (m: HTMLElement | SVGElement) => boolean) => marks.forEach((m) => m.toggleAttribute(attr, test(m)));
  const visibleFocus = () => {
    const f = document.activeElement as HTMLElement;
    return ctrls.includes(f as HTMLButtonElement) && f.matches(":focus-visible") ? f.dataset.zone! : "";
  };

  /** The amber signal runs base → zone at constant speed (current), then the pin pings once. Returns the travel time. */
  function signal(z: string) {
    sigA?.cancel();
    pingA?.cancel();
    if (motionOff()) return 0;
    const [x, y] = xy(z);
    let t = 0;
    if (z !== home) {
      const len = Math.hypot(x - bx, y - by);
      t = Math.min(240, 100 + len * 0.8);
      sig.setAttribute("d", `M${bx} ${by}L${x} ${y}`);
      sigA = sig.animate({ strokeDashoffset: ["18", `${-len}`], opacity: [1, 1, 0.5] }, { duration: t, easing: "linear" });
    }
    ping.setAttribute("cx", `${x}`);
    ping.setAttribute("cy", `${y}`);
    pingA = ping.animate({ scale: ["1", "2.6"], opacity: [0.95, 0] }, { duration: 700, delay: t, easing: css("--ease-emph") || "cubic-bezier(.16,1,.3,1)" });
    return t;
  }

  /**
   * Tooltip beside the pin, kept inside the map box. Candidates: above / below / right / left, each also slid ±40 and
   * ±80px along its caret's axis (the caret still points at the pin), and it may reach into the panel's padding. Cost
   * per other pin it covers: 0.5 + 6 × the share of the pin's dot under it (grazing an edge is much better than hiding
   * a neighbour), 0.25 + ½ × the share of its hit area; 0.25 per covered sample of the lit trace (16 samples); a little
   * for sliding (centred wins ties); then the order above (MOT2-19).
   */
  function showTip(z: string) {
    tip.replaceChildren(...[...card(z).querySelectorAll("[data-tip]")].map((n) => n.cloneNode(true)));
    tip.hidden = false;
    // placed by its measured size: if a web font is still on its way, place it again once the text has its real size
    if (document.fonts?.status === "loading") void document.fonts.ready.then(() => hl === z && !tip.hidden && showTip(z));
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    const s = W / MAP_W;
    const k = parseFloat(getComputedStyle(wrap).getPropertyValue("--k")) || 1;
    const [x, y] = xy(z);
    const px = x * s;
    const py = y * s;
    const r = (z === home ? R_HOME : R_ZONE) * s * k + 9;
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const cx = (v: number) => Math.max(4, Math.min(v, W - w - 4));
    const cy = (v: number) => Math.max(4, Math.min(v, H - h - 4));
    const sides = [
      { p: "top", left: px - w / 2, top: py - r - h, along: "x" },
      { p: "bottom", left: px - w / 2, top: py + r, along: "x" },
      { p: "right", left: px + r, top: py - h / 2, along: "y" },
      { p: "left", left: px - r - w, top: py - h / 2, along: "y" },
    ];
    const cands: { p: string; left: number; top: number; slide: number }[] = [];
    for (const slide of [0, -40, 40, -80, 80])
      for (const c of sides) {
        const left = c.along === "x" ? cx(c.left + slide) : c.left;
        const top = c.along === "y" ? cy(c.top + slide) : c.top;
        // the caret (12px from either end at most) must still reach the pin
        const caret = c.along === "x" ? px - left : py - top;
        if (caret < 12 || caret > (c.along === "x" ? w : h) - 12) continue;
        cands.push({ p: c.p, left, top, slide: Math.abs(slide) });
      }
    const wr0 = wrap.getBoundingClientRect();
    const others = pins
      .filter((b) => b.dataset.zone !== z)
      .map((b) => {
        const [qx, qy] = xy(b.dataset.zone!);
        const rr = (b.dataset.zone === home ? R_HOME : R_ZONE) * s * k + 3;
        const hit = b.getBoundingClientRect();
        return { dot: [qx * s - rr, qy * s - rr, qx * s + rr, qy * s + rr], hit: [hit.left - wr0.left, hit.top - wr0.top, hit.right - wr0.left, hit.bottom - wr0.top] };
      });
    const trace = z === home ? [] : Array.from({ length: 16 }, (_, i) => [(bx + ((x - bx) * i) / 16) * s, (by + ((y - by) * i) / 16) * s]);
    /** Share (0–1) of box [a, b, c, d] under the tooltip [L, T, R, B]. */
    const share = (L: number, T: number, R: number, B: number, [a, b, c, d]: number[]) =>
      (Math.max(0, Math.min(R, c) - Math.max(L, a)) * Math.max(0, Math.min(B, d) - Math.max(T, b))) / ((c - a) * (d - b) || 1);
    // the panel's padding around the map (desktop 24px) may hold a tooltip edge; the legend strip below may not
    const wr = wrap.getBoundingClientRect();
    const pr = panel.getBoundingClientRect();
    const [padL, padT, padR] = [wr.left - pr.left, wr.top - pr.top, pr.right - wr.right].map((v) => Math.max(0, v - 6));
    const score = ({ left: L, top: T, slide }: { left: number; top: number; slide: number }) => {
      const R = L + w;
      const B = T + h;
      let v = L < 2 - padL || T < 2 - padT || R > W - 2 + padR || B > H - 2 ? 1e6 : 0;
      for (const o of others) {
        const d = share(L, T, R, B, o.dot);
        const t = share(L, T, R, B, o.hit);
        v += (d ? 0.5 + 6 * d : 0) + (t ? 0.25 + t / 2 : 0);
      }
      for (const [qx, qy] of trace) if (qx > L && qx < R && qy > T && qy < B) v += 0.25;
      return v + slide / 800;
    };
    let best = cands[0] ?? { ...sides[0], slide: 0 };
    let bs = Infinity;
    for (const c of cands) {
      const v = score(c);
      if (v < bs - 1e-6) [best, bs] = [c, v];
    }
    // nothing fits inside the box: above, else below, clamped (the old behaviour)
    if (bs >= 1e6) {
      const [a, b] = sides;
      best = a.top >= 4 ? { ...a, left: cx(a.left), slide: 0 } : { ...b, left: cx(b.left), top: Math.min(b.top, H - h - 4), slide: 0 };
    }
    tip.style.transform = `translate(${best.left}px,${best.top}px)`;
    tip.dataset.place = best.p;
    tip.style.setProperty("--cx", `${Math.max(12, Math.min(px - best.left, w - 12))}px`);
    tip.style.setProperty("--cy", `${Math.max(12, Math.min(py - best.top, h - 12))}px`);
  }

  /** Light zone z (or nothing); its tooltip pops up as the signal arrives (at most 160 ms later). */
  function preview(z: string) {
    if (z === hl) return;
    hl = z;
    flag("data-hl", (m) => !!z && m.dataset.zone === z);
    clearTimeout(tipTimer);
    tip.hidden = true;
    if (!z) {
      sigA?.cancel();
      pingA?.cancel();
      return;
    }
    dismissHint();
    const t = signal(z);
    if (!(z === sel && selFrom === "pin")) tipTimer = window.setTimeout(() => showTip(z), Math.min(t, 160));
  }

  /** Roving tabindex over the pins (one Tab stop for the whole map). */
  const rove = (i: number, focus = true) => {
    const j = (i + pins.length) % pins.length;
    pins.forEach((p, k) => (p.tabIndex = k === j ? 0 : -1));
    if (focus) pins[j].focus();
  };
  // the arrow-key hint replaces the legend while a pin has keyboard focus (ZonesBlock.astro, A11Y2-22)
  bar.addEventListener("focusin", (e) => panel.toggleAttribute("data-kbd", (e.target as HTMLElement).matches(":focus-visible")));
  bar.addEventListener("focusout", (e) => !bar.contains(e.relatedTarget as Node | null) && panel.removeAttribute("data-kbd"));
  bar.addEventListener("keydown", (e) => {
    const i = pins.indexOf(e.target as HTMLButtonElement);
    if (i < 0) return;
    const to = rovingTarget(e.key, i, pins.length, getComputedStyle(bar).direction === "rtl");
    if (to === null) return;
    e.preventDefault();
    rove(to);
  });

  function select(z: string, from?: HTMLElement) {
    const kind = from ? kindOf(from) : selFrom || "pin";
    sel = z;
    selFrom = z ? kind : "";
    if (from) invoker = from;
    flag("data-sel", (m) => !!z && m.dataset.zone === z);
    const open = !!z && kind === "pin";
    for (const b of pins) b.setAttribute("aria-expanded", `${open && b.dataset.zone === z}`);
    for (const b of rows) b.setAttribute("aria-expanded", `${!!z && kind === "row" && b.dataset.zone === z}`);
    for (const d of details) d.hidden = !(z && kind === "row" && d.dataset.zmDetail === z);
    panel.toggleAttribute("data-open", open);
    // pins announce where their card is (it follows the toolbar); rows already say "expanded", their detail follows
    live.textContent = open ? card(z).dataset.said! : "";
    if (!z) return;
    const j = pins.findIndex((p) => p.dataset.zone === z);
    if (j >= 0) rove(j, false);
    // the leaving card stays painted while the strip collapses; only a new selection swaps the content
    if (open) for (const c of cards) c.hidden = c.dataset.card !== z;
    if (z !== hl) signal(z);
    if (open) {
      clearTimeout(tipTimer);
      tip.hidden = true;
    }
    dismissHint();
    // phones / tablets (the panel does not stick): once the card has opened, show its CTA if it landed below the fold
    if (open && getComputedStyle(panel).position !== "sticky") {
      window.setTimeout(() => strip.scrollIntoView({ block: "nearest", behavior: scrollBehavior() }), ms(css("--dur-ui")) + 30);
    }
  }

  /** After a pointer / focus leaves: keep the tooltip while the pointer is on it, else fall back to the focus. */
  const settle = () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => over || inTip || preview(visibleFocus()), 90);
  };

  for (const b of ctrls) {
    const z = b.dataset.zone!;
    const row = b.hasAttribute("data-zm-row");
    b.addEventListener("pointerenter", (e) => {
      if (e.pointerType === "touch") return;
      over = b;
      clearTimeout(timer);
      clearTimeout(intent);
      // list rows: a short hover intent, so sweeping the list does not fire a burst of signals
      if (row) intent = window.setTimeout(() => over === b && preview(z), 80);
      else preview(z);
    });
    b.addEventListener("pointerleave", (e) => {
      if (e.pointerType === "touch") return;
      clearTimeout(intent);
      over = null;
      settle();
    });
    b.addEventListener("focus", () => b.matches(":focus-visible") && preview(z));
    b.addEventListener("blur", settle);
    b.addEventListener("click", () => select(sel === z && selFrom === kindOf(b) ? "" : z, b));
  }

  /* Touch: the pin nearest to the finger (≤ 28px) wins. That rescues a tap that just misses a pin, and it decides
     where the 44px touch targets overlap (cluster; ZonesBlock.astro). Runs in the capture phase, before the pin's
     own click; keyboard / programmatic clicks (detail 0) pass through. */
  let lastPtr = "";
  wrap.addEventListener("pointerdown", (e) => (lastPtr = e.pointerType), { passive: true });
  wrap.addEventListener(
    "click",
    (e) => {
      if (lastPtr !== "touch" || e.detail === 0) return;
      const hit = (e.target as Element).closest<HTMLButtonElement>("[data-zm-pin]");
      const r = wrap.getBoundingClientRect();
      const s = r.width / MAP_W;
      let best: HTMLButtonElement | null = null;
      let bd = 28;
      for (const b of pins) {
        const [x, y] = xy(b.dataset.zone!);
        const d = Math.hypot(x * s - (e.clientX - r.left), y * s - (e.clientY - r.top));
        if (d < bd) [best, bd] = [b, d];
      }
      if (!best || best === hit) return;
      e.stopPropagation();
      best.click();
    },
    true,
  );

  // WCAG 1.4.13: the pointer may move onto the tooltip (it ignores pointer events, so pins under it stay reachable)
  wrap.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch" || over || tip.hidden) return;
    const r = tip.getBoundingClientRect();
    const was = inTip;
    inTip = e.clientX > r.left - 8 && e.clientX < r.right + 8 && e.clientY > r.top - 8 && e.clientY < r.bottom + 8;
    if (was && !inTip) settle();
  });
  wrap.addEventListener("pointerleave", () => {
    inTip = false;
    settle();
  });

  for (const h of $$("[data-zm-region]")) {
    const lightRegion = (r?: string) => flag("data-rhl", (m) => !!r && m.dataset.region === r);
    h.addEventListener("pointerenter", (e) => e.pointerType !== "touch" && lightRegion(h.dataset.zmRegion));
    h.addEventListener("pointerleave", () => lightRegion());
  }

  const close = () => {
    const a = document.activeElement;
    const inside = strip.contains(a) || details.some((d) => d.contains(a));
    select("");
    if (inside) invoker?.focus();
  };
  $("[data-zm-close]").addEventListener("click", close);
  // Escape: the tooltip goes from anywhere (WCAG 1.4.13); the selection when focus is in the block (or nowhere)
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    preview("");
    const a = document.activeElement;
    if (sel && (root.contains(a) || a === document.body)) close();
  });

  /* One-time hint + the pins' intro, when the map first comes into view (the hint never comes back this session). */
  let seen = false;
  try {
    seen = !!sessionStorage.lcZmHint;
  } catch {}
  /** First interaction of the session: the hint fades out (or never shows). */
  function dismissHint() {
    if (seen) return;
    seen = true;
    try {
      sessionStorage.lcZmHint = 1;
    } catch {}
    if (hint.hidden) return;
    hint.setAttribute("data-out", "");
    setTimeout(() => (hint.hidden = true), 300);
  }
  new IntersectionObserver(
    ([e], io) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      wrap.setAttribute("data-intro", "");
      if (!seen) hint.hidden = false;
    },
    { threshold: 0.6 },
  ).observe(wrap);
}
