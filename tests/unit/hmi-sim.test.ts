/**
 * HMI demo model (src/scripts/motion/hmi-sim.ts) and its runtime text glue (hmi-bidi.ts): the story beats the demo's
 * message line and "Try it" checklist rely on, and the no-wrap / bidi rules for numbers and tags.
 */
import { describe, expect, it } from "vitest";
import { CHECK_S, CIP, DT, Pasteurizer, RECIPES, SPEED, type RecipeId } from "~/scripts/motion/hmi-sim";
import { iso } from "~/scripts/motion/hmi-bidi";

const LRI = "⁦";
const PDI = "⁩";
const NBSP = " ";
const WJ = "⁠";

/** Run until the FDV goes forward; returns simulated seconds. */
function toForward(s: Pasteurizer): number {
  let t = 0;
  while (!s.fwd && t < 120) {
    s.step();
    t += 0.05;
  }
  return t;
}

describe("Pasteurizer story", () => {
  it("heats up, then the FDV goes forward within ~10 s of real time", () => {
    const s = new Pasteurizer();
    s.start();
    expect(toForward(s) / SPEED).toBeLessThan(10);
  });

  // MOT2-23: the headline must not climb against the "under-temperature product arrives" story
  for (const delay of [0.5, 3, 10, 30]) {
    it(`a fault ${delay} s after forward: TT-102 stays within 0.4 °C until the cold product diverts, then recovers`, () => {
      const s = new Pasteurizer();
      s.start();
      toForward(s);
      s.advance(delay);
      const pre = s.tt102;
      s.injectFault();
      let t = 0;
      let max = pre;
      let divAt = -1;
      let backAt = -1;
      while (t < 60) {
        s.step();
        t += 0.05;
        if (divAt < 0) {
          if (!s.fwd) divAt = t;
          else max = Math.max(max, s.tt102);
        } else if (backAt < 0 && s.fwd) backAt = t;
      }
      expect(max - pre).toBeLessThan(0.4);
      expect(divAt / SPEED).toBeGreaterThan(4);
      expect(divAt / SPEED).toBeLessThan(8);
      expect(backAt).toBeGreaterThan(divAt);
      // an unacknowledged high-priority divert alarm is waiting when the plant has recovered (the story's last step)
      expect(s.alarms.some((a) => a.key === "almDivert" && !a.acked)).toBe(true);
    });
  }

  it("the heating setpoint steps by 0.5 °C and reports its limit (limit ± 6 °C)", () => {
    const s = new Pasteurizer();
    expect(s.nudgeSp(0.5)).toBe(true);
    expect(s.sp).toBe(73);
    for (let i = 0; i < 20; i++) s.nudgeSp(0.5);
    expect(s.sp).toBe(78);
    expect(s.spAtLimit).toBe(true);
    expect(s.nudgeSp(0.5)).toBe(false);
  });
});

/** Steps until `done` (at most `maxS` simulated seconds); returns the number of steps taken. */
function stepUntil(s: Pasteurizer, done: () => boolean, maxS = 120): number {
  let n = 0;
  while (!done() && n * DT < maxS) {
    s.step();
    n++;
  }
  return n;
}
/** A plant producing in forward flow on the given recipe. */
function forwardPlant(recipe: RecipeId = "milk"): Pasteurizer {
  const s = new Pasteurizer();
  s.setRecipe(recipe);
  s.start();
  stepUntil(s, () => s.fwd);
  expect(s.fwd).toBe(true);
  return s;
}
/** Fill the whole holding tube at `t` °C (TT-102 reads the outlet cell, ±0.2 °C of loss and noise). */
const fillTube = (s: Pasteurizer, t: number) => s.tube.fill(t);
const alarm = (s: Pasteurizer, key: string) => s.alarms.find((a) => a.key === key && a.prio > 0);

