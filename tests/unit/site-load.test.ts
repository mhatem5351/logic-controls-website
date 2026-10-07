/**
 * The on-demand feature loader (src/scripts/site-load.ts, CODE3-03 / CODE3-05): the "first tap is never lost" contract
 * — a click on a link / button inside a feature's element before its code has loaded is held (no default action, no
 * other listener) and replayed exactly once when the code has run; modified / non-primary clicks and clicks after the
 * code is in pass through; a failed load reloads the page once per tab session for a held tap (never a form's), else
 * replays the tap to its default action. Run against a few fake browser globals (no DOM library in this project).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** A minimal element: tag, attributes, parent; closest() for `tag`, `[attr]`, `tag[attr]` lists. */
class El {
  parent: El | null = null;
  clicks = 0;
  constructor(
    readonly tag: string,
    readonly attrs: Record<string, string> = {},
  ) {}
  append(...kids: El[]): this {
    for (const k of kids) k.parent = this;
    return this;
  }
  matches(sel: string): boolean {
    return sel.split(",").some((part) => {
      const m = part.trim().match(/^([a-z]*)((?:\[[\w-]+\])*)$/);
      if (!m) throw new Error(`fake selector not supported: ${part}`);
      const [, tag, attrs = ""] = m;
      if (tag && tag !== this.tag) return false;
      return [...attrs.matchAll(/\[([\w-]+)\]/g)].every(([, a]) => a! in this.attrs);
    });
  }
  closest<T = El>(sel: string): T | null {
    return this.matches(sel) ? (this as unknown as T) : (this.parent?.closest<T>(sel) ?? null);
  }
  /** HTMLElement.click(): a synthetic click through the document (the capture listeners see it), counted. */
  click(): void {
    this.clicks++;
    fire(this);
  }
}

let doc: EventTarget & { readyState: string; querySelector(s: string): El | null; querySelectorAll(s: string): El[] };
let win: EventTarget;
let all: El[] = [];
let storage: Map<string, string>;
let reload: ReturnType<typeof vi.fn>;

/** Dispatches a click on `target` at the document (where site-load listens, capture phase); returns the event. */
function fire(target: El, init: Partial<Record<"button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey", unknown>> = {}) {
  const ev = new Event("click", { cancelable: true });
  Object.defineProperty(ev, "target", { value: target });
  for (const [k, v] of Object.entries({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...init }))
    Object.defineProperty(ev, k, { value: v });
  doc.dispatchEvent(ev);
  return ev;
}

function install(opts: { storageThrows?: boolean } = {}) {
  storage = new Map();
  reload = vi.fn();
  win = new EventTarget();
  doc = Object.assign(new EventTarget(), {
    readyState: "loading",
    querySelector: (s: string) => all.find((e) => e.matches(s)) ?? null,
    querySelectorAll: (s: string) => all.filter((e) => e.matches(s)),
  });
  const fail = () => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  };
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("addEventListener", win.addEventListener.bind(win));
  vi.stubGlobal("location", { reload });
  vi.stubGlobal(
    "sessionStorage",
    opts.storageThrows
      ? { getItem: fail, setItem: fail }
      : { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, String(v)) },
  );
}

type SiteLoad = typeof import("~/scripts/site-load");
async function siteLoad(): Promise<SiteLoad> {
  vi.resetModules();
  return import("~/scripts/site-load");
}

/** A load() the test resolves / rejects when it wants. */
function deferred() {
  let resolve!: () => void, reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => ((resolve = res), (reject = rej)));
  const load = vi.fn(() => promise);
  return { load, resolve, reject };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

/** <div data-gallery><a href="/img.jpg">thumb</a><button>next</button><span>text</span></div> + a link outside. */
function gallery() {
  const thumb = new El("a", { href: "/img.jpg" });
  const button = new El("button");
  const text = new El("span");
  const icon = new El("svg");
  const root = new El("div", { "data-gallery": "" }).append(thumb.append(icon), button, text);
  const outside = new El("a", { href: "/elsewhere/" });
  // a card link around a feature element (e.g. a lazy picture inside a card link): not the feature's own link
  const card = new El("a", { href: "/card/" });
  const art = new El("svg", { "data-art": "" });
  card.append(art);
  all = [root, thumb, button, text, icon, outside, card, art];
  return { root, thumb, button, text, icon, outside, card, art };
}

