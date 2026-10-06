# Logic Controls — animated illustration system

Hand-built inline SVG + CSS animation for service / industry cards, page heroes and dark bands.
One visual language: **engineering front elevations brought to life**. They look like a panel-layout drawing or a P&ID, with just enough depth to read as objects.

## Usage

```astro
import ServiceArt from "~/components/illustrations/ServiceArt.astro";
import IndustryArt from "~/components/illustrations/IndustryArt.astro";
import FactoryLine from "~/components/illustrations/FactoryLine.astro";

<ServiceArt slug="control-panels" />                       <!-- decorative, aria-hidden -->
<IndustryArt slug="food-beverage" variant="dark" />         <!-- force the dark palette -->
<ServiceArt slug="process-control" label="Pasteurizer temperature loop" size={320} />  <!-- role="img" -->
<FactoryLine />                                            <!-- 4:1 band, bonus -->
```

| prop | type | default | notes |
|---|---|---|---|
| `slug` | `ServiceSlug` / `IndustrySlug` | required | from `~/data/services` / `~/data/industries` |
| `variant` | `"light" \| "dark"` | auto | Omit it and the art follows the surface: light normally, dark inside any `.on-dark` ancestor. |
| `size` | `number \| string` | `100%` | `inline-size` of the root `<svg>`. A number means px. The art is always responsive (`viewBox`, `aspect-ratio: 4/3`). |
| `label` | `string` | – | Without it: `aria-hidden="true"`. With it: `role="img"` + `aria-label`. |
| `class` | `string` | – | Extra classes on the root `<svg>`. |