describe("Pasteurizer: commands and states (deterministic steps)", () => {
  it("at rest: stopped, divert, no permissive, nothing flows or counts while stepping", () => {
    const s = new Pasteurizer();
    expect([s.running, s.producing, s.fwd, s.permissive(), s.blocked]).toEqual([false, false, false, false, false]);
    s.advance(10);
    expect([s.q, s.fwd, s.litres]).toEqual([0, false, 0]);
    expect(s.holdS).toBe(0);
    expect(s.coldEta()).toBe(-1);
  });

  it("start: a new batch, logged as an event (not an alarm); a second start while producing does nothing", () => {
    const s = new Pasteurizer();
    const batch = s.batch;
    s.start();
    expect(s.running && s.producing).toBe(true);
    expect(s.batch).toBe(batch + 1);
    expect(s.alarms[0]).toMatchObject({ key: "evStart", tag: "SEQ", prio: 0, active: false, acked: true, arg: String(batch + 1) });
    expect(s.blocked).toBe(true); // producing, but the interlock holds the FDV in divert until TT-102 is proven
    s.start();
    expect(s.batch).toBe(batch + 1);
    expect(s.alarms.filter((a) => a.key === "evStart")).toHaveLength(1);
  });

  it("forward only once TT-102 has stayed at or above the limit for the FDV check time (CHECK_S)", () => {
    const s = new Pasteurizer();
    s.start();
    for (let n = 0; n < 2400 && !s.fwd; n++) {
      s.step();
      // the interlock: in auto, forward ⇔ the check timer has run out
      expect(s.fwd, `t=${(n * DT).toFixed(2)} s, okT=${s.okT}`).toBe(s.okT >= CHECK_S);
    }
    expect(s.fwd).toBe(true);
    expect(s.okT).toBeGreaterThanOrEqual(CHECK_S);
    expect(s.okT).toBeLessThan(CHECK_S + DT + 1e-9); // the first step the timer allows it, not later
    expect(s.events).toContainEqual({ type: "fdv", fwd: true });
    expect(s.blocked).toBe(false);
  });

  it("a hot product proven again after a divert: forward exactly CHECK_S later", () => {
    const s = forwardPlant();
    fillTube(s, RECIPES.milk.limit - 5);
    s.step();
    expect(s.fwd).toBe(false);
    fillTube(s, RECIPES.milk.limit + 2);
    const n = stepUntil(s, () => s.fwd, 10);
    expect(s.fwd).toBe(true);
    expect(n * DT).toBeGreaterThanOrEqual(CHECK_S - 1e-9);
    expect(n * DT).toBeLessThanOrEqual(CHECK_S + DT + 1e-9);
  });

  it("any sample below the limit diverts at once and raises the high-priority divert alarm (TT-102, limit in its text)", () => {
    const s = forwardPlant();
    fillTube(s, RECIPES.milk.limit - 3);
    s.step();
    expect(s.fwd).toBe(false);
    expect(s.okT).toBe(0);
    expect(s.events.filter((e) => e.type === "fdv").at(-1)).toEqual({ type: "fdv", fwd: false });
    expect(alarm(s, "almDivert")).toMatchObject({ tag: "TT-102", prio: 1, active: true, acked: false, arg: RECIPES.milk.limit.toFixed(1) });
  });

  it("the divert alarm clears when the plant is forward again, and stays in the list until acknowledged", () => {
    const s = forwardPlant();
    fillTube(s, RECIPES.milk.limit - 3);
    s.step();
    fillTube(s, RECIPES.milk.limit + 2);
    stepUntil(s, () => s.fwd, 10);
    expect(alarm(s, "almDivert")).toMatchObject({ active: false, acked: false });
    s.ack();
    expect(alarm(s, "almDivert")).toBeUndefined();
    expect(s.alarms.some((a) => a.key === "evStart")).toBe(true); // events stay in the journal
  });

  it("acknowledge: active alarms stay listed (acknowledged), cleared ones leave", () => {
    const s = forwardPlant();
    fillTube(s, RECIPES.milk.limit - 3);
    s.step();
    s.ack();
    expect(alarm(s, "almDivert")).toMatchObject({ active: true, acked: true });
    expect(s.alarms.every((a) => a.acked)).toBe(true);
  });

  it("simulate fault: only while producing; the steam pressure alarm (PT-201) follows, and clears after recovery", () => {
    const idle = new Pasteurizer();
    idle.injectFault();
    expect(idle.fault).toBe(0);

    const s = forwardPlant();
    s.injectFault();
    expect(s.fault).toBeGreaterThan(0);
    stepUntil(s, () => !!alarm(s, "almSteam"), 10);
    expect(alarm(s, "almSteam")).toMatchObject({ tag: "PT-201", prio: 2, active: true });
    stepUntil(s, () => s.fault === 0 && s.fwd && !alarm(s, "almSteam")?.active, 90);
    expect(s.fault).toBe(0);
    expect(alarm(s, "almSteam")?.active).toBe(false);
    expect(s.fwd).toBe(true);
  });

  it("stop: divert at once, active alarms clear, logged as an event; stopping a stopped plant does nothing", () => {
    const s = forwardPlant();
    s.injectFault();
    stepUntil(s, () => !!alarm(s, "almSteam"), 10);
    s.stop();
    expect([s.running, s.fwd]).toEqual([false, false]);
    expect(s.alarms.filter((a) => a.prio > 0 && a.active)).toEqual([]);
    expect(s.alarms[0]).toMatchObject({ key: "evStop", prio: 0 });
    const n = s.alarms.length;
    s.stop();
    expect(s.alarms).toHaveLength(n);
  });

  it("litres are counted only while the product goes forward", () => {
    const s = new Pasteurizer();
    s.start();
    stepUntil(s, () => s.fwd);
    expect(s.litres).toBe(0);
    s.advance(6);
    // ≈ flow × time (3000 L/h for 6 s = 5 L)
    expect(s.litres).toBeGreaterThan(4.5);
    expect(s.litres).toBeLessThan(5.5);
  });
});

