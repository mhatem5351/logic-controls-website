/**
 * Anonymous click counts for the contact channels (UX2-18): which WhatsApp / call / email / copy-email / quote buttons
 * visitors use, per language and page area — the conversions Cloudflare Web Analytics (page views only) cannot see.
 *
 * One delegated click listener on `document` (no component needs to know about it) sends
 *   POST /api/evt  {k: kind, p: placement, l: locale, u: path}
 * with navigator.sendBeacon (survives the navigation a tel:/mailto:/wa.me link starts). The Worker validates it
 * (src/lib/rfq-rules.ts parseEvt) and writes one Workers Analytics Engine data point (free on Workers Free: 100,000 a
 * day). No cookies, no storage, no identifiers, no query strings or form contents; nothing is sent when the browser
 * signals Do Not Track / Global Privacy Control. Each /api/* call also counts against the Worker's 100,000 requests a
 * day, so a page view sends at most MAX_PER_VIEW events and repeats of the same click within REPEAT_MS are dropped.
 *
 * Other scripts can count an event without importing this module:
 *   document.dispatchEvent(new CustomEvent("lc:evt", { detail: { k: "form-sent", p: "form" } }))
 * A component can name its placement explicitly with `data-evt-place="…"` on any ancestor (else it is derived below).
 *
 * Loaded once per page by src/scripts/site.ts (the site's single client entry); a second import is a no-op (lcEvtReady).
 */
import type { EvtKind, EvtPlace } from "~/lib/rfq-rules";

/** Same list as rfq-rules EVT_PLACES (types only are imported, so every page does not bundle the form rules). */
const EVT_PLACES: readonly EvtPlace[] = ["header", "drawer", "hero", "band", "fab", "footer", "form", "contact", "thanks", "body"];

declare global {
  interface Window {
    lcEvtReady?: boolean;
  }
}

const ENDPOINT = "/api/evt";
const MAX_PER_VIEW = 8;
const REPEAT_MS = 3000;

function kindOf(el: Element): EvtKind | null {
  if (el.matches("button[data-copy]")) return "copy-email";
  if (!(el instanceof HTMLAnchorElement)) return null;
  const href = el.getAttribute("href") ?? "";
  if (/^https:\/\/(?:wa\.me|api\.whatsapp\.com)\//.test(href)) return "whatsapp";
  if (href.startsWith("tel:")) return "call";
  if (href.startsWith("mailto:")) return "email";
  // a link to the quote form from another page (on the contact page itself it would only count scrolling)
  if (/^\/(?:en|ar|zh|tr)\/contact\/(?:[?#]|$)/.test(href) && !/\/contact\/$/.test(location.pathname)) return "quote";
  return null;
}

function placeOf(el: Element): EvtPlace {
  const named = el.closest<HTMLElement>("[data-evt-place]")?.dataset.evtPlace;
  if (named && (EVT_PLACES as readonly string[]).includes(named)) return named as EvtPlace;
  if (el.closest("dialog")) return "drawer";
  if (el.closest(".lc-header, header")) return "header";
  if (el.closest(".lc-float")) return "fab";
  if (el.closest(".lc-footer, footer")) return "footer";
  if (el.closest("form[data-rfq]")) return "form";
  if (el.closest(".lc-hero")) return "hero";
  if (el.closest(".lc-band")) return "band";
  if (/\/contact\/thanks\/$/.test(location.pathname)) return "thanks";
  if (/\/contact\/$/.test(location.pathname)) return "contact";
  return "body";
}

function locale(): string {
  const seg = location.pathname.split("/")[1] ?? "";
  return ["en", "ar", "zh", "tr"].includes(seg) ? seg : (document.documentElement.lang || "en").slice(0, 2);
}

const optedOut = () => {
  const n = navigator as Navigator & { globalPrivacyControl?: boolean };
  return n.globalPrivacyControl === true || n.doNotTrack === "1";
};

if (typeof window !== "undefined" && !window.lcEvtReady) {
  window.lcEvtReady = true;
  let sent = 0;
  const lastAt = new Map<string, number>();

  const send = (kind: EvtKind, place: EvtPlace) => {
    if (import.meta.env.DEV || optedOut() || sent >= MAX_PER_VIEW) return;
    const key = `${kind}|${place}`;
    const now = Date.now();
    if (now - (lastAt.get(key) ?? -Infinity) < REPEAT_MS) return;
    lastAt.set(key, now);
    sent++;
    const body = JSON.stringify({ k: kind, p: place, l: locale(), u: location.pathname.slice(0, 120) });
    try {
      if (navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: "text/plain" }))) return;
    } catch {}
    void fetch(ENDPOINT, { method: "POST", body, keepalive: true, credentials: "omit" }).catch(() => {});
  };

  document.addEventListener(
    "click",
    (e) => {
      const el = (e.target as Element | null)?.closest?.("a[href], button[data-copy]");
      if (!el) return;
      const kind = kindOf(el);
      if (kind) send(kind, placeOf(el));
    },
    { capture: true, passive: true },
  );
  document.addEventListener("lc:evt", (e) => {
    const d = (e as CustomEvent<{ k?: EvtKind; p?: EvtPlace }>).detail;
    if (d?.k) send(d.k, d.p && (EVT_PLACES as readonly string[]).includes(d.p) ? d.p : "body");
  });
}

export {};
