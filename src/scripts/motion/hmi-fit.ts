/**
 * Fits the HMI demo's process mimic to its rendered width (runs at once, from the HmiDemo bootstrap):
 *  - below 600px of mimic width the viewBox is cropped to the heating / holding-tube / FDV core (the part of the
 *    fault story the visitor has to see), so the holding tube stays a few pixels wide on phones;
 *  - --mk (viewBox units per CSS pixel) lets the CSS keep mimic labels at a legible rendered size, and data-fit
 *    says which label layers still fit: "fine" (all), "mid" (main labels, scaled up; ISA tag bubbles and the colour
 *    key hidden), "coarse" (labels hidden; the faceplate below carries every value).
 * Without JS the full viewBox and the CSS container-query fallbacks apply.
 */
const H = 432;
const FULL: [number, number] = [0, 840];
const CORE: [number, number] = [280, 560];

export function fitMimic(fig: HTMLElement): void {
  const box = fig.querySelector<HTMLElement>(".hs-mimic");
  const svg = box?.querySelector("svg");
  if (!box || !svg || !("ResizeObserver" in window)) return;
  let last = "";
  const fit = (w: number) => {
    if (w < 40) return; // hidden
    const [x, vw] = w >= 600 ? FULL : CORE;
    const mk = vw / w;
    const key = `${x}|${mk.toFixed(3)}`;
    if (key === last) return;
    last = key;
    svg.setAttribute("viewBox", `${x} 0 ${vw} ${H}`);
    box.style.setProperty("--mk", mk.toFixed(3));
    box.dataset.fit = mk <= 1.08 ? "fine" : mk <= 1.42 ? "mid" : "coarse";
    box.dataset.crop = x ? "core" : "full";
  };
  /* Fit once now (no first-paint jump), then on resize in the next frame: changing the viewBox changes the box's
     height, which re-notifies the observer; inside the same delivery WebKit reports that as a page error
     ("ResizeObserver loop completed with undelivered notifications"). The next frame's call is a no-op (same key). */
  fit(box.getBoundingClientRect().width);
  let frame = 0;
  new ResizeObserver((es) => {
    const w = es[0]?.contentRect.width ?? 0;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => fit(w));
  }).observe(box);
}