describe("Pasteurizer: manual mode (operator FDV command behind the interlock)", () => {
  it("in manual the FDV stays in divert until the operator commands forward, and only while permitted", () => {
    const s = new Pasteurizer();
    s.setManual(true);
    expect(s.alarms[0]).toMatchObject({ key: "evManual", prio: 0 });
    s.start();
    stepUntil(s, () => s.permissive());
    s.advance(3);
    expect(s.permissive()).toBe(true);
    expect(s.fwd).toBe(false); // permitted, but not commanded
    expect(s.commandFdv(true)).toBe(true);
    s.step();
    expect(s.fwd).toBe(true);
    expect(s.commandFdv(false)).toBe(true);
    s.step();
    expect(s.fwd).toBe(false);
  });

  it("a forward command without the permissive is refused (returns false) and the valve stays in divert", () => {
    const s = new Pasteurizer();
    s.setManual(true);
    s.start();
    expect(s.commandFdv(true)).toBe(false);
    s.advance(5);
    expect(s.permissive()).toBe(false);
    expect(s.fwd).toBe(false);
    // the cold product alarm is not raised before the batch has produced (state-based suppression)
    expect(alarm(s, "almDivert")).toBeUndefined();
  });

  it("the setpoint steps within limit ± 6 °C, and back in auto it returns to the recipe setpoint", () => {
    const s = new Pasteurizer();
    s.setManual(true);
    for (let i = 0; i < 40; i++) s.nudgeSp(-0.5);
    expect(s.sp).toBe(RECIPES.milk.limit - 6);
    expect(s.spAtLimit).toBe(true);
    expect(s.nudgeSp(-0.5)).toBe(false);
    s.setManual(false);
    expect(s.sp).toBe(RECIPES.milk.sp);
    expect(s.alarms[0]).toMatchObject({ key: "evAuto", prio: 0 });
    s.setManual(false); // no change, no event
    expect(s.alarms.filter((a) => a.key === "evAuto")).toHaveLength(1);
  });
});

describe("Pasteurizer: recipes", () => {
  for (const id of Object.keys(RECIPES) as RecipeId[]) {
    it(`${id}: reaches forward flow and keeps the legal holding time at full flow (≥ ${RECIPES[id].hold} s)`, () => {
      const s = forwardPlant(id);
      s.advance(15);
      expect(s.fwd).toBe(true);
      expect(s.tt102).toBeGreaterThanOrEqual(RECIPES[id].limit);
      expect(s.holdS).toBeGreaterThanOrEqual(RECIPES[id].hold);
    });
  }

  it("changing the grade: new setpoint, the proof starts again, and its temperature alarms re-arm only after its first forward", () => {
    const s = forwardPlant("milk");
    s.setRecipe("juice");
    expect(s.sp).toBe(RECIPES.juice.sp);
    expect(s.okT).toBe(0);
    expect(s.alarms[0]).toMatchObject({ key: "evRecipe", prio: 0, arg: "juice" });
    s.step();
    expect(s.fwd).toBe(false); // 72 °C product is below the juice limit (85 °C)
    stepUntil(s, () => s.fwd);
    expect(s.fwd).toBe(true);
    // heating up to the new grade was not an alarm
    expect(s.alarms.filter((a) => a.prio > 0)).toEqual([]);
    const n = s.alarms.length;
    s.setRecipe("juice"); // the same grade again: nothing happens
    expect(s.alarms).toHaveLength(n);
  });
});

