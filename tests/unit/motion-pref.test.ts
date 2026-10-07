/**
 * The site-wide "Pause animations" preference (src/scripts/motion/motion-pref.ts, WCAG 2.2.2): the contract every
 * decorative loop relies on — html[data-motion="off"] ⇔ still, the OS reduced-motion setting is a floor the switch
 * cannot lift, the choice persists in localStorage.lcMotion, and every change (toggle, OS setting, another tab)
 * dispatches "lc:motion" { off, locked }. Run against fake browser globals (tests/unit/fake-dom.ts).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeDom, type FakeDom } from "./fake-dom";

type MotionPref = typeof import("~/scripts/motion/motion-pref");

/** Fresh module on fresh globals (it reads document / matchMedia on import). */
async function load(opts: Parameters<typeof installFakeDom>[0] = {}): Promise<[MotionPref, FakeDom]> {
  const dom = installFakeDom(opts);
  vi.resetModules();
  return [await import("~/scripts/motion/motion-pref"), dom];
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("motionOff() / scrollBehavior() read html[data-motion]", () => {
  it("motion on: smooth scripted scrolls", async () => {
    const [m] = await load();
    expect(m.motionOff()).toBe(false);
    expect(m.scrollBehavior()).toBe("smooth");
    expect(m.systemReduced()).toBe(false);
  });

  it("data-motion=off (set before first paint by the head script): still, instant scrolls", async () => {
    const [m] = await load({ dataset: { motion: "off" } });
    expect(m.motionOff()).toBe(true);
    expect(m.scrollBehavior()).toBe("auto");
  });

  it("the module never decides the initial state itself (the head script does): importing changes nothing", async () => {
    const [m, dom] = await load({ stored: { lcMotion: "off" } });
    expect(m.motionOff()).toBe(false);
    expect(dom.html.dataset).toEqual({});
    expect(dom.motionEvents).toEqual([]);
  });
});

describe("setMotionOff(): the toggle press", () => {
  it("pausing persists 'off', sets data-motion and announces { off: true, locked: false }", async () => {
    const [m, dom] = await load();
    m.setMotionOff(true);
    expect(dom.storage.get("lcMotion")).toBe("off");
    expect(dom.html.dataset.motion).toBe("off");
    expect(m.motionOff()).toBe(true);
    expect(m.scrollBehavior()).toBe("auto");
    expect(dom.motionEvents).toEqual([{ off: true, locked: false }]);
  });

  it("switching back on persists 'on', clears data-motion and marks the entrances as played (MOT2-20)", async () => {
    const [m, dom] = await load({ dataset: { motion: "off", intro: "", fabPing: "" }, stored: { lcMotion: "off" } });
    m.setMotionOff(false);
    expect(dom.storage.get("lcMotion")).toBe("on");
    expect(dom.html.dataset).toEqual({ vt: "" });
    expect(m.motionOff()).toBe(false);
    expect(dom.motionEvents).toEqual([{ off: false, locked: false }]);
  });

  it("no event when nothing changes (pausing twice)", async () => {
    const [m, dom] = await load();
    m.setMotionOff(true);
    m.setMotionOff(true);
    expect(dom.motionEvents).toHaveLength(1);
  });

  it("cannot switch motion on while the OS asks for reduced motion (the choice is still remembered)", async () => {
    const [m, dom] = await load({ reduced: true, dataset: { motion: "off" } });
    expect(m.systemReduced()).toBe(true);
    m.setMotionOff(false);
    expect(dom.storage.get("lcMotion")).toBe("on");
    expect(m.motionOff()).toBe(true);
    expect(dom.html.dataset.vt).toBeUndefined();
    expect(dom.motionEvents).toEqual([]);
  });

  it("blocked storage (private mode, sandbox): the switch still works for this page", async () => {
    const [m, dom] = await load({ storageThrows: true });
    expect(() => m.setMotionOff(true)).not.toThrow();
    expect(m.motionOff()).toBe(true);
    expect(dom.motionEvents).toEqual([{ off: true, locked: false }]);
  });
});

describe("the OS reduced-motion setting, followed live", () => {
  it("turning it on stills everything and locks the switch, even when motion was already paused", async () => {
    const [m, dom] = await load({ dataset: { motion: "off" }, stored: { lcMotion: "off" } });
    dom.reduce.set(true);
    expect(m.motionOff()).toBe(true);
    // `off` did not change, but `locked` did: the event still fires, so a "locked by your device" note never goes stale
    expect(dom.motionEvents).toEqual([{ off: true, locked: true }]);
  });

  it("turning it off restores the stored choice: motion back on unless the visitor paused it", async () => {
    const [m, dom] = await load({ reduced: true, dataset: { motion: "off" } });
    dom.reduce.set(false);
    expect(m.motionOff()).toBe(false);
    expect(dom.html.dataset.vt).toBe("");
    expect(dom.motionEvents).toEqual([{ off: false, locked: false }]);

    const [m2, dom2] = await load({ reduced: true, dataset: { motion: "off" }, stored: { lcMotion: "off" } });
    dom2.reduce.set(false);
    expect(m2.motionOff()).toBe(true);
    expect(dom2.motionEvents).toEqual([{ off: true, locked: false }]);
  });

  it("a stored 'on' cannot lift the OS floor", async () => {
    const [m, dom] = await load({ stored: { lcMotion: "on" } });
    dom.reduce.set(true);
    expect(m.motionOff()).toBe(true);
    expect(dom.motionEvents).toEqual([{ off: true, locked: true }]);
  });
});

describe("a change made in another tab (storage event)", () => {
  it("follows lcMotion written elsewhere", async () => {
    const [m, dom] = await load();
    dom.storage.set("lcMotion", "off");
    dom.storageEvent("lcMotion");
    expect(m.motionOff()).toBe(true);
    dom.storage.set("lcMotion", "on");
    dom.storageEvent("lcMotion");
    expect(m.motionOff()).toBe(false);
    expect(dom.motionEvents).toEqual([
      { off: true, locked: false },
      { off: false, locked: false },
    ]);
  });

  it("ignores other keys and repeats of the current state", async () => {
    const [m, dom] = await load();
    dom.storage.set("lcMotion", "off");
    dom.storageEvent("lcHeroVideo");
    dom.storageEvent(null); // localStorage.clear() in another tab
    expect(m.motionOff()).toBe(false);
    dom.storage.set("lcMotion", "on");
    dom.storageEvent("lcMotion");
    expect(dom.motionEvents).toEqual([]);
  });

  it("under OS reduced motion another tab's 'on' changes nothing", async () => {
    const [m, dom] = await load({ reduced: true, dataset: { motion: "off" } });
    dom.storage.set("lcMotion", "on");
    dom.storageEvent("lcMotion");
    expect(m.motionOff()).toBe(true);
    expect(dom.motionEvents).toEqual([]);
  });
});

describe("onMotionChange()", () => {
  it("passes (off, locked) to the subscriber until it unsubscribes", async () => {
    const [m, dom] = await load();
    const seen: Array<[boolean, boolean]> = [];
    const off = m.onMotionChange((o, l) => seen.push([o, l]));
    m.setMotionOff(true);
    dom.reduce.set(true);
    off();
    dom.reduce.set(false);
    expect(seen).toEqual([
      [true, false],
      [true, true],
    ]);
    expect(dom.motionEvents).toHaveLength(3);
  });
});
