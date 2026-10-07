/**
 * Minimal browser globals for client modules that touch the DOM on import (src/scripts/motion/motion-pref.ts,
 * src/scripts/zones-map.ts) — Vitest runs in Node. Only what those modules use: <html>'s dataset, document events,
 * matchMedia("(prefers-reduced-motion: reduce)") with live "change" events, localStorage, and the window's "storage"
 * event. Install it, then import the module fresh (vi.resetModules() + await import(…)); vi.unstubAllGlobals() after.
 */
import { vi } from "vitest";

/** A MediaQueryList whose `matches` the test flips (firing "change", as the browser does). */
export class FakeMediaQuery extends EventTarget {
  constructor(
    readonly media: string,
    public matches: boolean,
  ) {
    super();
  }
  set(matches: boolean): void {
    this.matches = matches;
    this.dispatchEvent(new Event("change"));
  }
}

export interface FakeDom {
  /** <html>'s data-* attributes (dataset.motion = "off" ⇔ data-motion="off"). */
  html: { dataset: Record<string, string> };
  document: EventTarget;
  reduce: FakeMediaQuery;
  /** localStorage contents (empty, or unused when `storageThrows`). */
  storage: Map<string, string>;
  /** Every "lc:motion" event detail dispatched on the document, in order. */
  motionEvents: Array<{ off: boolean; locked: boolean }>;
  /** A "storage" event from another tab (the browser fires it on the window after another tab wrote localStorage). */
  storageEvent(key: string | null): void;
}

export function installFakeDom(opts: { reduced?: boolean; dataset?: Record<string, string>; stored?: Record<string, string>; storageThrows?: boolean } = {}): FakeDom {
  const html = { dataset: { ...opts.dataset } };
  const document = Object.assign(new EventTarget(), { documentElement: html, querySelectorAll: () => [] });
  const reduce = new FakeMediaQuery("(prefers-reduced-motion: reduce)", !!opts.reduced);
  const storage = new Map(Object.entries(opts.stored ?? {}));
  const fail = () => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  };
  const win = new EventTarget();
  const motionEvents: FakeDom["motionEvents"] = [];
  document.addEventListener("lc:motion", (e) => motionEvents.push((e as CustomEvent<{ off: boolean; locked: boolean }>).detail));

  vi.stubGlobal("document", document);
  vi.stubGlobal("matchMedia", (q: string) => (q === reduce.media ? reduce : new FakeMediaQuery(q, false)));
  vi.stubGlobal(
    "localStorage",
    opts.storageThrows
      ? { getItem: fail, setItem: fail, removeItem: fail }
      : {
          getItem: (k: string) => storage.get(k) ?? null,
          setItem: (k: string, v: string) => void storage.set(k, String(v)),
          removeItem: (k: string) => void storage.delete(k),
        },
  );
  vi.stubGlobal("addEventListener", win.addEventListener.bind(win));
  vi.stubGlobal("removeEventListener", win.removeEventListener.bind(win));

  return {
    html,
    document,
    reduce,
    storage,
    motionEvents,
    storageEvent(key) {
      win.dispatchEvent(Object.assign(new Event("storage"), { key }));
    },
  };
}
