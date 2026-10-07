/**
 * Fills lazy illustration slots (<svg data-art-src="<kind>/<slug>">, LazyArt.astro) with the real art.
 *
 * The art lives in one static fragment per kind (/en/art/services/, /en/art/industries/, /en/art/factory/ —
 * src/pages/[lang]/art/[kind].astro), shared by every page and locale and cached as immutable (versioned URL). A slot loads
 * when it comes within ROOT_MARGIN of the viewport; a slot inside `display: none` (the home page's desktop-only card
 * grids on phones) never intersects, so it never loads. The fragment is fetched (low priority: decorative, never in
 * the way of the CSS, fonts and LCP image) and parsed once per kind.
 *
 * The slot is filled IN PLACE (MOT2-01): it keeps its identity and takes over the art's attributes and children, it is
 * never replaced. A view-transition name the BaseLayout head script put on the slot (the card the visitor comes back
 * to from its detail page) therefore stays on a rendered node for the whole morph — replacing the node aborted the
 * running transition — and is cleared from that same node when the transition ends.
 * The filled piece joins the play scheduler in the same task, so its first painted frame is already its rest frame;
 * a slot filled while on screen fades in (MOT2-21) instead of popping.
 */
import { motionOff } from "./motion-pref";
import { playWhenVisible } from "./play-when-visible";

const ROOT_MARGIN = "1000px 0px";
const FADE: KeyframeAnimationOptions = { duration: 280, easing: "cubic-bezier(0.2, 0, 0, 1)" }; // --dur-ui, --ease-mech
/** Art attributes that stay the slot's own (its size / variant / a11y / a running transition name). */
const KEEP = new Set(["class", "style", "data-variant", "aria-hidden", "role", "aria-label"]);
const docs = new Map<string, Promise<Document | null>>();
let seq = 0;

function fragment(kind: string, v: string): Promise<Document | null> {
  let doc = docs.get(kind);
  if (!doc) {
    doc = fetch(`/en/art/${kind}/?v=${encodeURIComponent(v)}`, { priority: "low" } as RequestInit)
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

async function fill(slot: SVGSVGElement, inView: boolean) {
  const [kind = "", slug = ""] = (slot.dataset.artSrc ?? "").split("/");
  const doc = await fragment(kind, slot.dataset.artV ?? "");
  const src = doc?.querySelector(`[data-slug="${CSS.escape(slug)}"] > svg`);
  if (!src || !slot.isConnected || !slot.hasAttribute("data-art-src")) return;
  const art = document.importNode(src, true) as SVGSVGElement;
  const u = art.dataset.uid;
  if (u) {
    const nu = `${u}l${(seq++).toString(36)}-`;
    reid(art, u, nu);
    art.dataset.uid = nu;
  }
  for (const c of art.classList) slot.classList.add(c);
  for (const a of art.attributes) if (!KEEP.has(a.name)) slot.setAttribute(a.name, a.value);
  slot.removeAttribute("data-art-src");
  slot.removeAttribute("data-art-v");
  const fade = inView && !motionOff();
  slot.replaceChildren(...art.childNodes);
  playWhenVisible(slot);
  if (fade) slot.animate({ opacity: [0, 1] }, FADE);
}

let io: IntersectionObserver | undefined;
function scan() {
  if (typeof IntersectionObserver === "undefined") return;
  io ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io!.unobserve(e.target);
        // on screen when it came into range? (from the entry: reading the layout between fills would force a full
        // layout per slot)
        const r = e.boundingClientRect;
        void fill(e.target as SVGSVGElement, r.bottom > 0 && r.top < innerHeight);
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
