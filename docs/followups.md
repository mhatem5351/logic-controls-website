# Follow-ups (internal)

Open items only. Done items are removed once verified in the code (history: `git log -p docs/followups.md`). IDs refer
to the audit rounds.

## Needs the client

Send as one questionnaire:

1. Usual reply time and working days / hours (Sun–Thu?) for the contact page, thanks page and footer (UX-03).
2. Street address (or industrial zone): can it be public, do customers visit? (CS-05: LocalBusiness JSON-LD, Google
   Business Profile.) Who owns the Google account; address hidden? Service areas: which zones are actually served?
3. Scope of each of the 15 case studies: confirm what we did (panel building, programming, commissioning…). The
   "Panels we have built" strip and every scope list depend on it.
4. Are the pairs separate jobs (CS-02): milk pasteurizer vs pasteurizer with CIP; laundry washer 2026 vs hotel
   washer-extractor 2024 (same HMI design?); shampoo LS vs shampoo Delta. Real years for the 2025-dated and assumed
   ones (concrete plant, Delta shampoo, milk pasteurizer).
5. Per project: I/O count, commissioning days on site, what the machine had before, one result they stand behind,
   zone, bottle-printer PLC / motion brand, olive-autoclave HMI brand.
6. Exact post times of the three reels (VideoObject `uploadDate` is the post date at 00:00 Cairo time today).
7. Founder's LinkedIn (JSON-LD `sameAs`; not linked until its dates and employer names are cleared).
8. Certificates (training, vendor) the team holds and may show. None are claimed today.
9. Team size and roles; can we name them / show photos?
10. Commercial register no., tax card no., legal form: publishable?
11. 1–2 testimonials (by role / sector) and willingness to arrange reference calls (the "Talk to a past client" block
    on case studies promises references on request).
12. Permission to name any client.
13. Any publishable typical price range? (default: none)
14. Real photos for the laundry washer, concrete plant and pipe tester; a sharper cheese-cooker panel photo; short
    descriptions for gallery captions (`projects.items[slug].imageCaptions`).
15. The syrup jet-mixing project (LinkedIn 2026-09-26): delivered under Logic Controls, and is the beverage client
    fine with the two photos (client name on the HMI is already blanked)?
16. Pipe tester "Make/Break" = make-up / break-out torque (ft·lb): confirm the wording.
17. Arabic brand spelling "لوجيك كنترولز" (CS-20, JSON-LD `alternateName`); WeChat ID for zh pages.
18. HMI demo recipe set points (Cream 75 °C / 15 s, Juice 85 °C / 30 s) are plausible demo values: adjust?
19. Confirm receipt of the 2 TEST emails (website form "New website inquiry (EN)" + info@ forward test); check spam,
    mark "Not spam".
20. Suggest a LinkedIn company page "Logic Controls Egypt" (name collision with Logic Controls Inc., USA).

## Native review

- ar: "دورة المسح" (scan cycle) in the HMI spec line, `ar/hmi.json` (I18N2-15).
- ar: bidi of the HMI permissive line "TT-102 ≥ 72.0 °C" and the divert-limit line in RTL.
- ar: Egyptian buyers' terms "لوحات كنترول" / "أوتوميشن" in titles.
- tr: 404 "Bunu mu demek istediniz: {page}" (`tr/ui.json` `didYouMean`).
- zh: 新十月城 (New October City).

## Engineering

- PERF2-05: Cloudflare dashboard → Web Analytics: turn off automatic setup (JS snippet injection). It adds a second
  beacon (token 1f3d2a95…) that the API does not show; our own beacon (8a235c8b…) stays. Dashboard toggle only; re-check
  the live console afterwards (README → Release checklist).
- VIS2-15: re-encode the laundry clip: needs a landscape source clip or the screen crop box.
- PERF2-09: hero poster: a crop shaped for the desktop panel.
- CS2-16: project asset file renames, after round 2. Photo paths are part of a case study's content hash, so run
  `node scripts/content-dates.mjs --write` in the same commit.
- CODE2-13: the form E2E depends on Turnstile's network: stub `api.js` for most tests, keep one real canary.
- CODE2-18: split / shard CI (a push run is ≈ 13 min with the @phone subset).
- CODE3-08: Cloudflare dashboard → Workers & Pages → Analytics Engine: enable it once (free). Until then the last step
  of `npm run deploy` (`wrangler deploy`) fails on the `CLICKS` binding and clicks are not counted (README → Deploy has
  the workaround).
- Head script size: BaseLayout's inline head script ships unminified (comments + indentation, ~9.6 KB raw); with the
  round-3 view-transition additions the Arabic home's HTML before `<main>` is 14.8 KB gzip, just over a first TCP
  flight. Minify `is:inline` scripts at build (before integrations/csp-inline-hashes.mjs hashes them).
- WebKit and speculation rules: Playwright's WebKit 26.6 supports them, and a tap that navigates through the hover /
  touch prefetch left the page blank about 2–3 times in 100 (URL "", no load event; the round-2 build too; none in 90
  with the rules stripped; it hit five different tests across ten full runs). The E2E WebKit project now runs
  without the rules (tests/e2e/fixtures.ts; Chromium and production keep them), except the r3-motion quote-form hold
  test: without the rules that WebKit does not render at all while the load event is pending. Check real Safari 26
  on a device: if a tapped link ever stays blank there, limit the prefetch rules to Chromium.
- CSS consolidation: CODE2-07 (one reduced-motion pattern), CODE2-27, CODE2-28, CODE2-29, CODE2-31.
- Desktop hero illustration (service / industry detail pages, ≥ 1024 px): on very fast loads Chromium can paint the
  header + the hero's media panel before the hero copy is parsed; the art then moves down once the copy grows the hero
  (layout shift 0.05–0.07, intermittent; 0 on a throttled 1.6 Mbps profile). `<link rel="expect" blocking="render">`
  up to the end of the hero removes it but cost ~170 ms FCP/LCP on that profile, so it was not shipped. Options: align
  the art to the top of the panel, or give the page hero a desktop min-height close to its final height.
- HMI demo: "Simulate fault" during CIP briefly shows "Press Start to run the pasteurizer": tweak the message.
- Fonts: metric-matched fallbacks + preloads give CLS 0 on load. Only when fonts land after first paint can the 390 px
  tr / ar hero H1 re-wrap by one line (fonts delayed 600 ms: /tr/ 0.036, /ar/industries/food-beverage/ 0.032; desktop
  ≤ 0.001). If field data shows it, set `display: "optional"` on both families in `astro.config.mjs`.
- Fonts: Android has no Arial / Tahoma, so the fallback faces resolve to nothing and the stack falls through to
  system-ui (unadjusted). Add Roboto / Noto Sans Arabic faces once measured on a device.
