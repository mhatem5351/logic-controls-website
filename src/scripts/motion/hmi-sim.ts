/**
 * HTST pasteurizer process model for the HMI demo (no DOM — unit-testable in Node).
 *
 * Plant: raw-milk silo → balance tank (LV-101 on/off level control) → feed pump P-101 → FT-101 →
 * PHE regeneration → PHE heating (hot-water loop, steam valve TCV-201 driven by a PI loop on TT-101) →
 * holding tube (plug flow, TT-102 at the outlet) → FDV-101 → forward: regen hot side → cooling → storage,
 * divert: back to the balance tank.
 *
 * The FDV logic mirrors a real pasteurizer: de-energised = divert (fail-safe); forward only after TT-102 has
 * stayed ≥ the legal limit for the "FDV check time"; any sample below the limit diverts immediately.
 * Time runs at SPEED× real time (shown on the HMI) so the 15 s holding time stays honest but watchable.
 */

export const SPEED = 3;
export const DT = 0.05; // fixed physics step, simulated seconds
const TUBE_L = 13; // holding-tube volume, litres
const CELLS = 48; // plug-flow cells in the holding tube
const CELL_L = TUBE_L / CELLS;
const T_RAW = 4;
const T_AMB = 24;
const T_ICE = 1;
const CHECK_S = 2; // FDV check time
const BT_L = 30; // balance tank volume
const RAW_L = 2000;
const STO_L = 2000;

export type RecipeId = "milk" | "cream" | "juice";
export interface Recipe {
  limit: number;
  sp: number;
  flow: number; // L/h
  hold: number; // legal minimum holding time, s
}
export const RECIPES: Record<RecipeId, Recipe> = {
  milk: { limit: 72, sp: 72.5, flow: 3000, hold: 15 },
  cream: { limit: 75, sp: 75.5, flow: 2500, hold: 15 },
  juice: { limit: 85, sp: 85.5, flow: 1400, hold: 30 },
};

/** CIP programme: [phase key, duration s (simulated), temperature SP]. */
export const CIP: [string, number, number][] = [
  ["pre", 9, 45],
  ["caustic", 15, 75],
  ["rinse", 9, 45],
  ["acid", 12, 65],
  ["final", 9, 30],
];

export type Fluid = "milk" | "water" | "caustic" | "acid";
export type Prio = 0 | 1 | 2 | 3; // 0 = event
export interface Alarm {
  key: string;
  tag: string;
  prio: Prio;
  t: number; // epoch ms
  active: boolean;
  acked: boolean;
  arg?: string;
}