describe("Pasteurizer: CIP programme", () => {
  it("runs pre-rinse → caustic → rinse → acid → final rinse on time, pulses the FDV, then stops by itself", () => {
    const s = new Pasteurizer();
    s.startCip();
    expect([s.running, s.producing, s.cip, s.fwd]).toEqual([true, false, 0, false]);
    expect(s.alarms[0]).toMatchObject({ key: "evCip", prio: 0 });
    s.injectFault(); // not producing: no fault during cleaning
    expect(s.fault).toBe(0);

    const ends = CIP.reduce<number[]>((acc, [, d]) => [...acc, (acc.at(-1) ?? 0) + d], []);
    const seen: { phase: number; t: number; fluid: string }[] = [];
    let fwdSeen = false;
    let t = 0;
    let last = 0;
    while (s.running && t < 70) {
      s.step();
      t += DT;
      if (s.fwd) fwdSeen = true;
      if (s.cip !== last) {
        seen.push({ phase: s.cip, t, fluid: s.fluid });
        last = s.cip;
      }
      if (s.cip >= 0) expect(s.spActive).toBe(CIP[s.cip]![2]);
    }
    expect(seen.map((p) => p.phase)).toEqual([1, 2, 3, 4, -1]);
    expect(seen.map((p) => p.fluid)).toEqual(["caustic", "water", "acid", "water", "milk"]);
    seen.forEach((p, i) => expect(Math.abs(p.t - ends[i]!), `phase ${p.phase}`).toBeLessThanOrEqual(3 * DT));
    expect(fwdSeen).toBe(true); // both legs of the FDV are cleaned
    expect([s.running, s.fwd, s.cip]).toEqual([false, false, -1]);
    expect(s.events.filter((e) => e.type === "cip")).toEqual([0, 1, 2, 3, 4, -1].map((phase) => ({ type: "cip", phase })));
    expect(s.alarms[0]).toMatchObject({ key: "evCipDone", prio: 0 });
    expect(s.litres).toBe(0); // cleaning solution is not product
  });

  it("stopping during CIP aborts it (logged as an abort, not a stop)", () => {
    const s = new Pasteurizer();
    s.startCip();
    s.advance(5);
    s.stop();
    expect([s.running, s.cip]).toEqual([false, -1]);
    expect(s.alarms[0]).toMatchObject({ key: "evCipAbort", prio: 0 });
  });
});

describe("Pasteurizer: bounded bookkeeping", () => {
  it("advance() catches up at most 20 s of simulated time per call (a tab back from the background)", () => {
    const s = new Pasteurizer();
    s.advance(600);
    expect(s.t).toBeCloseTo(400 * DT, 6);
  });

  it("the alarm journal keeps the 12 newest entries, newest first", () => {
    const s = new Pasteurizer();
    for (let i = 0; i < 20; i++) s.setManual(i % 2 === 0);
    expect(s.alarms).toHaveLength(12);
    expect(s.alarms[0]!.key).toBe("evAuto");
    expect(s.alarms[1]!.key).toBe("evManual");
  });

  it("coldEta: how long until the most downstream under-limit product reaches TT-102 (-1: none, or no flow)", () => {
    const s = forwardPlant();
    fillTube(s, RECIPES.milk.limit + 2);
    expect(s.coldEta()).toBe(-1);
    const cells = s.tube.length;
    s.tube[cells - 1 - 12] = RECIPES.milk.limit - 4;
    const cellL = 13 / cells; // holding-tube volume / plug-flow cells
    expect(s.coldEta()).toBeCloseTo((12 * cellL) / (s.q / 3600), 6);
    s.tube[cells - 1] = RECIPES.milk.limit - 4;
    expect(s.coldEta()).toBe(0);
  });
});

describe("iso(): runtime bidi + no-wrap glue", () => {
  it("isolates a number with its unit and glues them with a no-break space", () => {
    expect(iso("Below 72.0 °C: product diverted")).toBe(`Below ${LRI}72.0${NBSP}°C${PDI}: product diverted`);
    expect(iso("ثبات القراءة لمدة 2 s")).toBe(`ثبات القراءة لمدة ${LRI}2${NBSP}s${PDI}`);
    expect(iso("72,0 °C altında")).toBe(`${LRI}72,0${NBSP}°C${PDI} altında`);
    expect(iso("≥ 15 s")).toBe(`${LRI}≥${NBSP}15${NBSP}s${PDI}`);
  });
  it("keeps tag codes whole (no break after the hyphen) and does not isolate their digits", () => {
    expect(iso("reaches TT-102 in about 5 s")).toBe(`reaches TT-${WJ}102 in about ${LRI}5${NBSP}s${PDI}`);
    expect(iso("ISA-18.2")).toBe(`ISA-${WJ}18.2`);
  });
  it("is idempotent", () => {
    const once = iso("TT-102 is 71.4 °C, below the 72.0 °C limit. Batch B-1042.");
    expect(iso(once)).toBe(once);
  });
});
