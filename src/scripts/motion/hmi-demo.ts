/**
 * HMI demo view/controller: binds a Pasteurizer model (hmi-sim.ts) to the HmiDemo.astro markup.
 *
 * - Fixed-timestep simulation inside requestAnimationFrame; DOM writes are throttled to ~10 Hz.
 * - Fully static until the first interaction; the loop stops again once the plant has come to rest.
 * - Paused while offscreen (IntersectionObserver) or while the tab is hidden; CSS animations too.
 * - Reduced motion: CSS drops the flowing/spinning/blinking; values still update on interaction.
 */
import { CIP, DT, Pasteurizer, RECIPES, SPEED, type Alarm, type RecipeId } from "./hmi-sim";

type Dict = { [k: string]: string };
interface I18n {
  status: Dict;
  mimic: Dict;
  recipe: Dict;
  trend: Dict;
  alarms: Dict;
  msg: Dict;
  cip: Dict;
}

const fill = (s: string, o: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(o[k] ?? ""));
const pad = (n: number) => String(n).padStart(2, "0");
const hms = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const f1 = (v: number) => v.toFixed(1);
// Keep "72.0 °C", "≥ 15 s", "3000 L/h" in one LTR piece inside Arabic sentences (bidi isolates).
const iso = (s: string) =>
  s.replace(/(?<![\w-])(?:[≥≤]\s?)?-?\d+(?:\.\d+)?(?:\s?(?:°C|bar|L\/h|s|%|L)\b|\s?°C)?/g, (m) => `\u2066${m}\u2069`);

// Product temperature → colour (cold steel-blue → neutral → warm copper). Muted on purpose (ISA-101).
const STOPS: [number, number, number, number][] = [
  [4, 95, 136, 184],
  [35, 150, 157, 170],
  [62, 196, 152, 104],
  [85, 206, 104, 58],
];
function tColor(t: number): string {
  let i = 0;
  while (i < STOPS.length - 2 && t > STOPS[i + 1][0]) i++;
  const [t0, r0, g0, b0] = STOPS[i];
  const [t1, r1, g1, b1] = STOPS[i + 1];
  const k = Math.max(0, Math.min(1, (t - t0) / (t1 - t0)));
  return `rgb(${Math.round(r0 + (r1 - r0) * k)},${Math.round(g0 + (g1 - g0) * k)},${Math.round(b0 + (b1 - b0) * k)})`;
}
const FLUID: Record<string, string> = { water: "#7fa6d3", caustic: "#9284c6", acid: "#a9a64e" };

const N_TREND = 120; // 60 s at 0.5 s

