/*
 * BaseLayout's <head> script (is:inline, runs before first paint). Kept here as plain JS so BaseLayout can inline it
 * minified (src/lib/inline-js.ts): it sits in every page's first round trip (the HTML before <main>), so its bytes
 * count. What it does is documented above its <script> in src/layouts/BaseLayout.astro.
 */
(() => {
  const d = document.documentElement,
    N = [];
  d.classList.add("js");
  let S = {},
    // eslint-disable-next-line no-restricted-syntax -- this script is where the motion preference is first decided
    off = matchMedia("(prefers-reduced-motion: reduce)").matches;
  try {
    if (localStorage.lcMotion === "off") off = true;
  } catch {}
  if (off) d.dataset.motion = "off";
  try {
    S = sessionStorage;
    if (!off) {
      if (!S.lcIntro) {
        d.dataset.intro = "";
        S.lcIntro = 1;
      }
      if (!S.lcPing) d.dataset.fabPing = ""; /* WhatsAppButton sets S.lcPing once its ping has played */
      /* the floating button was showing on the page we came from: kept from the very first style on, so a script
         that runs before pagereveal never sees it hidden (its entrance would play inside the transition) */
      if (S.lcFab && matchMedia("(min-width: 64rem)").matches) d.dataset.fabKeep = "";
    }
  } catch {}
  /* Arriving from a page of this site with the HTML already here (prefetched or cached): the first frame waits
     until the document is parsed (#lc-end, the last element of <body>, on every page), so the transition starts
     with the whole page: the floating button exists to keep, and the rest of the page is not parsed and laid
     out inside the animation (MOT3-01). Never on a first visit, an arrival from another site or a reload. Only
     where the button is kept (≥ 64rem, as fabKeep above): on phones the wait cost a mid-range CPU 0.1–0.25 s
     per tap for nothing it keeps (PSC4-04). Chromium only (userAgentData): WebKit paid 60–300 ms for it with no
     smoother transition. The browser lifts it at the end of parsing in any case.
     With the whole response already here (responseEnd set: the HTTP cache) only parsing remains, and the wait
     is not capped: a half-parsed first frame would show the hero growing (a layout shift). A prefetch reports
     no responseEnd, finished or still downloading (it is adopted as it is when the visitor taps before it
     ends), so there the wait is capped at 600 ms: removing the link lifts the block, and lc-fab-hold keeps the
     button. Long enough for a slow CPU to parse a prefetched page; a slow body no longer holds the first frame
     for seconds (MOT4-01; a 200 ms cap revealed half-parsed heroes on slow machines). */
  try {
    const a = window.navigation?.activation,
      n = performance.getEntriesByType("navigation")[0];
    if (
      !off &&
      navigator.userAgentData &&
      matchMedia("(min-width: 64rem)").matches &&
      a?.from &&
      a.navigationType !== "reload" &&
      /^(navigational-prefetch|cache)$/.test(n?.deliveryType) &&
      "onpagereveal" in window
    ) {
      const l = document.createElement("link");
      l.rel = "expect";
      l.href = "#lc-end";
      l.setAttribute("blocking", "render");
      document.head.append(l);
      if (!(n.responseEnd > 0)) setTimeout(() => l.remove(), 600);
    }
  } catch {}
  const path = (u) => new URL(u, location.href).pathname;
  const depth = (p) => p.split("/").length;
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.bottom > 0 && r.top < innerHeight;
  };
  const art = (el) => el.querySelector(".lca") || el;
  const name = (el, n) => {
    if (el) {
      el.style.viewTransitionName = n;
      N.push(el);
    }
  };
  const OURS = /^lc-(media|hs\d|header|fab|nav-ind|hero-copy|copy-out|success)$/;
  const clear = () => {
    N.forEach((el) => (el.style.viewTransitionName = ""));
    N.length = 0;
    document
      .querySelectorAll('[style*="view-transition-name"]')
      .forEach((el) => OURS.test(el.style.viewTransitionName) && (el.style.viewTransitionName = ""));
    if (d.dataset.vting != null) {
      delete d.dataset.vting;
      document.dispatchEvent(new Event("lc:vt-end")); /* play-when-visible starts waiting illustrations now */
    }
    delete d.dataset.fabKeep;
    /* --vt-hero-b stays: inherited from <html>, removing it would restyle the whole page in the transition's last
       frame; it is only read under lc-dark, and rewritten at each reveal */
  };
  const card = (p) => [...document.querySelectorAll("[data-vt-href]")].find((el) => path(el.dataset.vtHref) === p && vis(art(el)));
  const chrome = () => {
    d.dataset.vting = "";
    name(document.querySelector(".lc-header"), "lc-header");
    name(document.querySelector(".lc-fab"), "lc-fab");
    const i = [...document.querySelectorAll(".lc-nav-ind")].find(vis);
    name(i, "lc-nav-ind");
  };
  /* The hero's visible picture — its illustration, the phone photo band, else the desktop panel's photo alone
     (its scrims named above it) or a framed screen / print (FramedHero: above the scrims, so they stay in the
     page snapshot) — plus its copy (`copy`: kept above the lifted picture).
     Returns "art" | "band" | "photo" | "framed" | "". */
  const hero = (copy) => {
    const h = document.querySelector(".lc-hero"),
      m = h?.querySelector(".lc-hero-media");
    const a = h && [...h.querySelectorAll(".lca, .lc-hero-band")].find(vis);
    const img = !a && m && vis(m) && m.querySelector("img");
    if (!a && !img) return "";
    name(h.querySelector(".lc-hero-copy"), copy);
    if (a) return (name(a, "lc-media"), a.classList.contains("lca") ? "art" : "band");
    name(img, "lc-media");
    if (img.closest("[data-framed]")) return "framed";
    [...m.children]
      .filter((x) => x.tagName === "DIV" && !x.hasAttribute("data-framed"))
      .slice(0, 4)
      .forEach((x, i) => name(x, "lc-hs" + i));
    return "photo";
  };
  const done = (t) => {
    t.ready.catch(() => {});
    t.finished.then(clear, clear);
  };
  addEventListener("pageswap", (e) => {
    const t = e.viewTransition,
      a = e.activation;
    if (!t) return;
    t.ready.catch(() => {});
    if (d.dataset.motion === "off") return t.skipTransition();
    try {
      /* A link in the open phone drawer (MOT3-04): the modal sheet covers the page, and named layers paint above the
         old page's snapshot (top layer included), so nothing of the page is named. Only the sheet's own top bar,
         when the sheet spans the screen: it crossfades into the new page's header. */
      const m = document.querySelector("dialog.lc-drawer[open]");
      if (m) {
        d.dataset.vting = "";
        if (m.getBoundingClientRect().width >= innerWidth - 1) name(m.querySelector(".lc-drawer-bar"), "lc-header");
        return;
      }
      chrome();
      if (!a?.entry?.url) return;
      const p = path(a.entry.url),
        c = card(p);
      const r = [...document.querySelectorAll("a[rel=prev],a[rel=next]")].find((x) => path(x.href) === p);
      if (c) {
        name(art(c), "lc-media");
        S.lcMorph = p;
      } else if (!r && (a.navigationType === "traverse" || depth(p) < depth(location.pathname))) {
        const h = hero("lc-copy-out");
        if (h) S.lcUp = (h === "photo" ? "photo " : "art ") + p;
      }
      if (r) S.lcDir = r.rel + " " + p;
    } catch {}
  });
  addEventListener("pagereveal", (e) => {
    const t = e.viewTransition,
      a = window.navigation?.activation,
      from = a?.from?.url,
      here = location.pathname;
    clear();
    if (t && d.dataset.motion === "off") {
      t.ready.catch(() => {});
      t.skipTransition();
    } else if (t) {
      d.dataset.vt = "";
      try {
        const ty = t.types,
          add = (x) => ty?.add(x);
        const [dir, to] = (S.lcDir || "").split(" "),
          [upKind, up] = (S.lcUp || "").split(" ");
        add("lc-page");
        if (S.lcFab && matchMedia("(min-width: 64rem)").matches) {
          d.dataset.fabKeep = "";
          /* not parsed yet (no render blocking in this browser): the old button stays put until the transition ends */
          if (!document.querySelector(".lc-fab")) add("lc-fab-hold");
        }
        if (to === here) add("lc-" + dir);
        if (a?.navigationType === "traverse" && a.entry.index < a.from?.index) add("lc-back");
        if (from && path(from).split("/")[1] !== here.split("/")[1]) add("lc-lang");
        if (document.querySelector(".lc-header[data-hero]") && scrollY < 24) {
          add("lc-dark");
          const b = document.querySelector(".lc-hero")?.getBoundingClientRect().bottom;
          if (b > 0 && b < innerHeight) d.style.setProperty("--vt-hero-b", Math.round(b) + "px");
          else d.style.removeProperty("--vt-hero-b");
        }
        if (up === here && upKind === "photo") add("lc-photo-out");
        chrome();
        if (S.lcMorph === here) {
          const h = hero("lc-hero-copy");
          if (h === "photo") add("lc-photo");
          else if (!h) {
            name(document.querySelector(".lc-hero-copy"), "lc-hero-copy");
            add("lc-orphan");
          }
        } else if (from) {
          const c = card(path(from));
          if (c) name(art(c), "lc-media");
          else if (up === here) {
            const h = hero("lc-hero-copy");
            if (h === "photo") add("lc-photo");
            else if (!h) add("lc-orphan");
          }
        }
        if (S.lcSuccess) name(document.querySelector("[data-vt-success]"), "lc-success");
        /* The new picture has no pixels yet (photo still loading): the old one flies all the way and stays, the
           new one fades in over it once loaded — never a morph onto an empty box. */
        const md = N.find((el) => el.style.viewTransitionName === "lc-media");
        if (md?.tagName === "IMG" && !(md.complete && md.naturalWidth)) add("lc-hold");
      } catch {}
      done(t);
    }
    try {
      ["lcMorph", "lcDir", "lcUp", "lcSuccess", "lcFab"].forEach((k) => delete S[k]);
    } catch {}
  });
  addEventListener("DOMContentLoaded", () => {
    if (!window.IntersectionObserver) return;
    const io = new IntersectionObserver((es) => es.forEach((x) => x.target.toggleAttribute("data-offscreen", !x.isIntersecting)));
    document.querySelectorAll("[data-pause-offscreen], .lc-led[data-blink]").forEach((el) => io.observe(el));
  });
})();