beforeEach(() => install());
afterEach(() => {
  vi.unstubAllGlobals();
  all = [];
});

describe("now(): a click before the code is in is held and replayed once", () => {
  it("holds a tap on a link inside the feature (no default action, no other listener) and replays it once", async () => {
    const { thumb, icon } = gallery();
    const { now } = await siteLoad();
    const d = deferred();
    now("[data-gallery]", d.load);
    expect(d.load).toHaveBeenCalledTimes(1);
    const ev = fire(icon); // the tap lands on the icon inside the link
    expect(ev.defaultPrevented).toBe(true);
    expect(ev.cancelBubble).toBe(true); // stopped in the capture phase: the page's own handlers never see it
    expect(thumb.clicks).toBe(0);
    d.resolve();
    await settle();
    expect(thumb.clicks).toBe(1); // replayed on the link itself
    // the listener is gone: a second tap is untouched
    const ev2 = fire(thumb);
    expect(ev2.defaultPrevented).toBe(false);
    expect(thumb.clicks).toBe(1);
    expect(d.load).toHaveBeenCalledTimes(1);
  });

  it("two taps before the code is in: only the last one is replayed, once", async () => {
    const { thumb, button } = gallery();
    const { now } = await siteLoad();
    const d = deferred();
    now("[data-gallery]", d.load);
    fire(thumb);
    fire(button);
    d.resolve();
    await settle();
    expect(thumb.clicks).toBe(0);
    expect(button.clicks).toBe(1);
  });

  it("modified, middle-button and right clicks pass through (new tab, download…)", async () => {
    const { thumb } = gallery();
    const { now } = await siteLoad();
    now("[data-gallery]", deferred().load);
    for (const init of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { button: 2 }]) {
      expect(fire(thumb, init).defaultPrevented).toBe(false);
    }
  });

  it("clicks that are not on a link / button inside the feature pass through", async () => {
    const { text, outside, art } = gallery();
    const { now } = await siteLoad();
    now("[data-gallery], [data-art]", deferred().load);
    expect(fire(text).defaultPrevented).toBe(false); // inside, but not a link or button
    expect(fire(outside).defaultPrevented).toBe(false); // a link outside the feature
    expect(fire(art).defaultPrevented).toBe(false); // a card link AROUND the feature element is not held
  });

  it("a click after the code is in is untouched", async () => {
    const { thumb } = gallery();
    const { now } = await siteLoad();
    const d = deferred();
    now("[data-gallery]", d.load);
    d.resolve();
    await settle();
    expect(fire(thumb).defaultPrevented).toBe(false);
    expect(thumb.clicks).toBe(0);
  });

  it("does nothing on a page without the element", async () => {
    gallery();
    const { now } = await siteLoad();
    const d = deferred();
    now("[data-zones]", d.load);
    expect(d.load).not.toHaveBeenCalled();
  });
});

