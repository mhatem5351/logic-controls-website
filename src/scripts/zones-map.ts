/**
 * "Where we work" map (ZonesBlock.astro). Vanilla, no dependencies; every string it shows is server-rendered.
 *
 * preview(zone): hover (real hover only) or keyboard focus on a pin / list row → pin + row + trace light up, an
 *   amber signal travels the trace from our base, the pin pings, a tooltip appears near the pin.
 * select(zone):  click / tap / Enter / Space → the detail card replaces the legend under the map. The same control
 *   again, Escape or the close button deselects (focus goes back to the control that opened it).
 * Region headings (hover) light all pins of their region. A one-time hint chip appears with the pins' intro.
 */
const reduce = matchMedia("(prefers-reduced-motion: reduce)");

for (const root of document.querySelectorAll<HTMLElement>("[data-zones]")) init(root);

function init(root: HTMLElement) {
  const $ = <T extends Element = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const $$ = <T extends Element = HTMLElement>(s: string) => [...root.querySelectorAll<T>(s)];
  const wrap = $("[data-zm]");
  const panel = $("[data-zm-panel]");
  const tip = $("[data-zm-tip]");
  const live = $("[data-zm-live]");
  const hint = $("[data-zm-hint]");
  const sig = $<SVGPathElement>(".lc-map-sig");
  const ping = $<SVGCircleElement>(".lc-map-ping");
  const ctrls = $$<HTMLButtonElement>("[data-zm-ctrl]");
  const marks = $$<HTMLElement | SVGElement>(".lc-map-pin,.lc-map-links path,[data-zm-row]");
  const cards = $$("[data-card]");
  const [bx, by] = wrap.dataset.base!.split(" ").map(Number);
  const home = wrap.dataset.home;
  let hl = "";
  let sel = "";
  let over: HTMLElement | null = null;
  let inTip = false;
  let invoker: HTMLElement | null = null;
  let timer = 0;
  let tipTimer = 0;

  const xy = (z: string) => ctrls.find((b) => b.dataset.zone === z)!.dataset.xy!.split(" ").map(Number);
  const card = (z: string) => cards.find((c) => c.dataset.card === z)!;
  const flag = (attr: string, test: (m: HTMLElement | SVGElement) => boolean) => marks.forEach((m) => m.toggleAttribute(attr, test(m)));
  const visibleFocus = () => {
    const f = document.activeElement as HTMLElement;
    return ctrls.includes(f as HTMLButtonElement) && f.matches(":focus-visible") ? f.dataset.zone! : "";
  };

  /** The amber signal runs base → zone at constant speed (current), then the pin pings once. Returns the travel time. */
  function signal(z: string) {
    if (reduce.matches) return 0;
    const [x, y] = xy(z);
    let t = 0;
    if (z !== home) {
      const len = Math.hypot(x - bx, y - by);
      t = 120 + len * 1.5;
      sig.setAttribute("d", `M${bx} ${by}L${x} ${y}`);
      sig.animate({ strokeDashoffset: ["18", `${-len}`], opacity: [1, 1, 0.5] }, { duration: t, easing: "linear" });
    }
    ping.setAttribute("cx", `${x}`);
    ping.setAttribute("cy", `${y}`);
    ping.animate({ scale: ["1", "2.6"], opacity: [0.95, 0] }, { duration: 700, delay: t, easing: "cubic-bezier(.16,1,.3,1)" });
    return t;
  }

  /** Tooltip above the pin (below when there is no room), kept inside the map box; the caret points at the pin. */
  function showTip(z: string) {
    tip.replaceChildren(...[...card(z).querySelectorAll("[data-tip]")].map((n) => n.cloneNode(true)));
    tip.hidden = false;
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    const s = W / 380;
    const [x, y] = xy(z);
    const px = x * s;
    const py = y * s;
    const r = (z === home ? 8.5 : 7) * s + 9;
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    let top = py - r - h;
    const below = top < 4;
    if (below) top = Math.min(py + r, H - h - 4);
    const left = Math.max(4, Math.min(px - w / 2, W - w - 4));
    tip.style.transform = `translate(${left}px,${top}px)`;
    tip.style.setProperty("--cx", `${Math.max(12, Math.min(px - left, w - 12))}px`);
    tip.toggleAttribute("data-below", below);
  }

  /** Light zone z (or nothing); its tooltip pops up when the signal arrives, so it never hides the travelling pulse. */
  function preview(z: string) {
    if (z === hl) return;
    hl = z;
    flag("data-hl", (m) => !!z && m.dataset.zone === z);
    clearTimeout(tipTimer);
    tip.hidden = true;
    if (!z) return;
    dismissHint();
    const t = signal(z);
    if (z !== sel) tipTimer = window.setTimeout(() => showTip(z), t);
  }

  function select(z: string, from?: HTMLElement) {
    sel = z;
    if (from) invoker = from;
    flag("data-sel", (m) => !!z && m.dataset.zone === z);
    for (const b of ctrls) b.setAttribute("aria-expanded", `${!!z && b.dataset.zone === z}`);
    panel.toggleAttribute("data-open", !!z);
    live.textContent = z ? card(z).dataset.said! : "";
    if (!z) return;
    // the leaving card stays painted while the strip collapses; only a new selection swaps the content
    for (const c of cards) c.hidden = c.dataset.card !== z;
    if (z !== hl) signal(z);
    clearTimeout(tipTimer);
    tip.hidden = true;
    dismissHint();
    // Phones / tablets (the panel does not stick): once the card has opened, bring map + card into view — back up
    // when the zone was chosen in the list below, or down just enough to show the card's CTA.
    if (getComputedStyle(panel).position !== "sticky") {
      setTimeout(() => {
        const r = panel.getBoundingClientRect();
        const top = r.top - (parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0);
        const by = top < 0 ? top : Math.min(r.bottom - innerHeight + 12, top);
        if (by > 0 || top < 0) scrollBy({ top: by, behavior: reduce.matches ? "auto" : "smooth" });
      }, 300);
    }
  }

  /** After a pointer / focus leaves: keep the tooltip while the pointer is on it, else fall back to the focus. */
  const settle = () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => over || inTip || preview(visibleFocus()), 90);
  };

  for (const b of ctrls) {
    const z = b.dataset.zone!;
    b.addEventListener("pointerenter", (e) => {
      if (e.pointerType === "touch") return;
      over = b;
      clearTimeout(timer);
      preview(z);
    });
    b.addEventListener("pointerleave", (e) => {
      if (e.pointerType === "touch") return;
      over = null;
      settle();
    });
    b.addEventListener("focus", () => b.matches(":focus-visible") && preview(z));
    b.addEventListener("blur", settle);
    b.addEventListener("click", () => select(sel === z ? "" : z, b));
  }

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
    const back = root.querySelector("[data-zm-card]")!.contains(document.activeElement) ? invoker : null;
    select("");
    back?.focus();
  };
  $("[data-zm-close]").addEventListener("click", close);
  // Escape: the tooltip goes from anywhere (WCAG 1.4.13); the card when focus is in the block (or nowhere)
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
