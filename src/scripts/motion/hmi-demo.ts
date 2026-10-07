/**
 * HMI demo view/controller: binds a Pasteurizer model (hmi-sim.ts) to the HmiDemo.astro markup.
 * Loaded on demand by the HmiDemo bootstrap (near the viewport or on the first touch / focus in the panel).
 *
 * - One 10 Hz timer (no per-frame loop): fixed-timestep simulation, DOM writes, and the stepped "marching ants" of
 *   the flowing pipes and the pump impellers all land in the same frame, so the panel repaints ~10×/s at most.
 *   No value transitions: values step at 10 Hz, which reads as smooth at these magnitudes (MOT-09).
 * - Fully static until the first interaction; the timer stops again once the plant has come to rest.
 * - Paused while offscreen (IntersectionObserver) or while the tab is hidden; CSS blinks too.
 * - Reduced motion or the site's pause switch (html[data-motion="off"]): no marching / spinning / blinking and no
 *   ticking clock; flowing pipes become static flow indicators (CSS). The simulation still runs when asked to.
 * - Story: a "Try it" checklist ticks as the visitor plays (Start → Forward → Simulate fault → Acknowledge), the
 *   next step's key carries an amber lamp, and the message line says what happens next, with live values.
 *   "Simulate a fault" stays the current step until the fault has played out (the FDV diverted and the temperature
 *   recovered); meanwhile TT-102 carries the cue. Only then is Acknowledge the next step (MOT2-11). The finished story
 *   ends on a message with a link to the quote form, and the CTA's amber trace draws when the CTA is on screen.
 * - Screen reader: user actions (refusals, Ack, setpoint) are announced at once; automatic events are coalesced
 *   (~0.8 s, deduplicated, at most three) so a fault is one account, not a burst (A11Y2-09).
 * - The message line reserves the height of the longest story message at its current width, so the command keys
 *   never move under the pointer at a story beat (MOT2-12).
 */
import { CHECK_S, CIP, DT, Pasteurizer, RECIPES, SPEED, type Alarm, type RecipeId } from "./hmi-sim";
import { iso } from "./hmi-bidi";
import { fmt1, keyStops, plainColor, productColor, KEY_T0, KEY_T1 } from "./hmi-fmt";
import { motionOff, onMotionChange } from "./motion-pref";
import { fmt, pad2 } from "~/lib/format";

type Dict = { [k: string]: string };
interface I18n {
  lang: string;
  colon: string;
  comma: string;
  perm: Dict;
  status: Dict;
  mode: Dict;
  mimic: Dict;
  recipe: Dict;
  trend: Dict;
  alarms: Dict;
  msg: Dict;
  cip: Dict;
  controls: Dict;
  tour: Dict;
  /** Quote form URL (the CTA's), linked from the closing message of the story. */
  quote: string;
}

/** The site's placeholder engine (CODE2-08); a value the message does not get is left out, never shown as "{x}". */
const fill = (s: string, o: Record<string, string | number>) => fmt(s, o, { missing: "empty" });
const hms = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const FLUID: Record<string, string> = { water: "#7fa6d3", caustic: "#9284c6", acid: "#a9a64e" };
const STEPS = ["start", "forward", "fault", "ack"] as const;
type Step = (typeof STEPS)[number];

const N_TREND = 120; // 60 s at 0.5 s
const TICK = 100; // ms: simulation + DOM at 10 Hz
const DASH = 13; // stroke-dasharray period of a flowing pipe (8 + 5)

