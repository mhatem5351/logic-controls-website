/**
 * "Where we work" map (ZonesBlock.astro). Vanilla, no dependencies; every string it shows is server-rendered.
 *
 * preview(zone): hover (real hover only; list rows after an 80 ms hover intent) or keyboard focus on a pin / list row
 *   → pin + row + trace light up, an amber signal travels the trace from our base (≤ 240 ms), the pin pings, and a
 *   tooltip appears beside the pin on the side that covers the fewest other pins and the trace.
 * select(zone):
 *   - pin (click / tap / Enter / Space): the detail card replaces the legend under the map (next Tab stops: close,
 *     CTA). A tap that misses every pin by a little picks the nearest one (≤ 28px).
 *   - list row: a disclosure — its own detail (distance + CTA) opens right under it; the map lights the zone. No
 *     scrolling away from the list.
 *   The same control again, Escape or the close button deselects (focus goes back to the control that opened it).
 * Pins are one toolbar (roving tabindex: arrows / Home / End). Region headings (hover) light all pins of their
 * region. A one-time hint chip appears with the pins' intro. Motion (signal, ping) stops with reduced motion or the
 * site's pause switch.
 */
import { motionOff } from "./motion/motion-pref";

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
   * Tooltip beside the pin, kept inside the map box: of above / below / right / left, the placement that covers the
   * least of the other pins and of the trace from our base wins (ties keep that order); the caret points at the pin.
   */
  function showTip(z: string) {
    tip.replaceChildren(...[...card(z).querySelectorAll("[data-tip]")].map((n) => n.cloneNode(true)));
    tip.hidden = false;
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
    const cands = [
      { p: "top", left: cx(px - w / 2), top: py - r - h },
      { p: "bottom", left: cx(px - w / 2), top: py + r },
      { p: "right", left: px + r, top: cy(py - h / 2) },
      { p: "left", left: px - r - w, top: cy(py - h / 2) },
    ];
    const others = pins
      .filter((b) => b.dataset.zone !== z)
      .map((b) => {
        const [qx, qy] = xy(b.dataset.zone!);
        const rr = (b.dataset.zone === home ? R_HOME : R_ZONE) * s * k + 3;
        return [qx * s - rr, qy * s - rr, qx * s + rr, qy * s + rr];
      });
    const trace = z === home ? [] : Array.from({ length: 16 }, (_, i) => [(bx + ((x - bx) * i) / 16) * s, (by + ((y - by) * i) / 16) * s]);
    const score = ({ left: L, top: T }: { left: number; top: number }) => {
      const R = L + w;
      const B = T + h;
      let v = L < 2 || T < 2 || R > W - 2 || B > H - 2 ? 1e6 : 0;
      for (const [a, b, c, d] of others) v += Math.max(0, Math.min(R, c) - Math.max(L, a)) * Math.max(0, Math.min(B, d) - Math.max(T, b));
      for (const [qx, qy] of trace) if (qx > L && qx < R && qy > T && qy < B) v += 150;
      return v;
    };
    let best = cands[0];
    let bs = Infinity;
    for (const c of cands) {
      const v = score(c);
      if (v < bs - 0.5) [best, bs] = [c, v];
    }
    // nothing fits inside the box: above, else below, clamped (the old behaviour)
    if (bs >= 1e6) best = cands[0].top >= 4 ? cands[0] : { ...cands[1], top: Math.min(cands[1].top, H - h - 4) };
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
  bar.addEventListener("keydown", (e) => {
    const i = pins.indexOf(e.target as HTMLButtonElement);
    if (i < 0) return;
    const rtl = getComputedStyle(bar).direction === "rtl";
    const next = rtl ? "ArrowLeft" : "ArrowRight";
    const prev = rtl ? "ArrowRight" : "ArrowLeft";
    const to =
      e.key === next || e.key === "ArrowDown" ? i + 1 : e.key === prev || e.key === "ArrowUp" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? pins.length - 1 : null;
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
      window.setTimeout(() => strip.scrollIntoView({ block: "nearest", behavior: motionOff() ? "auto" : "smooth" }), ms(css("--dur-ui")) + 30);
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

  // Touch: a tap that just misses a pin (dots sit close together on phones) picks the nearest one within 28px.
  let lastPtr = "";
  wrap.addEventListener("pointerdown", (e) => (lastPtr = e.pointerType), { passive: true });
  wrap.addEventListener("click", (e) => {
    if (lastPtr !== "touch" || (e.target as Element).closest("[data-zm-pin]")) return;
    const r = wrap.getBoundingClientRect();
    const s = r.width / MAP_W;
    let best: HTMLButtonElement | null = null;
    let bd = 28;
    for (const b of pins) {
      const [x, y] = xy(b.dataset.zone!);
      const d = Math.hypot(x * s - (e.clientX - r.left), y * s - (e.clientY - r.top));
      if (d < bd) [best, bd] = [b, d];
    }
    if (best) best.click();
  });

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