export type SimEvent =
  | { type: "alarm"; alarm: Alarm }
  | { type: "fdv"; fwd: boolean }
  | { type: "cip"; phase: number }; // -1 = complete

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export class Pasteurizer {
  // --- commands / modes
  running = false;
  manual = false;
  cip = -1; // phase index, -1 = off
  cipT = 0; // time in current phase
  recipe: RecipeId = "milk";
  sp = RECIPES.milk.sp;
  manualFwd = false; // operator request in manual
  fault = 0; // remaining fault time (s)
  // --- process values
  q = 0; // flow L/h
  tReg = 20; // regen outlet
  th = 24; // TT-101 heater outlet
  thw = 70; // TT-201 hot water
  tbt = T_RAW; // balance tank
  tout = 6; // TT-103 cooler outlet
  steam = 3.0; // PT-201 bar
  u = 0; // TCV-201 output 0..1
  fwd = false;
  okT = 0; // time TT-102 has been ≥ limit
  rawL = RAW_L * 0.82;
  btL = BT_L * 0.5;
  stoL = STO_L * 0.18;
  lv = false; // LV-101 open
  litres = 0;
  batch = 1041;
  produced = false; // forwarded at least once this batch (alarm state-based suppression)
  tube = new Float32Array(CELLS).fill(24);
  private acc = 0; // plug-flow volume accumulator
  private integ = 0; // outer loop integral (°C)
  private integ2 = 0; // inner loop integral (valve fraction)
  hwSp = 75; // hot-water setpoint from the outer loop
  private noiseT = 0;
  private fault0 = 0; // fault-time accumulator for the low-temp alarm
  t = 0; // simulated clock
  fluid: Fluid = "milk";
  alarms: Alarm[] = [];
  events: SimEvent[] = [];

  get R(): Recipe {
    return RECIPES[this.recipe];
  }
  /** TT-102: holding-tube outlet (with a little heat loss + sensor noise). */
  get tt102(): number {
    return this.tube[CELLS - 1] - 0.15 + Math.sin(this.noiseT * 1.7) * 0.04 + Math.sin(this.noiseT * 4.3) * 0.02;
  }
  get holdS(): number {
    return this.q > 50 ? TUBE_L / (this.q / 3600) : 0;
  }
  get spActive(): number {
    return this.cip >= 0 ? CIP[this.cip][2] : this.sp;
  }
  get producing(): boolean {
    return this.running && this.cip < 0;
  }
  /** Holding-tube temperatures resampled to n segments (inlet → outlet), for the mimic colouring. */
  tubeSegments(n: number): number[] {
    const out: number[] = [];
    const per = CELLS / n;
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j < per; j++) s += this.tube[Math.floor(i * per + j)];
      out.push(s / per);
    }
    return out;
  }

  // ------------------------------------------------------------------ commands
  start(): void {
    if (this.running && this.cip < 0) return;
    this.cip = -1;
    this.fluid = "milk";
    this.running = true;
    this.produced = false;
    this.batch++;
    this.litres = 0;
    this.okT = 0;
    this.event("evStart", "SEQ", 0, String(this.batch));
  }
  stop(): void {
    if (!this.running) return;
    const wasCip = this.cip >= 0;
    this.running = false;
    this.cip = -1;
    this.fluid = "milk";
    this.setFwd(false);
    this.clearAll();
    this.event(wasCip ? "evCipAbort" : "evStop", "SEQ", 0);
  }
  setManual(on: boolean): void {
    if (this.manual === on) return;
    this.manual = on;
    this.manualFwd = this.fwd;
    if (!on) this.sp = this.R.sp;
    this.event(on ? "evManual" : "evAuto", "MODE", 0);
  }
  setRecipe(id: RecipeId): void {
    if (id === this.recipe) return;
    this.recipe = id;
    this.sp = this.R.sp;
    this.okT = 0;
    this.produced = false; // new grade: temperature alarms re-arm after the first forward
    this.event("evRecipe", "RCP", 0, id);
  }
  nudgeSp(d: number): void {
    this.sp = clamp(Math.round((this.sp + d) * 10) / 10, this.R.limit - 6, this.R.limit + 6);
  }
  /** Manual FDV command. Returns false when the interlock blocks a forward request. */
  commandFdv(forward: boolean): boolean {
    this.manualFwd = forward;
    return !forward || this.permissive();
  }
  startCip(): void {
    if (this.cip >= 0) return;
    this.running = true;
    this.cip = 0;
    this.cipT = 0;
    this.fault = 0;
    this.setFwd(false);
    this.clearAll();
    this.event("evCip", "CIP", 0);
    this.events.push({ type: "cip", phase: 0 });
  }
  injectFault(): void {
    if (!this.producing) return;
    this.fault = 21;
  }
  ack(): void {
    for (const a of this.alarms) a.acked = true;
    this.alarms = this.alarms.filter((a) => a.active || a.prio === 0);
  }

  /** Forward permissive: TT-102 at or above the legal limit for the check time. */
  permissive(): boolean {
    return this.okT >= CHECK_S;
  }
  /** Production running but the interlock is holding the FDV in divert. */
  get blocked(): boolean {
    return this.producing && !this.permissive();
  }

  // ------------------------------------------------------------------ alarms
  private event(key: string, tag: string, prio: Prio, arg?: string): void {
    const a: Alarm = { key, tag, prio, t: Date.now(), active: prio > 0, acked: prio === 0, arg };
    this.alarms.unshift(a);
    // keep the journal short: drop the oldest events first, then the oldest cleared alarms
    while (this.alarms.length > 12) {
      const i = this.alarms.map((x) => x.prio === 0 || !x.active).lastIndexOf(true);
      this.alarms.splice(i < 0 ? this.alarms.length - 1 : i, 1);
    }
    this.events.push({ type: "alarm", alarm: a });
  }
  private raise(key: string, tag: string, prio: Prio, arg?: string): void {
    const a = this.alarms.find((x) => x.key === key && x.prio > 0);
    if (a?.active) return;
    if (a) this.alarms.splice(this.alarms.indexOf(a), 1);
    this.event(key, tag, prio, arg);
  }
  private clear(key: string): void {
    const a = this.alarms.find((x) => x.key === key && x.prio > 0 && x.active);
    if (!a) return;
    a.active = false;
    if (a.acked) this.alarms.splice(this.alarms.indexOf(a), 1);
  }
  private clearAll(): void {
    for (const k of ["almSteam", "almHeat", "almDivert"]) this.clear(k);
  }
  private setFwd(f: boolean): void {
    if (f === this.fwd) return;
    this.fwd = f;
    this.events.push({ type: "fdv", fwd: f });
  }

  // ------------------------------------------------------------------ physics
  step(): void {
    const dt = DT;
    const R = this.R;
    this.t += dt;
    this.noiseT += dt;

    // CIP sequencer
    if (this.cip >= 0) {
      this.cipT += dt;
      if (this.cipT >= CIP[this.cip][1]) {
        this.cip++;
        this.cipT = 0;
        if (this.cip >= CIP.length) {
          this.cip = -1;
          this.running = false;
          this.fluid = "milk";
          this.setFwd(false);
          this.event("evCipDone", "CIP", 0);
          this.events.push({ type: "cip", phase: -1 });
        } else this.events.push({ type: "cip", phase: this.cip });
      }
      if (this.cip >= 0) this.fluid = (["water", "caustic", "water", "acid", "water"] as Fluid[])[this.cip];
    }

    // flow (feed pump with a soft ramp)
    const qT = !this.running ? 0 : this.cip >= 0 ? 3600 : R.flow;
    this.q += (qT - this.q) * Math.min(1, dt / 1.2);
    if (this.q < 1) this.q = 0;
    const qn = this.q / 3000;
    const qls = this.q / 3600;

    // steam supply (fault injection)
    if (this.fault > 0) this.fault = Math.max(0, this.fault - dt);
    const pT = this.fault > 0 ? 0.4 : 3.0;
    this.steam += (pT - this.steam) * Math.min(1, dt / 0.6);
    const sa = clamp((this.steam - 0.2) / 2.8, 0, 1);

    // heat exchanger sections
    const effH = this.q > 50 ? 1 - Math.exp(-1.609 / Math.max(qn, 0.2)) : 0;
    const effR = 0.82;

    // Cascade control: outer PI on TT-101 (with regen feed-forward) → hot-water SP → inner PI on TT-201 → TCV-201
    if (this.running) {
      const e = this.spActive - this.th;
      const ff = effH > 0.3 ? this.tReg + (this.spActive - this.tReg) / effH : this.spActive + 3;
      const sat = this.u >= 0.999 || this.u <= 0.001;
      if (!sat) this.integ = clamp(this.integ + 0.12 * e * dt, -6, 6);
      this.hwSp = clamp(ff + 0.9 * e + this.integ, 20, 98);
      const e2 = this.hwSp - this.thw;
      const raw = 0.09 * e2 + this.integ2;
      if ((raw < 1 || e2 < 0) && (raw > 0 || e2 > 0)) this.integ2 = clamp(this.integ2 + 0.03 * e2 * dt, 0, 1);
      this.u = clamp(0.09 * e2 + this.integ2, 0, 1);
    } else {
      this.u += (0 - this.u) * Math.min(1, dt / 0.8);
      this.integ2 = this.u;
    }

    const thw = this.thw;
    const thT = this.q > 50 ? this.tReg + effH * (thw - this.tReg) : this.th + (T_AMB - this.th) * 0.02;
    const load = this.q > 50 ? 0.095 * qn * (thT - this.tReg) : 0;
    this.thw += (11 * this.u * sa - 0.048 * (thw - 20) - load) * dt;
    this.th += (thT - this.th) * Math.min(1, dt / 1.4);

    const tt102 = this.tt102;
    const regenHot = this.fwd ? tt102 : this.tbt;
    const tRegT = this.q > 50 ? this.tbt + (this.fwd ? effR : 0) * (regenHot - this.tbt) : this.tReg;
    this.tReg += (tRegT - this.tReg) * Math.min(1, dt / 4);

    // holding tube: plug flow
    if (this.q > 50) {
      this.acc += qls * dt;
      while (this.acc >= CELL_L) {
        this.acc -= CELL_L;
        this.tube.copyWithin(1, 0, CELLS - 1);
        this.tube[0] = this.th;
      }
    } else for (let i = 0; i < CELLS; i++) this.tube[i] += (T_AMB - this.tube[i]) * dt * 0.004;

    // balance tank: level (LV-101 on/off, 40–60 %) and temperature (diverted product returns here)
    const supply = this.cip < 0; // raw milk or CIP supply both feed the balance tank
    const lvl = this.btL / BT_L;
    if (lvl < 0.4) this.lv = this.running && supply;
    if (lvl > 0.6 || !this.running) this.lv = false;
    const qin = this.lv ? 1.35 * qls : 0;
    const qdiv = this.running && !this.fwd && this.q > 50 ? qls : 0;
    const qOut = qls;
    const vol = Math.max(this.btL, 4) + 60; // + pipework / thermal mass
    const tin = this.cip >= 0 ? CIP[this.cip][2] * 0.6 : T_RAW;
    this.tbt += ((qin * (tin - this.tbt) + qdiv * (tt102 - this.tbt)) / vol) * dt;
    this.btL = clamp(this.btL + (qin + qdiv - qOut) * dt, 2, BT_L);
    if (this.cip < 0) this.rawL = Math.max(0, this.rawL - qin * dt);
    if (this.rawL < RAW_L * 0.12) this.rawL = RAW_L * 0.85; // tanker unloaded

    // forward side: regen hot → cooler → storage
    if (this.fwd && this.q > 50) {
      const afterRegen = tt102 - (this.tReg - this.tbt);
      const toutT = afterRegen - 0.82 * (afterRegen - T_ICE);
      this.tout += (toutT - this.tout) * Math.min(1, dt / 2.5);
      if (this.cip < 0) {
        this.litres += qls * dt;
        this.stoL += qls * dt;
        if (this.stoL > STO_L * 0.95) this.stoL = STO_L * 0.2; // storage tank switched
      }
    }

    // FDV logic
    if (tt102 >= R.limit) this.okT += dt;
    else this.okT = 0;
    const perm = this.okT >= CHECK_S;
    if (this.cip >= 0) {
      // CIP: pulse the FDV so both legs are cleaned
      this.setFwd(Math.floor(this.cipT / 3) % 2 === 1);
    } else if (!this.running) this.setFwd(false);
    else if (this.manual) this.setFwd(this.manualFwd && perm);
    else this.setFwd(perm);

    // alarms (state-based: temperature alarms only once the batch has produced)
    if (this.producing && this.fwd) this.produced = true;
    if (this.steam < 1.5 && this.producing) this.raise("almSteam", "PT-201", 2);
    else if (this.steam > 2.0) this.clear("almSteam");
    if (this.producing && this.produced) {
      if (this.th < this.sp - 1.5) this.fault0 += dt;
      else this.fault0 = 0;
      if (this.fault0 > 1) this.raise("almHeat", "TT-101", 3);
      else if (this.th > this.sp - 1) this.clear("almHeat");
      if (!this.fwd && tt102 < R.limit && (!this.manual || this.manualFwd)) this.raise("almDivert", "TT-102", 1, R.limit.toFixed(1));
      else if (this.fwd) this.clear("almDivert");
    }
  }

  /** Advance by `seconds` of simulated time (fixed steps). */
  advance(seconds: number): void {
    const n = Math.min(400, Math.round(seconds / DT));
    for (let i = 0; i < n; i++) this.step();
  }
}
