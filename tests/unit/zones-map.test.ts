/**
 * "Where we work" map keyboard model (src/scripts/zones-map.ts rovingTarget): the pins are one toolbar with a roving
 * tabindex. "Next" follows the reading direction — ArrowRight in LTR, ArrowLeft in RTL (the Arabic page) — Down / Up
 * are next / previous in both, Home / End jump to the ends, and next / previous wrap around.
 * The module wires itself to the page on import, so it is loaded on fake browser globals (no [data-zones] on them).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ZONES } from "~/data/zones";
import { installFakeDom } from "./fake-dom";

let rovingTarget: typeof import("~/scripts/zones-map").rovingTarget;

beforeAll(async () => {
  installFakeDom();
  vi.resetModules();
  ({ rovingTarget } = await import("~/scripts/zones-map"));
});
afterAll(() => {
  vi.unstubAllGlobals();
});

const N = ZONES.length; // one pin per zone

describe("rovingTarget", () => {
  it("LTR: ArrowRight / ArrowDown go to the next pin, ArrowLeft / ArrowUp to the previous", () => {
    expect(rovingTarget("ArrowRight", 0, N, false)).toBe(1);
    expect(rovingTarget("ArrowDown", 0, N, false)).toBe(1);
    expect(rovingTarget("ArrowLeft", 4, N, false)).toBe(3);
    expect(rovingTarget("ArrowUp", 4, N, false)).toBe(3);
  });

  it("RTL: the horizontal arrows swap (ArrowLeft is next), the vertical ones do not", () => {
    expect(rovingTarget("ArrowLeft", 0, N, true)).toBe(1);
    expect(rovingTarget("ArrowRight", 4, N, true)).toBe(3);
    expect(rovingTarget("ArrowDown", 0, N, true)).toBe(1);
    expect(rovingTarget("ArrowUp", 4, N, true)).toBe(3);
  });

  for (const rtl of [false, true]) {
    const dir = rtl ? "RTL" : "LTR";
    const next = rtl ? "ArrowLeft" : "ArrowRight";
    const prev = rtl ? "ArrowRight" : "ArrowLeft";

    it(`${dir}: next / previous wrap around the ends`, () => {
      expect(rovingTarget(next, N - 1, N, rtl)).toBe(0);
      expect(rovingTarget("ArrowDown", N - 1, N, rtl)).toBe(0);
      expect(rovingTarget(prev, 0, N, rtl)).toBe(N - 1);
      expect(rovingTarget("ArrowUp", 0, N, rtl)).toBe(N - 1);
    });

    it(`${dir}: Home / End go to the first / last pin from anywhere`, () => {
      for (const i of [0, 4, N - 1]) {
        expect(rovingTarget("Home", i, N, rtl)).toBe(0);
        expect(rovingTarget("End", i, N, rtl)).toBe(N - 1);
      }
    });

    it(`${dir}: other keys are not navigation (the browser keeps them: Tab, Enter, Space, Escape, letters)`, () => {
      for (const key of ["Tab", "Enter", " ", "Escape", "a", "PageDown"]) expect(rovingTarget(key, 3, N, rtl), key).toBeNull();
    });

    it(`${dir}: walking "next" visits every pin once and comes back`, () => {
      const seen: number[] = [];
      let i = 0;
      for (let k = 0; k < N; k++) seen.push((i = rovingTarget(next, i, N, rtl)!));
      expect(seen).toEqual([...Array.from({ length: N - 1 }, (_, k) => k + 1), 0]);
    });
  }

  it("a single pin stays put; no pins → no target", () => {
    for (const key of ["ArrowRight", "ArrowLeft", "Home", "End"]) expect(rovingTarget(key, 0, 1, false)).toBe(0);
    expect(rovingTarget("ArrowRight", 0, 0, false)).toBeNull();
  });
});