- Put the art inside a `.group` card. On hover or focus, the loop speeds up smoothly (×1.6, no jump) and the signal pulses get bolder.
- RTL: the art is never mirrored (machines don't flip). Place it with logical CSS (`margin-inline`, `inset-inline`, grid). Nothing inside the SVG depends on `dir`.
- Motion: offscreen art and art in a hidden tab is paused (`data-play="0"`, one shared IntersectionObserver in `src/scripts/motion/play-when-visible.ts`). With `prefers-reduced-motion: reduce`, every animation is removed and the art shows its most informative static pose.

## Files

```
ArtFrame.astro      root <svg>, palette tokens, vocabulary classes, grid, floor, play-state script
ServiceArt.astro    slug → services/*.astro
IndustryArt.astro   slug → industries/*.astro
FactoryLine.astro   wide panorama band (viewBox 1200×300)
types.ts            ArtProps + uid() (per-instance id prefix for <defs>)
services/*.astro, industries/*.astro   one file per illustration
```

Each illustration renders `<Frame uid name>` and puts its drawing in the slot. Its own keyframes go in an **inline `<style is:inline>` inside the SVG**. A page only carries CSS for the art it actually renders, and the shared vocabulary (about 3 KB) is bundled once.

## Canvas & projection

- `viewBox="0 0 400 300"` (4:3). The floor line is at **y = 258** (drawn by the frame). Keep the drawing inside x 12–388 and y 10–258. The main subject should fill about 70–85 % of the width.
- **Cabinet-oblique projection.** Front faces are true shape. Depth recedes **up and to the right at 45°**: a point at depth *d* is offset `(+d, −d)`. Typical *d*: 8–10 (devices, HMIs, PLC modules), 12–18 (cabinets, machine frames), 18–22 (big machines). The 45° matches the bends of the logo's circuit traces.
- Visible faces are only the **front, top and right side**. Never draw left or bottom faces. Paint from left to right and from back to front.
- **Round things** (tanks, drums, dials, portholes, gauges) are pure front elevations. Never draw elliptical tops. Suggest volume with a vertical shade band on the right (`--i-m2`, about 15 % of the width). A **cylinder whose axis runs into depth** (motor, roll) is two equal circles offset `(d, −d)` joined by a band.
- **Light comes from the top-left.** Top faces are lightest (`.t`), fronts are white or stainless (`.f` / `.m`), right sides are shaded (`.s`). Floor shadows (`.sh`) are parallelograms falling to the right of the footprint.

## Line & colour vocabulary (classes defined in ArtFrame)

The stroke defaults are set on the root: ink colour, 2 units, round caps and joins, no fill.

| class | meaning |
|---|---|
| (none) | silhouette / outer outline, 2 u |
| `.d` | component outline inside an object, 1.25 u |
| `.h` | hairline detail, 0.75 u |
| `.l` | secondary line colour (navy-400): vents, seams, labels-as-lines |
| `.q` | screen content line (royal-300) |
| `.e` | signal stroke (amber) |
| `.bt` | butt caps (for the dash tricks) |
| `.n` | no stroke |
| `.f .t .s` | front / top / side face fills |
| `.m .m2 .m3` | stainless front / stainless shade / darker steel (rails, terminals, bases) |
| `.b .b2` | brand royal (module bands, motors) / royal tint (relay covers, glass) |
| `.k` | screen (navy-900) |
| `.w` | product fluid (royal-400) |
| `.y` | signal fill (amber): lit LEDs, node flashes. Small areas only. |
| `.ink` | ink-coloured fill (screws, dots) |
| `.sh` | floor shadow |

Palette tokens (`--i-*` on `.lca`) map to `global.css` theme variables with hex fallbacks, so palette tweaks propagate. The dark palette swaps them on `[data-variant="dark"]` and inside `.on-dark`.

**Amber (`--i-sig`, signal-500/400) is reserved for signal and energy**: lit LEDs, pulses, node flashes, heat, alarms and set-point marks. Never use it for large fills or structure. Product and fluids are royal (`.w`). Everything else is navy, royal and charcoal.

No text, digits or third-party logos inside the art. It must stay language-neutral. Lines stand in for labels.

## The brand signal (required in every piece)

The logo's **circuit trace ending in a ring node** links the controller to the process in every illustration:

- Trace: `class="tr"`. Grey (like the logo's traces), 2.5 u, **only horizontal, vertical and 45° segments**.
- Ring node: `class="rn"`, r 4–6, hollow. Put rings at free ends or at device terminals.
- Signal: an amber pulse runs along a copy of the trace path: `class="p" pathLength="100"`, with `--t` (period) and `--d` (delay). The head arrives at 50 % of `--t`. At that moment the node fills (`.nd`, r ≈ ½ ring) and pings (`.pg`, same r as the ring).
- For story-timed pulses, override the animation with a scoped class such as `.lca-xx .p.o1{animation:xxO 9s linear infinite}`. Keep the dash 12 and the offset 12 → −100.
- When several traces run in parallel, stagger the ring heights into a 45° staircase (the logo's three rings).

## Recurring parts (draw them the same way everywhere)

- **Pipes**: one `<path id>` in `<defs>`, used three times: `.po` (ink, 7 u), `.pi` (bore `--i-m`, 4 u) and `.pf` (flow: `--i-w`, 2 u, dash `3 7`, `lca-fw` animation). Wrap the flow `<use>` in a `<g>` to switch it on and off with opacity.
- **DIN-rail rows**: `.m3` rail, modules as `.f` with a `.b` top band, LED columns made with a dash trick (`stroke-dasharray:0 N` with round caps = dots).
- **Terminal strips / wire stubs**: one thick dashed stroke (`.bt`, `stroke-dasharray: 4 1`, or `.9 4.1` for wires).
- **Slotted ducts**: `.m2` rect plus a dashed `--i-m` stroke along each edge.
- **HMI / screens**: `.f` bezel, `.k` screen, a `.q` hairline header, content in `--i-kl` with amber for live values.
- **Motors**: `.b` (royal). **Steel**: `.m`/`.m2`/`.m3`. **Glass, relay covers**: `.b2`.

## Motion

- One master loop per piece, **4–10 s**, telling a small process story (input → logic → output → effect). Sequence it with keyframe percentages on that one duration. Periodic sub-loops such as flow dashes and spinners must divide the master time or be clearly continuous.
- Animate **only `transform`, `opacity`, `stroke-dashoffset`**. Easing: `step-end` for LEDs and relays, `cubic-bezier(.65,0,.35,1)` for mechanical strokes, `linear` for rotation and flow, `ease-in-out` for levels.
- Rotations: `transform-box: fill-box; transform-origin: center` on a symmetric shape (`.sp` utility, `--t` = period).
- **A CSS transform replaces the element's `transform` attribute.** Position an element with a parent `<g transform>` and animate the child.
- Phase offsets: use negative delays (`calc(var(--s) - 6s)`) so the first loop is already in phase.
- Shared helpers: `.p .nd .pg` (pulses), `.sp` (spin), `.fw` / `lca-fw` (flow dashes, period 10).
- **Reduced motion**: the non-animated base styles must be the informative pose (outputs on, levels mid, valves forward). Use `.rmh` (hide when static), `.rms` (show only when static) or a `@media (prefers-reduced-motion: reduce)` block in the inline style.
- **`<use>` gotcha (verified in Chromium).** Selectors are matched *inside* the use shadow tree, so `.lca .f`, `.lca-xx .foo` and any other selector with an ancestor never match elements inside a `<use>` instance. Inside `<defs>` symbols, use inline `style="fill:var(--i-b2)"` (custom properties do inherit into the instance), or put the class on the `<use>` element and let inherited properties flow in (fill, stroke, stroke-width, dasharray, linecap). Animate the `<use>` element or a wrapper, never the symbol's internals.

## Naming & budget

- Root class `lca-<code>` (set by `name`). Keyframes are prefixed with the code (`cpOn`, `fbW`). Selectors are scoped `.lca-<code> .x`. `<defs>` ids are `${u}<letter>`: `uid()` ends with `-`, so ids never collide across instances. The frame reserves `${u}_g`, `${u}_r` and `${u}_m`.
- **≤ 12 KB of SVG markup per illustration** (whitespace collapsed, inline style included). Shared JS ≤ 2 KB. Use `<use>`, generated path strings and the dash tricks to stay lean.
- QA: the lab page `/<lang>/lab/illustrations/` (noindex) shows every piece on light cards, on a dark band and at hero scale.
