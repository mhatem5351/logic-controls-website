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
| `lazy` | `boolean` | `true` without `label` | Render an empty, correctly sized slot and load the art from the shared fragment when it nears the viewport (see *Lazy art*). Pass `false` where the art is part of the first screen. |

- Put the art inside a `.group` card: hovering or focusing the card replays its loop.
- RTL: the art is never mirrored (machines don't flip). Place it with logical CSS (`margin-inline`, `inset-inline`, grid). Nothing inside the SVG depends on `dir`.
- Motion: **play, then rest** (`src/scripts/motion/play-when-visible.ts`). A piece starts when ≥ 35 % of it is in view, plays its master loop twice (once inside a card grid), then rests in its still pose (`data-play="rest"`, also the server-rendered state). At most two pieces animate at once; the others wait in reading order, so a grid "scans" two cards at a time. Hover / focus replays a piece. Leaving the viewport sends it back to the queue; a hidden tab pauses it (`data-play="0"`). With `prefers-reduced-motion: reduce` or "Pause animations" (`html[data-motion="off"]`, `MotionToggle.astro`) every animation is removed and the art shows its still pose.

### Lazy art

Card art is not in the page HTML. `ServiceArt` / `IndustryArt` / `FactoryLine` render `LazyArt.astro` (an empty `.lca` box with the art's aspect ratio, palette and classes: no layout shift) unless `lazy={false}` or a `label` is given. `src/scripts/motion/lazy-art.ts` fetches one fragment per kind — `/en/art/services/`, `/en/art/industries/`, `/en/art/factory/` (`src/pages/[lang]/art/[kind].astro`, built once for every locale, every piece rendered once, language-neutral) — when a slot comes within ~1000 px of the viewport, clones the piece into the slot (fresh `<defs>` ids) and hands it to the play scheduler. Slots inside `display: none` (the home page's desktop-only grids on phones) never load. The URL carries `?v=<ART_VERSION>` (a hash of this folder, `art-version.ts`), so the fragments are cached as immutable (`public/_headers`) and shared by every page and locale. Detail heroes render their art inline, once (`HeroArt.astro` moves the same node between the media panel and the phone slot).

## Files

```
ArtFrame.astro      root <svg>, palette tokens, vocabulary classes, grid, floor, play states + still pose, scheduler hook
ServiceArt.astro    slug → services/*.astro (or a lazy slot)
IndustryArt.astro   slug → industries/*.astro (or a lazy slot)
FactoryLine.astro   wide panorama band (viewBox 1200×300)
LazyArt.astro       lazy slot (empty sized .lca box), filled by src/scripts/motion/lazy-art.ts
art-version.ts      content hash of this folder for the fragment URLs
types.ts            ArtProps + uid() (per-instance id prefix for <defs>)
services/*.astro, industries/*.astro   one file per illustration
```

Each illustration renders `<Frame uid name>` and puts its drawing in the slot. Its own keyframes go in an **inline `<style is:inline>` inside the SVG**. Card art therefore travels with its CSS inside the cached fragment (never in page HTML), a detail page carries the CSS of its one hero piece, and the shared vocabulary (about 3 KB) is bundled once.

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
- For story-timed pulses, override the animation with a scoped class such as `.lca-xx .p.o1{animation:xxO 9s linear infinite}`. Keep the dash at 12 and **park it at offset 14 → −102**. At 12 or −100 the round cap paints a dot at the path ends while the pulse waits.
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
- **Still pose** (reduced motion, rest after the loops, "Pause animations"): the non-animated base styles must be the informative pose (outputs on, levels mid, valves forward). Use `.rmh` (hide when static), `.rms` (show only when static), or a `@media (prefers-reduced-motion: reduce){…}` block in the inline style **followed by the same rules scoped `.lca-xx:is([data-play=rest],[data-motion=off] *) .foo`** so the rest pose and the paused pose match it.
- **Cost**: SVG `transform` / `stroke-dashoffset` animations are not composited (style + layout + paint every frame), which is why loops rest and only two pieces play at once. No `filter` / `drop-shadow` on anything that moves. Prefer `opacity` toggles with `step-end` (LEDs, relays).
- **`<use>` gotcha (verified in Chromium).** Selectors are matched *inside* the use shadow tree, so `.lca .f`, `.lca-xx .foo` and any other selector with an ancestor never match elements inside a `<use>` instance. Inside `<defs>` symbols, use inline `style="fill:var(--i-b2)"` (custom properties do inherit into the instance), or put the class on the `<use>` element and let inherited properties flow in (fill, stroke, stroke-width, dasharray, linecap). Animate the `<use>` element or a wrapper, never the symbol's internals.

## Naming & budget

- Your own modifier classes must never reuse a vocabulary name (`b`, `d`, `e`, `f`, `h`, `k`, `l`, `m`, `n`, `p`, `q`, `s`, `t`, `w`, `y`, `sh`, `tr`, `rn`, `nd`, `pg`, `sp`, `fw`, `bt`, `ink`, `m2`, `m3`, `b2`, `rmh`, `rms`). Use two or more letters that are clearly yours.
- Root class `lca-<code>` (set by `name`). Keyframes are prefixed with the code (`cpOn`, `fbW`). Selectors are scoped `.lca-<code> .x`. `<defs>` ids are `${u}<letter>`: `uid()` ends with `-`, so ids never collide across instances. The frame reserves `${u}_g`, `${u}_r` and `${u}_m`.
- **≤ 12 KB of SVG markup per illustration** (whitespace collapsed, inline style included). Shared JS ≤ 2 KB. Use `<use>`, generated path strings and the dash tricks to stay lean.
- QA: the lab page `/<lang>/lab/illustrations/` (noindex) shows every piece on light cards, on a dark band and at hero scale (lazy slots; hover a card to replay it).