export function initHmi(fig: HTMLElement): void {
  if (fig.dataset.ready) return;
  fig.dataset.ready = "1";
  const T = JSON.parse(fig.dataset.i18n || "{}") as I18n;
  const scr = fig.querySelector<HTMLElement>(".lc-hmi-screen")!;
  const live = fig.querySelector<HTMLElement>("[data-live]")!;
  const sim = new Pasteurizer();
  const f1 = (v: number) => fmt1(v, T.lang);
  /** Operator-event sources in the alarm summary, localised (the PLC-side codes stay SEQ / MODE / RCP). */
  const SRC: Dict = { SEQ: T.alarms.srcSeq, MODE: T.alarms.srcMode, RCP: T.alarms.srcRcp };

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
  const flowG = scr.querySelector<SVGGElement>(".m-flow")!;
  const flows = [...flowG.querySelectorAll<SVGPathElement>("path")];
  const imps = [...scr.querySelectorAll<SVGGElement>(".m-imp")];
  const lvls = [...scr.querySelectorAll<SVGRectElement>("[data-lvl]")];
  const btns = [...scr.querySelectorAll<HTMLButtonElement>("button[data-c]")];
  const btn = (c: string) => btns.filter((b) => b.dataset.c === c);
  const ai = scr.querySelector<HTMLElement>(".hs-ai")!;
  const rowsEl = scr.querySelector<HTMLElement>(".hs-alist [data-rows]")!;
  const msgEl = scr.querySelector<HTMLElement>(".hs-msg")!;
  const msgTx = msgEl.querySelector<HTMLElement>("[data-msg]")!;
  const trendBox = scr.querySelector<HTMLElement>(".hs-trend")!;
  const trendPaths = ["pv", "th", "sp", "lim"].map((k) => scr.querySelector<SVGPathElement>(`.tr-${k}`)!);
  const yLbl = [...scr.querySelectorAll<HTMLElement>(".hs-y")];
  const cipLis = [...scr.querySelectorAll<HTMLElement>(".hs-cip li")];
  const almRo = [...scr.querySelectorAll<Element>("[data-alm-ro]")];
  const almInd = [...scr.querySelectorAll<Element>("[data-alm-ind]")];
  const perm = scr.querySelector<HTMLElement>(".hs-perm");
  const permLi = [...scr.querySelectorAll<HTMLElement>("[data-perm]")];
  const keyGrad = scr.querySelector<SVGLinearGradientElement>("[data-key-grad]");
  const keyLim = scr.querySelector<SVGGElement>(".m-key-lim");
  const keyW = +(scr.querySelector(".m-key rect")?.getAttribute("width") || 104);
  const tourLis = [...fig.querySelectorAll<HTMLElement>("[data-step]")];
  const stepHint = fig.querySelector<HTMLElement>("[data-step-hint]");
  const tourN = scr.querySelector<HTMLElement>("[data-tour-n]");
  const bigEl = scr.querySelector<HTMLElement>(".hs-big");
  const whyFault = fig.querySelector<HTMLElement>('[data-why="fault"]');
  const whyAck = fig.querySelector<HTMLElement>('[data-why="ack"]');
  const ctaEl = fig.querySelector<HTMLElement>(".lc-hmi-cta");

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
  /** Transient operator note (refusals, hints). A function, so a refusal keeps showing live values. */
  let note: (() => string) | null = null;
  let noteHtml = false; // note() returns markup (the closing message carries a link)
  let noteTone = "";
  let noteUntil = 0;
  let noteTimer = 0;
  let flashN = 0;
  let stickyKey = "idle"; // message once the plant is idle
  let allClearUntil = 0;
  let liveTimer = 0;
  /** Announced texts → when (dedupe window), and automatic announcements waiting to be coalesced. */
  const lastSaid = new Map<string, number>();
  const pending: string[] = [];
  let flushTimer = 0;
  let sayBuf: string[] = [];
  let sayFrame = 0;
  /** Puts `s` in the polite region now. Automatic items still waiting are appended, and everything said in the same
   *  frame is joined ("Alarms acknowledged. Done: …"), so nothing is cut off. */
  const say = (s: string) => {
    const now = performance.now();
    const parts = [s, ...pending.filter((x) => x !== s && !((lastSaid.get(x) ?? -1e9) > now - 10000))];
    pending.length = 0;
    clearTimeout(flushTimer);
    for (const x of parts) lastSaid.set(x, now);
    sayBuf.push(...parts);
    clearTimeout(liveTimer);
    // emptied now and re-set on the next frame so repeated messages are announced again; cleared later so browse
    // mode never meets a stale announcement after the panel
    if (!sayFrame) {
      live.textContent = "";
      sayFrame = requestAnimationFrame(() => {
        live.textContent = sayBuf.join(" ");
        sayBuf = [];
        sayFrame = 0;
      });
    }
    liveTimer = window.setTimeout(() => (live.textContent = ""), 6000);
  };
  /** Automatic events (alarms, FDV, CIP phases): collected for ~0.8 s after the last one, then announced once —
   *  unique, at most three ("and N more"), skipping anything said in the last 10 s. */
  function flushSay(): void {
    clearTimeout(flushTimer);
    const now = performance.now();
    const items = [...new Set(pending)].filter((x) => !((lastSaid.get(x) ?? -1e9) > now - 10000));
    pending.length = 0;
    if (!items.length) return;
    const shown = items.slice(0, 3);
    if (items.length > 3) shown.push(fill(T.msg.more, { n: items.length - 3 }));
    say(shown.join(" "));
    for (const x of items) lastSaid.set(x, now);
  }
  const queueSay = (items: string[]) => {
    pending.push(...items);
    clearTimeout(flushTimer);
    flushTimer = window.setTimeout(flushSay, 800);
  };
  const alarmText = (a: Alarm) => {
    const arg = a.key === "evRecipe" ? T.recipe[a.arg || ""] || a.arg : a.arg;
    const lim = a.arg && a.key === "almDivert" ? f1(+a.arg) : a.arg || "";
    return iso(fill(T.alarms[a.key] || a.key, { limit: lim, arg: arg || "" }));
  };
  const flash = (fn: () => string, tone = "warn", ms = 5000, html = false) => {
    note = fn;
    noteHtml = html;
    noteTone = tone;
    noteUntil = performance.now() + ms;
    msgEl.dataset.flash = String(++flashN % 2); // restarts the 160 ms highlight (CSS)
    // idle panel (no 10 Hz tick): repaint once when the note expires, so the "Press Start" prompt comes back
    clearTimeout(noteTimer);
    noteTimer = window.setTimeout(() => !timer && render(), ms + 20);
  };

  // ---------------------------------------------------------------- "Try it" checklist
  const tour: Record<Step, boolean> = { start: false, forward: false, fault: false, ack: false };
  let tourDone = false;
  let faultClicked = false; // "Simulate fault" pressed (the step ticks once the fault has played out)
  let sawDivert = false; // … the FDV has diverted since
  let ackedEarly = false; // Acknowledge pressed while the fault was still developing
  /** Closing message: what the visitor just did, plus a real link to the quote form. */
  const doneHtml = () =>
    `${esc(iso(T.msg.tourDone))} <a class="hs-link" href="${esc(T.quote)}">${esc(T.msg.tourCta)}</a>`;
  function renderTour(): void {
    const cur = STEPS.find((k) => !tour[k]);
    for (const li of tourLis) {
      const k = li.dataset.step as Step;
      attr(li, "data-done", tour[k] ? "" : null);
      attr(li, "aria-current", k === cur ? "step" : null);
      const st = li.querySelector("[data-step-st]");
      const tx = tour[k] ? `${T.comma}${T.tour.done}` : "";
      if (st && st.textContent !== tx) st.textContent = tx;
    }
    if (stepHint) stepHint.hidden = !(cur === "fault" && faultClicked);
    if (tourN) {
      const n = cur ? STEPS.indexOf(cur) + 1 : STEPS.length;
      const tx = `${n}/${STEPS.length}`;
      if (tourN.textContent !== tx) tourN.textContent = tx;
      attr(tourN, "data-done", cur ? null : "");
    }
    if (!cur && !tourDone) {
      tourDone = true;
      flash(doneHtml, "ok", 9000, true);
      say(iso(T.msg.tourDone));
      // the CTA's amber trace draws when the visitor can see it, not off screen (MOT2-11 / W-04)
      if (ctaEl && "IntersectionObserver" in window) {
        const io = new IntersectionObserver(
          (es) => {
            if (!es.some((e) => e.isIntersecting)) return;
            io.disconnect();
            fig.setAttribute("data-tour-done", "");
          },
          { threshold: 1 },
        );
        io.observe(ctaEl);
      } else fig.setAttribute("data-tour-done", "");
    }
  }

  let lastFwdAt = -1e9;
  /** `now`: the events answer a click (mode, recipe, Start…): announce them at once instead of coalescing. */
  function handleEvents(now = false): void {
    const ann: string[] = [];
    const t = performance.now();
    // the divert alarm already says "product diverted": no separate "FDV divert" in the same batch
    const divAlarm = sim.events.some((e) => e.type === "alarm" && e.alarm.key === "almDivert");
    const unackP1 = sim.alarms.some((a) => a.prio === 1 && !a.acked);
    for (const e of sim.events) {
      if (e.type === "alarm") {
        const a = e.alarm;
        ann.push(a.prio ? fill(T.msg.alarm, { prio: T.alarms[`p${a.prio}`], text: alarmText(a) }) : alarmText(a));
        if (a.key === "evCipDone") stickyKey = "cipDone";
      } else if (e.type === "fdv" && sim.producing) {
        if (e.fwd) {
          lastFwdAt = t;
          ann.push(T.msg.fdvFwd);
        } else if (!divAlarm && !(unackP1 && t - lastFwdAt < 5000)) ann.push(T.msg.fdvDiv); // no quick flip-back
      } else if (e.type === "cip" && e.phase >= 0) ann.push(`${T.cip.title}${T.colon}${T.cip[CIP[e.phase][0]]}`);
    }
    if (sim.events.length) {
      if (motionOff()) clockNow(); // no ticking clock: keep it in step with the time stamps
      alarmsDirty = true;
    }
    sim.events.length = 0;
    if (ann.length) queueSay(ann);
    if (now && pending.length) flushSay();
  }

  // ---------------------------------------------------------------- rendering
  let alarmsDirty = true;
  let lastCip = -2;
  let lastLimit = -1;
  let msgKey = "";
  const setMsg = (text: string, html?: string) => {
    const k = html ?? text;
    if (k === msgKey) return;
    msgKey = k;
    if (html) msgTx.innerHTML = html;
    else msgTx.textContent = text;
  };
  /** "Press [▶ Start] to run the pasteurizer.": the Start key drawn as a key cap (same markup as HmiDemo.astro). */
  const PRESS = esc(iso(T.msg.press)).replace(
    "{key}",
    `<span class="hs-key"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 3l8 5-8 5z"/></svg>${esc(T.controls.start)}</span>`,
  );

  let etaShown = 0; // the fault ETA last shown (s): the countdown never goes back up
  function render(): void {
    const s = sim;
    const R = s.R;
    const cip = s.cip >= 0;
    const tt = s.tt102;
    const unack = s.alarms.filter((a) => a.prio > 0 && !a.acked);
    const producing = s.producing;
    const abn = producing && s.produced && !s.fwd;
    const faulted = producing && (s.fault > 0 || s.steam < 2);
    const now = performance.now();

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
    attr(scr, "data-fault", faulted ? "1" : null);
    attr(scr, "data-unack", String(unack.length));

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
    set("mode", cip ? "CIP" : s.manual ? T.mode.manual : T.mode.auto);
    // after CIP the line is "ready" at once (the message says so) while the pump winds down (MOT2-23)
    const idleReady = stickyKey === "cipDone" || (stickyKey === "idle" && s.q === 0);
    set("state", cip ? T.status.cip : !s.running ? (idleReady ? T.status.ready : T.status.stopped) : s.fwd ? T.status.forward : s.produced ? T.status.divert : T.status.heating);
    set("almCount", String(unack.length));

    // colour key follows the recipe's legal limit
    if (R.limit !== lastLimit) {
      lastLimit = R.limit;
      keyGrad?.querySelectorAll("stop").forEach((st, i) => {
        const [o, c] = keyStops(R.limit)[i] ?? [1, ""];
        attr(st, "offset", o.toFixed(3));
        attr(st, "stop-color", c);
      });
      attr(keyLim!, "transform", `translate(${(((R.limit - KEY_T0) / (KEY_T1 - KEY_T0)) * keyW).toFixed(1)} 0)`);
      set("keyLim", String(R.limit));
    }

    // tank levels
    for (const r of lvls) {
      const k = r.dataset.lvl;
      const f = k === "raw" ? s.rawL / 2000 : k === "bt" ? s.btL / 30 : s.stoL / 2000;
      const h = +r.dataset.h! * f;
      attr(r, "y", (+r.dataset.y0! + +r.dataset.h! - h).toFixed(1));
      attr(r, "height", h.toFixed(1));
    }

    // pipes: state (0 empty / 1 full / 2 flowing) + colour; under-limit product in the holding tube after the batch
    // has produced is abnormal: amber dashes (data-cold) that travel with the slug
    const fluidC = s.fluid !== "milk" ? FLUID[s.fluid] : "";
    const flowing = s.q > 50;
    const segs = s.tubeSegments(16);
    const lim = R.limit;
    for (const p of flows) {
      const k = p.dataset.p!;
      let st = 1;
      let t = tt;
      let cold = false;
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
          cold = producing && s.produced && !fluidC && Math.min(...segs.slice(a, b)) < lim;
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
      if (k === "hold") attr(p, "data-cold", cold ? "" : null);
      if (k !== "ice" && k !== "steam") {
        const c = k.startsWith("hw") ? plainColor(t) : fluidC && k !== "raw" ? fluidC : productColor(t, lim);
        if (p.style.stroke !== c) p.style.stroke = c;
      }
    }
    const bt = lvls.find((r) => r.dataset.lvl === "bt");
    if (bt) bt.style.fill = fluidC || productColor(s.tbt, lim).replace("rgb", "rgba").replace(")", ",.45)");

    // analog indicator: span limit-8 … limit+6 (pointer moved with a composited translate)
    const lo = cip ? 20 : R.limit - 8;
    const span = cip ? 70 : 14;
    const pc = (v: number) => `${Math.max(0, Math.min(100, ((v - lo) / span) * 100)).toFixed(1)}%`;
    ai.style.setProperty("--pv", pc(tt));
    ai.style.setProperty("--sp", pc(s.spActive));
    ai.style.setProperty("--lim", pc(cip ? -99 : R.limit));
    ai.style.setProperty("--b0", pc(cip ? s.spActive - 3 : R.limit));
    ai.style.setProperty("--bw", `${((cip ? 6 : s.sp + 1.5 - R.limit) / span) * 100}%`);

    // FDV forward permissive (what the PLC checks before it energises the FDV), state in words for AT
    if (perm) {
      const ok: Record<string, boolean> = {
        temp: tt >= R.limit,
        check: s.okT >= CHECK_S,
        dp: producing && s.q > 50,
        hold: producing && s.holdS >= R.hold,
      };
      permLi.forEach((li) => {
        const on = ok[li.dataset.perm!];
        attr(li, "data-ok", on ? "" : null);
        const sr = li.querySelector("[data-perm-st]");
        const tx = `${T.comma}${on ? T.perm.met : T.perm.notMet}`;
        if (sr && sr.textContent !== tx) sr.textContent = tx;
      });
      const all = Object.values(ok).every(Boolean);
      attr(perm, "data-ok", all ? "" : null);
      set("permSt", all ? T.perm.ok : T.perm.blocked);
      set("permTemp", iso(fill(T.perm.temp, { limit: f1(R.limit) })));
      set("permCheck", iso(fill(T.perm.check, { s: CHECK_S })));
      set("permHold", iso(fill(T.perm.hold, { hold: R.hold })));
    }

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
    // why a key is dimmed, as its description (aria-describedby), not only as a transient visual note (A11Y2-09)
    const whyF = producing ? "" : cip ? T.msg.faultInCip : T.msg.faultNeedsRun;
    if (whyFault && whyFault.textContent !== whyF) whyFault.textContent = whyF;
    const whyA = unack.length ? "" : T.msg.noAlarms;
    if (whyAck && whyAck.textContent !== whyA) whyAck.textContent = whyA;

    // "Try it": progress + the amber lamp on the next key. "Simulate a fault" stays current until the fault has played
    // out (diverted, then forward again) — or the plant was stopped; only then is Acknowledge next (MOT2-11).
    if (tour.start && producing && s.fwd) tour.forward = true;
    if (faultClicked && !tour.fault) {
      if (producing && s.produced && !s.fwd) sawDivert = true;
      if ((sawDivert && s.fwd) || !producing) tour.fault = true;
    }
    // acknowledged while it was still developing and nothing is left to acknowledge: that step is done too
    if (tour.fault && !tour.ack && ackedEarly && !unack.length) tour.ack = true;
    const developing = faultClicked && !tour.fault && producing && !sawDivert;
    const next = !tour.start || (!s.running && !tour.forward) ? "start" : !tour.forward ? "" : !faultClicked ? (producing ? "fault" : "start") : !tour.fault ? "" : !tour.ack && unack.length ? "ack" : "";
    btns.forEach((b) => attr(b, "data-next", b.dataset.c === next ? "" : null));
    // what to watch while the fault develops: the TT-102 headline (static amber outline, CSS)
    if (bigEl) attr(bigEl, "data-next", developing ? "" : null);
    // the Acknowledge key's attention ring: from the divert on (not while the visitor should be watching TT-102)
    attr(scr, "data-ack-cue", unack.length && !developing ? "" : null);
    renderTour();

    // CIP stepper (current phase marked for AT, finished phases say so)
    if (cip || lastCip !== s.cip) {
      cipLis.forEach((li, i) => {
        attr(li, "data-st", i < s.cip ? "done" : i === s.cip ? "on" : null);
        attr(li, "aria-current", i === s.cip ? "step" : null);
        li.style.setProperty("--p", i === s.cip ? `${((s.cipT / CIP[i][1]) * 100).toFixed(0)}%` : "0%");
        const sr = li.querySelector("[data-ph-st]");
        const tx = i < s.cip ? `${T.comma}${T.cip.done}` : "";
        if (sr && sr.textContent !== tx) sr.textContent = tx;
      });
      set("cipLeft", cip ? iso(fill(T.cip.left, { s: Math.ceil((CIP[s.cip][1] - s.cipT) / SPEED) })) : "");
      lastCip = s.cip;
    }

    // operator message line
    let m: string;
    let tone = "";
    let mHtml = "";
    if (!faulted || abn) etaShown = 0;
    if (note && now < noteUntil) {
      if (noteHtml) mHtml = note();
      m = noteHtml ? "" : note();
      tone = noteTone;
    } else if (cip) m = `${T.cip.title}${T.colon}${T.cip[CIP[s.cip][0]]}`;
    else if (faulted) {
      tone = "warn";
      if (abn) m = fill(T.msg.recovering, { limit: f1(R.limit) });
      else if (s.produced && s.fwd) {
        // one sentence from the click to the divert (MOT2-23): "reaches TT-102 in about N s", counting down. Before the
        // cold product is in the tube, estimate it from the transport delay; never count up, never below 1 s.
        const eta = s.coldEta();
        let sec = Math.max(1, Math.round((eta >= 0 ? eta : s.holdS + 2) / SPEED));
        if (etaShown) sec = Math.min(sec, etaShown);
        etaShown = sec;
        m = fill(T.msg.faultEta, { s: sec });
      } else m = T.msg.fault;
    } else if (s.running && s.manual && s.manualFwd && s.blocked) {
      m = fill(T.msg.blocked, { t: f1(tt), limit: f1(R.limit) });
      tone = "warn";
    } else if (s.running && s.manual) m = T.msg.manual;
    else if (s.running && !s.fwd) {
      m = fill(s.produced ? T.msg.recovering : T.msg.heating, { limit: f1(R.limit) });
      tone = s.produced ? "warn" : "";
    } else if (s.running && unack.some((a) => !a.active)) {
      m = T.msg.recoveredAck;
      tone = "warn";
    } else if (s.running && now < allClearUntil) m = fill(T.msg.allClear, { batch: `B-${s.batch}` });
    else if (s.running) m = fill(T.msg.forward, { limit: f1(R.limit), hold: f1(s.holdS) });
    else if (stickyKey === "idle") m = "";
    else m = T.msg[stickyKey] || T.msg.idle;
    if (mHtml) setMsg("", mHtml);
    else if (m) setMsg(iso(m));
    else setMsg("", PRESS);
    attr(msgEl, "data-tone", tone || null);

    if (alarmsDirty) renderAlarms();
  }

  function renderAlarms(): void {
    alarmsDirty = false;
    const rows = sim.alarms.slice(0, 5);
    if (!rows.length) {
      rowsEl.innerHTML = `<div role="row" class="hs-empty"><span role="cell" aria-colspan="5">${esc(T.alarms.empty)}</span></div>`;
      return;
    }
    rowsEl.innerHTML = rows
      .map((a) => {
        const st = a.prio === 0 ? "event" : !a.acked ? "unack" : a.active ? "acked" : "cleared";
        const stTx = a.prio === 0 ? T.alarms.p0 : a.active ? (a.acked ? T.alarms.acked : T.alarms.active) : T.alarms.cleared;
        const d = new Date(a.t);
        const src = a.prio === 0 ? SRC[a.tag] : "";
        return (
          `<div role="row" data-p="${a.prio}" data-st="${st}">` +
          `<span role="cell" class="a-pc"><span class="a-ic" aria-hidden="true">${a.prio || "i"}</span><span class="lc-hmi-sr">${esc(T.alarms[`p${a.prio}`])}</span></span>` +
          `<span role="cell"><time datetime="${d.toISOString()}">${hms(d)}</time></span>` +
          `<span role="cell" class="a-tag${src ? " a-src" : ""}">${esc(src || a.tag)}</span>` +
          `<span role="cell" class="a-tx">${esc(alarmText(a))}</span>` +
          `<span role="cell" class="a-st">${esc(stTx)}</span></div>`
        );
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
    yLbl.forEach((el, i) => {
      const v = String(hi - ((hi - lo) / 2) * i);
      if (el.textContent !== v) el.textContent = v;
    });
  }

  // ---------------------------------------------------------------- stepped motion (marching ants, impellers)
  let phase = 0;
  let rot = 0;
  function animate(dt: number): void {
    if (motionOff()) return;
    if (sim.running || sim.q > 0) {
      const period = 0.7 / Math.max(0.35, sim.q / 3000); // seconds per dash period at this flow
      phase = (phase + (dt / period) * DASH) % DASH;
      flowG.style.setProperty("--dash", (-phase).toFixed(1));
    }
    if (sim.q > 50) {
      rot = (rot + dt * 400) % 360;
      const r = `rotate(${rot.toFixed(0)}deg)`;
      for (const g of imps) g.style.transform = r;
    }
  }

  // ---------------------------------------------------------------- loop + visibility
  let timer = 0;
  let last = 0;
  let acc = 0;
  let lastTrend = 0;
  let restUntil = 0; // keep simulating a little after Stop so the plant visibly winds down
  let visible = false;
  let clock = 0;

  const busy = () => sim.running || sim.q > 0 || performance.now() < restUntil;
  const canRun = () => visible && !document.hidden;

  function tick(): void {
    timer = 0;
    const now = performance.now();
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
    animate(dt);
    render();
    if (now - lastTrend > 250) {
      lastTrend = now;
      renderTrend();
    }
    if (busy() && canRun()) timer = window.setTimeout(tick, TICK);
  }
  function kick(): void {
    if (timer || !busy() || !canRun()) return;
    last = performance.now();
    timer = window.setTimeout(tick, 16);
  }
  const clockNow = () => set("clock", hms(new Date()));
  function syncPause(): void {
    const on = canRun();
    attr(fig, "data-paused", on ? null : "1");
    if (on) kick();
    else {
      clearTimeout(timer);
      timer = 0;
    }
    // the status-bar clock ticks only while the panel is on screen and motion is allowed (else: set on each event)
    const tickClock = on && !motionOff();
    if (tickClock && !clock) {
      clockNow();
      clock = window.setInterval(clockNow, 1000);
    } else if (!tickClock && clock) {
      clearInterval(clock);
      clock = 0;
    }
  }

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      (es) => {
        visible = es[es.length - 1].isIntersecting; // the latest entry (several can queue up in one callback)
        syncPause();
      },
      { rootMargin: "60px 0px" },
    ).observe(fig);
    // the one-time "press Start" cue plays when the Start key itself is fully on screen
    const startB = btn("start")[0];
    if (startB) {
      const seen = new IntersectionObserver(
        (es) => {
          if (!es[0].isIntersecting) return;
          seen.disconnect();
          fig.setAttribute("data-seen", "");
        },
        { threshold: 1 },
      );
      seen.observe(startB);
    }
  } else {
    visible = true;
    syncPause();
  }
  document.addEventListener("visibilitychange", syncPause);
  onMotionChange(() => syncPause());

  // ---------------------------------------------------------------- commands
  scr.addEventListener("click", (ev) => {
    const b = (ev.target as Element).closest<HTMLButtonElement>("button[data-c]");
    if (!b) return;
    const c = b.dataset.c!;
    const s = sim;
    fig.removeAttribute("data-fresh");
    note = null; // a new command replaces any earlier note (refusals never linger into the next state)
    if (b.getAttribute("aria-disabled") === "true") {
      // the refusal is the result of the visitor's own press: shown AND announced (A11Y2-09)
      const why = c === "fault" ? (s.cip >= 0 ? T.msg.faultInCip : T.msg.faultNeedsRun) : c === "ack" ? T.msg.noAlarms : "";
      if (why) {
        flash(() => why, "", c === "fault" ? 4000 : 3000);
        say(iso(why));
      }
      render();
      return;
    }
    switch (c) {
      case "start":
        if (s.cip >= 0) s.stop();
        s.start();
        stickyKey = "idle";
        tour.start = true;
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
        faultClicked = true;
        break;
      case "ack":
        s.ack();
        say(T.msg.acked);
        alarmsDirty = true;
        // the story's last step counts once the fault has played out; an earlier ack is fine (ISA) but not the end
        if (tour.fault) tour.ack = true;
        else if (faultClicked) ackedEarly = true;
        if (s.running && s.fwd) allClearUntil = performance.now() + 5000;
        break;
      case "recipe":
        s.setRecipe(b.dataset.r as RecipeId);
        break;
      case "spDown":
      case "spUp": {
        // announced once the visitor pauses (held / repeated presses do not queue), with the limit when reached
        if (!s.nudgeSp(c === "spUp" ? 0.5 : -0.5)) flash(() => iso(fill(T.msg.spLimit, { v: f1(s.sp) })), "", 2500);
        clearTimeout(spTimer);
        spTimer = window.setTimeout(() => say(iso(fill(s.spAtLimit ? T.msg.spLimit : T.msg.sp, { v: f1(s.sp) }))), 400);
        break;
      }
      case "fdvFwd":
      case "fdvDiv":
        if (!s.commandFdv(c === "fdvFwd")) {
          const refusal = () => iso(fill(T.msg.blocked, { t: f1(s.tt102), limit: f1(s.R.limit) }));
          flash(refusal);
          say(refusal());
        }
        break;
      case "trend": {
        const open = trendBox.dataset.open !== "true";
        trendBox.dataset.open = String(open);
        b.setAttribute("aria-expanded", String(open));
        break;
      }
    }
    if (motionOff()) clockNow();
    handleEvents(true);
    render();
    renderTrend();
    kick();
  });
  let spTimer = 0;

  // Phones: start with the trend collapsed.
  if (fig.clientWidth <= 560) {
    trendBox.dataset.open = "false";
    trendBox.querySelector("button")?.setAttribute("aria-expanded", "false");
  }
  // ---------------------------------------------------------------- stable command keys (MOT2-12)
  /* The message line sits above the command keys. It reserves the height of the longest message the story and its
     refusals can show at the current width, so "Press Acknowledge…" never moves the key it names under the finger.
     Measured on a hidden copy (same width, fonts, step chip) — once, and again only when the width changes. Manual,
     interlock and CIP texts are left out: switching mode is the visitor's own choice, and they would make the line
     needlessly tall. */
  const reserveHtml = (): string[] => {
    const a = { limit: f1(72), hold: f1(15.6), s: 5, batch: "B-1042", t: f1(71.4), v: f1(78) };
    const keys = ["heating", "forward", "fault", "faultEta", "recovering", "recoveredAck", "allClear", "acked", "stopped", "cipDone", "faultNeedsRun", "faultInCip", "noAlarms", "spLimit"];
    return [PRESS, doneHtml(), ...keys.map((k) => esc(iso(fill(T.msg[k] || "", a))))];
  };
  let msgW = 0;
  function reserveMsg(): void {
    const w = msgEl.getBoundingClientRect().width;
    if (w < 40 || Math.abs(w - msgW) < 0.5) return;
    msgW = w;
    const probe = msgEl.cloneNode(true) as HTMLElement;
    probe.removeAttribute("data-flash");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText = `position:absolute;top:0;left:0;width:${w}px;min-height:0;visibility:hidden;pointer-events:none`;
    const ptx = probe.querySelector<HTMLElement>("[data-msg]")!;
    msgEl.parentElement!.append(probe);
    let max = 0;
    for (const h of reserveHtml()) {
      ptx.innerHTML = h;
      max = Math.max(max, probe.getBoundingClientRect().height);
    }
    probe.remove();
    msgEl.style.minHeight = `${Math.ceil(max)}px`;
  }
  if ("ResizeObserver" in window) new ResizeObserver(() => reserveMsg()).observe(msgEl);
  document.fonts?.ready.then(() => {
    msgW = 0;
    reserveMsg();
  });

  // Initial paint of the static snapshot (localised values, recipe data).
  set("limit", `≥ ${f1(RECIPES.milk.limit)} °C`);
  clockNow();
  render();
  reserveMsg();
}
