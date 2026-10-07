/**
 * Fills lazy illustration slots (<svg data-art-src="<kind>/<slug>">, LazyArt.astro) with the real art.
 *
 * The art lives in one static fragment per kind (/en/art/services/, /en/art/industries/, /en/art/factory/ —
 * src/pages/[lang]/art/[kind].astro), shared by every page and locale and cached as immutable (versioned URL). A slot loads
 * when it comes within ROOT_MARGIN of the viewport; a slot inside `display: none` (the home page's desktop-only card
 * grids on phones) never intersects, so it never loads. The fragment is fetched and parsed once per kind; each slot
 * gets a clone with its own <defs> ids, takes over the slot's classes / variant / size, and joins the play scheduler.
 */
import { playWhenVisible } from "./play-when-visible";

const ROOT_MARGIN = "1000px 0px";
const docs = new Map<string, Promise<Document | null>>();
let seq = 0;

function fragment(kind: string, v: string): Promise<Document | null> {
  let doc = docs.get(kind);
  if (!doc) {
    doc = fetch(`/en/art/${kind}/?v=${encodeURIComponent(v)}`)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((html) => new DOMParser().parseFromString(html, "text/html"))
      .catch(() => {
        docs.delete(kind); // let a later slot retry
        return null;
      });
    docs.set(kind, doc);
  }
  return doc;
}

/** Give a clone its own <defs> ids (ArtFrame prefixes them all with data-uid), so two copies never collide. */
function reid(svg: Element, from: string, to: string) {
  const ref = "#" + from;
  for (const el of [svg, ...svg.querySelectorAll("*")]) {
    for (const a of el.attributes) {
      if (a.name === "id") {
        if (a.value.startsWith(from)) a.value = to + a.value.slice(from.length);
      } else if (a.value.includes(ref)) a.value = a.value.split(ref).join("#" + to);
    }
  }
}

async function fill(slot: SVGSVGElement) {
  const [kind = "", slug = ""] = (slot.dataset.artSrc ?? "").split("/");
  const doc = await fragment(kind, slot.dataset.artV ?? "");
  const src = doc?.querySelector(`[data-slug="${CSS.escape(slug)}"] > svg`);
  if (!src || !slot.isConnected) return;
  const art = document.importNode(src, true) as SVGSVGElement;
  const u = art.dataset.uid;
  if (u) {
    const nu = `${u}l${(seq++).toString(36)}-`;
    reid(art, u, nu);
    art.dataset.uid = nu;
  }
  for (const c of slot.classList) art.classList.add(c);
  const variant = slot.getAttribute("data-variant");
  if (variant) art.setAttribute("data-variant", variant);
  else art.removeAttribute("data-variant");
  const style = slot.getAttribute("style");
  if (style) art.setAttribute("style", style);
  slot.replaceWith(art);
  playWhenVisible(art);
}

let io: IntersectionObserver | undefined;
function scan() {
  if (typeof IntersectionObserver === "undefined") return;
  io ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io!.unobserve(e.target);
        void fill(e.target as SVGSVGElement);
      }
    },
    { rootMargin: ROOT_MARGIN },
  );
  document.querySelectorAll<SVGSVGElement>("svg[data-art-src]:not([data-art-watch])").forEach((el) => {
    el.setAttribute("data-art-watch", "");
    io!.observe(el);
  });
}

scan();