describe("a feature whose code fails to load (CODE3-05: a deploy replaced the chunk)", () => {
  it("a held tap reloads the page once per tab session; the tap is not replayed", async () => {
    const { thumb } = gallery();
    const { now } = await siteLoad();
    const d = deferred();
    now("[data-gallery]", d.load);
    fire(thumb);
    d.reject(new TypeError("Failed to fetch dynamically imported module"));
    await settle();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(thumb.clicks).toBe(0);
    expect(storage.get("lcReload")).toBe("1");
  });

  it("after that one reload, a failure degrades: the held tap gets its default action (replayed), no reload loop", async () => {
    storage.set("lcReload", "1");
    const { thumb } = gallery();
    const { now } = await siteLoad();
    const d = deferred();
    now("[data-gallery]", d.load);
    fire(thumb);
    d.reject(new Error("404"));
    await settle();
    expect(reload).not.toHaveBeenCalled();
    expect(thumb.clicks).toBe(1);
    expect(fire(thumb).defaultPrevented).toBe(false); // listener removed
  });

  it("no sessionStorage (no loop guard): never reloads, replays the tap", async () => {
    install({ storageThrows: true });
    const { thumb } = gallery();
    const { now } = await siteLoad();
    const d = deferred();
    now("[data-gallery]", d.load);
    fire(thumb);
    d.reject(new Error("404"));
    await settle();
    expect(reload).not.toHaveBeenCalled();
    expect(thumb.clicks).toBe(1);
  });

  it("never reloads a form away (the visitor's input): the held submit gets its default action", async () => {
    const submit = new El("button", { type: "submit" });
    const form = new El("form", { "data-rfq": "" }).append(submit);
    all = [form, submit];
    const { now } = await siteLoad();
    const d = deferred();
    now("form[data-rfq]", d.load);
    fire(submit);
    d.reject(new Error("404"));
    await settle();
    expect(reload).not.toHaveBeenCalled();
    expect(submit.clicks).toBe(1);
  });

  it("no held tap (nobody asked for the feature yet): nothing happens", async () => {
    gallery();
    const { now } = await siteLoad();
    const d = deferred();
    now("[data-gallery]", d.load);
    d.reject(new Error("404"));
    await settle();
    expect(reload).not.toHaveBeenCalled();
  });

  it("idle() swallows a failure (background loads never reload)", async () => {
    gallery();
    doc.readyState = "complete";
    vi.stubGlobal("requestIdleCallback", (fn: () => void) => fn());
    const { idle } = await siteLoad();
    const load = vi.fn(() => Promise.reject(new Error("404")));
    idle("[data-gallery]", load);
    await settle();
    expect(load).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("near()", () => {
  /** A fake IntersectionObserver the test drives. */
  function fakeIO() {
    const observers: Array<{ cb: (es: Array<{ isIntersecting: boolean }>) => void; targets: El[]; off: boolean }> = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        o: (typeof observers)[number];
        constructor(cb: (typeof observers)[number]["cb"]) {
          this.o = { cb, targets: [], off: false };
          observers.push(this.o);
        }
        observe(t: El) {
          this.o.targets.push(t);
        }
        disconnect() {
          this.o.off = true;
        }
      },
    );
    return { intersect: () => observers.filter((o) => !o.off).forEach((o) => o.cb([{ isIntersecting: true }])), observers };
  }

  it("loads when the element comes near, once", async () => {
    gallery();
    const io = fakeIO();
    const { near } = await siteLoad();
    const d = deferred();
    near("[data-gallery]", d.load);
    expect(d.load).not.toHaveBeenCalled();
    io.intersect();
    io.intersect();
    expect(d.load).toHaveBeenCalledTimes(1);
  });

  it("a tap before it came near starts the load and is replayed once", async () => {
    const { thumb } = gallery();
    fakeIO();
    const { near } = await siteLoad();
    const d = deferred();
    near("[data-gallery]", d.load);
    expect(fire(thumb).defaultPrevented).toBe(true);
    expect(d.load).toHaveBeenCalledTimes(1);
    d.resolve();
    await settle();
    expect(thumb.clicks).toBe(1);
  });

  it("idle: true also loads after the load event + an idle moment (PERF3-07), still once", async () => {
    gallery();
    const io = fakeIO();
    let idleFn: (() => void) | undefined;
    vi.stubGlobal("requestIdleCallback", (fn: () => void) => (idleFn = fn));
    const { near } = await siteLoad();
    const d = deferred();
    near("[data-gallery]", d.load, { idle: true });
    expect(d.load).not.toHaveBeenCalled();
    win.dispatchEvent(new Event("load"));
    expect(d.load).not.toHaveBeenCalled();
    idleFn?.();
    expect(d.load).toHaveBeenCalledTimes(1);
    io.intersect();
    expect(d.load).toHaveBeenCalledTimes(1);
  });
});

describe("reloadOnce()", () => {
  it("reloads once per tab session", async () => {
    const { reloadOnce } = await siteLoad();
    expect(reloadOnce()).toBe(true);
    expect(reloadOnce()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