export function initHmi(fig: HTMLElement): void {
  if (fig.dataset.ready) return;
  fig.dataset.ready = "1";
  const T = JSON.parse(fig.dataset.i18n || "{}") as I18n;
  const scr = fig.querySelector<HTMLElement>(".lc-hmi-screen")!;
  const live = fig.querySelector<HTMLElement>("[data-live]")!;
  const sim = new Pasteurizer();

  // ---------------------------------------------------------------- element lookups
  const vals = new Map<string, Element[]>();
  scr.querySelectorAll<HTMLElement | SVGElement>("[data-v]").forEach((el) => {
    const k = el.dataset.v!;
    vals.set(k, [...(vals.get(k) || []), el]);
  });
  const set = (k: string, v: string) => {
    for (const el of vals.get(k) || []) if (el.textContent !== v) el.textContent = v;
  };
  const attr = (el: Element, k: string, v: string | null) => {
    if (el.getAttribute(k) === v) return;
    if (v === null) el.removeAttribute(k);
    else el.setAttribute(k, v);
  };
  const flows = [...scr.querySelectorAll<SVGPathElement>(".m-flow path")];
  const lvls = [...scr.querySelectorAll<SVGRectElement>("[data-lvl]")];
  const btns = [...scr.querySelectorAll<HTMLButtonElement>("button[data-c]")];
  const btn = (c: string) => btns.filter((b) => b.dataset.c === c);
  const ai = scr.querySelector<HTMLElement>(".hs-ai")!;
  const alist = scr.querySelector<HTMLElement>(".hs-alist")!;
  const msgEl = scr.querySelector<HTMLElement>(".hs-msg")!;
  const trendBox = scr.querySelector<HTMLElement>(".hs-trend")!;
  const trendPaths = ["pv", "th", "sp", "lim"].map((k) => scr.querySelector<SVGPathElement>(`.tr-${k}`)!);
  const yLbl = [...scr.querySelectorAll<HTMLElement>(".hs-y")];
  const cipLis = [...scr.querySelectorAll<HTMLElement>(".hs-cip li")];
  const almRo = [...scr.querySelectorAll<Element>("[data-alm-ro]")];
  const almInd = [...scr.querySelectorAll<Element>("[data-alm-ind]")];

  // ---------------------------------------------------------------- trend buffers
  const tr = { pv: new Float32Array(N_TREND), th: new Float32Array(N_TREND), sp: new Float32Array(N_TREND), lim: new Float32Array(N_TREND) };
  let trN = 0;
  let trAcc = 0;
  const pushTrend = () => {
    for (const k of ["pv", "th", "sp", "lim"] as const) tr[k].copyWithin(0, 1);
    tr.pv[N_TREND - 1] = sim.tt102;
    tr.th[N_TREND - 1] = sim.th;
    tr.sp[N_TREND - 1] = sim.spActive;
    tr.lim[N_TREND - 1] = sim.cip >= 0 ? NaN : sim.R.limit;
    trN = Math.min(N_TREND, trN + 1);
  };

  // ---------------------------------------------------------------- messages / announcements
  let note = ""; // transient operator message (e.g. interlock refusal)
  let noteTone = "";
  let noteUntil = 0;
  let stickyKey = "idle"; // message once the plant is idle
  const say = (s: string) => {
    live.textContent = "";
    // re-set on the next frame so repeated messages are announced again
    requestAnimationFrame(() => (live.textContent = s));
  };
  const alarmText = (a: Alarm) => {
    const arg = a.key === "evRecipe" ? T.recipe[a.arg || ""] || a.arg : a.arg;
    return iso(fill(T.alarms[a.key] || a.key, { limit: a.arg || "", arg: arg || "" }));
  };
  const flash = (s: string, tone = "warn", ms = 5000) => {
    note = s;
    noteTone = tone;
    noteUntil = performance.now() + ms;
  };

  function handleEvents(): void {
    const ann: string[] = [];
    for (const e of sim.events) {
      if (e.type === "alarm") {
        const a = e.alarm;
        ann.push(a.prio ? fill(T.msg.alarm, { prio: T.alarms[`p${a.prio}`], text: alarmText(a) }) : alarmText(a));
        if (a.key === "evCipDone") stickyKey = "cipDone";
      } else if (e.type === "fdv" && sim.producing) ann.push(e.fwd ? T.msg.fdvFwd : T.msg.fdvDiv);
      else if (e.type === "cip" && e.phase >= 0) ann.push(`${T.cip.title}: ${T.cip[CIP[e.phase][0]]}`);
    }
    sim.events.length = 0;
    if (ann.length) {
      say(ann.join(" "));
      alarmsDirty = true;
    }
  }

  // ---------------------------------------------------------------- rendering
  let alarmsDirty = true;
  let lastCip = -2;
  function render(): void {
    const s = sim;
    const R = s.R;
    const cip = s.cip >= 0;
    const tt = s.tt102;
    const unack = s.alarms.filter((a) => a.prio > 0 && !a.acked);
    const producing = s.producing;
    const abn = producing && s.produced && !s.fwd;

    // root state attributes (drive the CSS)
    attr(scr, "data-run", s.q > 50 ? "1" : "0");
    attr(fig, "data-live-run", s.running ? "1" : "0");
    attr(scr, "data-fdv", s.fwd ? "fwd" : "div");
    attr(scr, "data-mode", s.manual ? "manual" : "auto");
    attr(scr, "data-cip", String(s.cip));
    attr(scr, "data-fluid", s.fluid);
    attr(scr, "data-recipe", s.recipe);
    attr(scr, "data-lv", s.lv ? "1" : "0");
    attr(scr, "data-tcv", s.u > 0.02 && s.running ? "1" : "0");
    attr(scr, "data-blocked", s.blocked ? "1" : "0");
    attr(scr, "data-abn", abn ? "1" : "0");
    attr(scr, "data-unack", String(unack.length));
    scr.style.setProperty("--fd", `${(0.7 / Math.max(0.35, s.q / 3000)).toFixed(2)}s`);

    // values
    set("tt102", f1(tt));
    set("th", f1(s.th));
    set("thw", f1(s.thw));
    set("tout", f1(s.tout));
    set("sp", f1(s.spActive));
    set("flow", s.q.toFixed(0));
    set("hold", f1(s.holdS));
    set("valve", (s.u * 100).toFixed(0));
    set("steam", f1(s.steam));
    set("rawLvl", f1((s.rawL / 2000) * 100));
    set("btLvl", f1((s.btL / 30) * 100));
    set("stoLvl", f1((s.stoL / 2000) * 100));
    set("litres", f1(s.litres));
    set("batch", `B-${s.batch}`);
    set("limit", `≥ ${f1(R.limit)} °C`);
    set("minHold", `${R.hold} s`);
    set("fdvTxt", s.fwd ? T.mimic.forward : T.mimic.divert);
    set("outLbl", cip ? T.mimic.drain : T.mimic.storage);
    set("mode", cip ? "CIP" : s.manual ? "MAN" : "AUTO");
    set(
      "state",
      cip ? T.status.cip : !s.running ? (s.q > 0 ? T.status.stopped : stickyKey === "idle" ? T.status.ready : T.status.stopped) : s.fwd ? T.status.forward : s.produced ? T.status.divert : T.status.heating,
    );
    set("almCount", String(unack.length));

    // tank levels
    for (const r of lvls) {
      const k = r.dataset.lvl;
      const f = k === "raw" ? s.rawL / 2000 : k === "bt" ? s.btL / 30 : s.stoL / 2000;
      const h = +r.dataset.h! * f;
      attr(r, "y", (+r.dataset.y0! + +r.dataset.h! - h).toFixed(1));
      attr(r, "height", h.toFixed(1));
    }

    // pipes: state (0 empty / 1 full / 2 flowing) + colour
    const fluidC = s.fluid !== "milk" ? FLUID[s.fluid] : "";
    const flowing = s.q > 50;
    const segs = s.tubeSegments(16);
    for (const p of flows) {
      const k = p.dataset.p!;
      let st = 1;
      let t = tt;
      switch (k) {
        case "raw":
          st = s.lv ? 2 : 1;
          t = 4;
          break;
        case "feed":
        case "dis":
          st = flowing ? 2 : 1;
          t = s.tbt;
          break;
        case "hold": {
          st = flowing ? 2 : 1;
          const a = Math.floor(+p.dataset.a! * 16);
          const b = Math.max(a + 1, Math.round(+p.dataset.b! * 16));
          t = segs.slice(a, b).reduce((x, y) => x + y, 0) / (b - a);
          break;
        }
        case "fwd":
          st = s.fwd ? (flowing ? 2 : 1) : 0;
          break;
        case "div":
          st = !s.fwd && flowing ? 2 : 0;
          break;
        case "out":
          st = s.fwd ? (flowing ? 2 : 1) : 1;
          t = s.tout;
          break;
        case "hwr":
        case "hwp":
        case "hws":
          st = s.running ? 2 : 1;
          t = k === "hws" ? s.thw : s.thw - 3;
          break;
        case "ice":
          st = s.running ? 2 : 1;
          break;
        case "steam":
          st = s.running && s.u > 0.02 && s.steam > 0.8 ? 2 : s.steam > 0.8 ? 1 : 0;
          break;
      }
      attr(p, "data-s", String(st));
      if (k !== "ice" && k !== "steam") {
        const c = fluidC && k !== "raw" && !k.startsWith("hw") ? fluidC : tColor(t);
        if (p.style.stroke !== c) p.style.stroke = c;
      }
    }
    const bt = lvls.find((r) => r.dataset.lvl === "bt");
    if (bt) bt.style.fill = fluidC || tColor(s.tbt).replace("rgb", "rgba").replace(")", ",.45)");

    // analog indicator: span limit-8 … limit+6
    const lo = (cip ? 20 : R.limit - 8);
    const span = cip ? 70 : 14;
    const pc = (v: number) => `${Math.max(0, Math.min(100, ((v - lo) / span) * 100)).toFixed(1)}%`;
    ai.style.setProperty("--pv", pc(tt));
    ai.style.setProperty("--sp", pc(s.spActive));
    ai.style.setProperty("--lim", pc(cip ? -99 : R.limit));
    ai.style.setProperty("--b0", pc(cip ? s.spActive - 3 : R.limit));
    ai.style.setProperty("--bw", `${((cip ? 6 : s.sp + 1.5 - R.limit) / span) * 100}%`);

    // alarms on readouts
    const almOf = (tag: string) => s.alarms.find((a) => a.tag === tag && a.prio > 0 && (a.active || !a.acked));
    for (const el of almRo) {
      const a = almOf((el as HTMLElement).dataset.almRo!);
      attr(el, "data-alm", a?.active ? String(a.prio) : null);
    }
    for (const el of almInd) {
      const a = almOf((el as HTMLElement).dataset.almInd!);
      attr(el, "data-on", a ? (a.acked ? "ack" : "unack") : null);
    }

    // buttons
    const press = (c: string, on: boolean) => btn(c).forEach((b) => attr(b, "aria-pressed", String(on)));
    press("start", s.running && !cip);
    press("stop", !s.running);
    press("auto", !s.manual);
    press("manual", s.manual);
    press("cip", cip);
    press("fault", s.fault > 0);
    press("fdvFwd", s.manualFwd);
    press("fdvDiv", !s.manualFwd);
    btns.filter((b) => b.dataset.c === "recipe").forEach((b) => attr(b, "aria-pressed", String(b.dataset.r === s.recipe)));
    btn("fault").forEach((b) => attr(b, "aria-disabled", producing ? null : "true"));
    btn("ack").forEach((b) => attr(b, "aria-disabled", unack.length ? null : "true"));

    // CIP stepper
    if (cip || lastCip !== s.cip) {
      cipLis.forEach((li, i) => {
        attr(li, "data-st", i < s.cip ? "done" : i === s.cip ? "on" : null);
        li.style.setProperty("--p", i === s.cip ? `${((s.cipT / CIP[i][1]) * 100).toFixed(0)}%` : "0%");
      });
      set("cipLeft", cip ? iso(fill(T.cip.left, { s: Math.ceil((CIP[s.cip][1] - s.cipT) / SPEED) })) : "");
      lastCip = s.cip;
    }

    // operator message line
    const now = performance.now();
    let m = "";
    let tone = "";
    if (note && now < noteUntil) {
      m = note;
      tone = noteTone;
    } else if (cip) m = `${T.cip.title}: ${T.cip[CIP[s.cip][0]]}`;
    else if (s.running && (s.fault > 0 || s.steam < 2)) {
      m = T.msg.fault;
      tone = "warn";
    } else if (s.running && s.manual && s.manualFwd && s.blocked) {
      m = fill(T.msg.blocked, { t: f1(tt), limit: f1(R.limit) });
      tone = "warn";
    } else if (s.running && s.manual) m = T.msg.manual;
    else if (s.running && !s.fwd) {
      m = fill(s.produced ? T.msg.recovering : T.msg.heating, { limit: f1(R.limit) });
      tone = s.produced ? "warn" : "";
    } else if (s.running) m = fill(T.msg.forward, { limit: f1(R.limit), hold: f1(s.holdS) });
    else m = T.msg[stickyKey] || T.msg.idle;
    set("msg", iso(m));
    attr(msgEl, "data-tone", tone || null);

    if (alarmsDirty) renderAlarms();
  }

  function renderAlarms(): void {
    alarmsDirty = false;
    const rows = sim.alarms.slice(0, 5);
    if (!rows.length) {
      alist.innerHTML = `<li class="hs-empty">${esc(T.alarms.empty)}</li>`;
      return;
    }
    alist.innerHTML = rows
      .map((a) => {
        const st = a.prio === 0 ? "event" : !a.acked ? "unack" : a.active ? "acked" : "cleared";
        const stTx = a.prio === 0 ? T.alarms.p0 : a.active ? (a.acked ? T.alarms.acked : T.alarms.active) : T.alarms.cleared;
        return `<li data-p="${a.prio}" data-st="${st}"><span class="a-ic" title="${esc(T.alarms[`p${a.prio}`])}">${a.prio || "i"}</span><time>${hms(new Date(a.t))}</time><span class="a-tag">${esc(a.tag)}</span><span class="a-tx">${esc(alarmText(a))}</span><span class="a-st">${esc(stTx)}</span></li>`;
      })
      .join("");
  }

  function renderTrend(): void {
    if (!trN) return;
    const start = N_TREND - trN;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = start; i < N_TREND; i++) {
      for (const k of ["pv", "th", "sp", "lim"] as const) {
        const v = tr[k][i];
        if (v === v) {
          lo = Math.min(lo, v);
          hi = Math.max(hi, v);
        }
      }
    }
    // keep the interesting band readable: at least 6 °C tall, padded, snapped to 2 °C
    const mid = (lo + hi) / 2;
    if (hi - lo < 6) {
      lo = mid - 3;
      hi = mid + 3;
    }
    lo = Math.floor((lo - 0.5) / 2) * 2;
    hi = Math.ceil((hi + 0.5) / 2) * 2;
    const y = (v: number) => (100 - ((v - lo) / (hi - lo)) * 100).toFixed(1);
    const x = (i: number) => ((i / (N_TREND - 1)) * 600).toFixed(1);
    (["pv", "th", "sp", "lim"] as const).forEach((k, j) => {
      let d = "";
      for (let i = start; i < N_TREND; i++) {
        const v = tr[k][i];
        if (v !== v) continue;
        d += `${d ? "L" : "M"}${x(i)} ${y(v)}`;
      }
      attr(trendPaths[j], "d", d);
    });
    yLbl.forEach((el, i) => (el.textContent = String(hi - ((hi - lo) / 2) * i)));
  }

  // ---------------------------------------------------------------- loop + visibility
  let raf = 0;
  let last = 0;
  let acc = 0;
  let lastUi = 0;
  let lastTrend = 0;
  let restUntil = 0; // keep simulating a little after Stop so the plant visibly winds down
  let visible = false;
  let clock = 0;

  const busy = () => sim.running || sim.q > 0 || performance.now() < restUntil;
  const canRun = () => visible && !document.hidden;

  function frame(now: number): void {
    raf = 0;
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    acc += dt * SPEED;
    while (acc >= DT) {
      sim.step();
      acc -= DT;
      trAcc += DT;
      if (trAcc >= 0.5) {
        trAcc -= 0.5;
        pushTrend();
      }
    }
    handleEvents();
    if (now - lastUi > 100) {
      lastUi = now;
      render();
    }
    if (now - lastTrend > 250) {
      lastTrend = now;
      renderTrend();
    }
    if (busy() && canRun()) raf = requestAnimationFrame(frame);
    else render();
  }
  function kick(): void {
    if (raf || !busy() || !canRun()) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function syncPause(): void {
    const on = canRun();
    attr(fig, "data-paused", on ? null : "1");
    if (on) {
      kick();
      if (!clock) {
        tick();
        clock = window.setInterval(tick, 1000);
      }
    } else {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      clearInterval(clock);
      clock = 0;
    }
  }
  const tick = () => set("clock", hms(new Date()));

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      (es) => {
        visible = es[0].isIntersecting;
        syncPause();
      },
      { rootMargin: "60px 0px" },
    ).observe(fig);
  } else {
    visible = true;
    syncPause();
  }
  document.addEventListener("visibilitychange", syncPause);

  // ---------------------------------------------------------------- commands
  scr.addEventListener("click", (ev) => {
    const b = (ev.target as Element).closest<HTMLButtonElement>("button[data-c]");
    if (!b) return;
    const c = b.dataset.c!;
    const s = sim;
    if (b.getAttribute("aria-disabled") === "true") {
      if (c === "fault") flash(T.msg.idle, "", 3000);
      render();
      return;
    }
    switch (c) {
      case "start":
        if (s.cip >= 0) s.stop();
        s.start();
        stickyKey = "idle";
        break;
      case "stop":
        if (s.running) {
          s.stop();
          stickyKey = "stopped";
          restUntil = performance.now() + 8000;
        }
        break;
      case "auto":
        s.setManual(false);
        break;
      case "manual":
        s.setManual(true);
        break;
      case "cip":
        if (s.cip >= 0) {
          s.stop();
          stickyKey = "stopped";
          restUntil = performance.now() + 6000;
        } else s.startCip();
        break;
      case "fault":
        if (s.fault > 0) break;
        s.injectFault();
        break;
      case "ack":
        s.ack();
        say(T.msg.acked);
        alarmsDirty = true;
        break;
      case "recipe":
        s.setRecipe(b.dataset.r as RecipeId);
        break;
      case "spDown":
      case "spUp":
        s.nudgeSp(c === "spUp" ? 0.5 : -0.5);
        break;
      case "fdvFwd":
      case "fdvDiv":
        if (!s.commandFdv(c === "fdvFwd")) {
          const m = iso(fill(T.msg.blocked, { t: f1(s.tt102), limit: f1(s.R.limit) }));
          flash(m);
          say(m);
        }
        break;
      case "trend": {
        const open = trendBox.dataset.open !== "true";
        trendBox.dataset.open = String(open);
        b.setAttribute("aria-expanded", String(open));
        break;
      }
    }
    handleEvents();
    render();
    renderTrend();
    kick();
  });

  // Phones: start with the trend collapsed (the toggle is only interactive there).
  if (matchMedia("(max-width: 700px)").matches) {
    trendBox.dataset.open = "false";
    trendBox.querySelector("button")?.setAttribute("aria-expanded", "false");
  }
  // Initial paint of the static snapshot (localised values, recipe data).
  set("limit", `≥ ${f1(RECIPES.milk.limit)} °C`);
  render();
}
