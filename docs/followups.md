# Follow-ups (internal)

## Copy consistency (fix in EN, then propagate)
- [x] `projects.commercial-laundry-washer-control`: title/card say "Laundry washer", SEO title/client say "Hotel laundry washer" — pick one. → done: "Laundry washer" everywhere (title, card, SEO); client stays "Hotel laundry".
- [x] `projects.shampoo-filling-delta-wecon.result` says "improved"; other case studies say "helped improve" — align.
- [x] `technologies.drives.title` "Drives and motion" mixes VFDs and stepper drives — fine, but check AR rendering. → done: AR now "الانفرترات والدرايفرات والتحكم في الحركة" (title + projects techGroups).
- [ ] Pipe tester "Make/Break" = make-up / break-out torque (ft·lb). Confirm wording with client.

## ui.json alignment (after design agent finishes)
- [x] AR nav labels vs page titles: cosmetics ("مستحضرات التجميل والتعبئة" vs "مستحضرات التجميل"), packaging ("التغليف" vs "التغليف والليبل"), commissioning ("التشغيل والدعم الفني" vs "الاختبار والتشغيل").
- [x] Same check for zh/tr ui.json vs page titles. → done: ui.nav lists = services/industries `navTitle` in all 4 locales; TR footer "PLC otomasyon panoları", TR viewProject "Projeyi inceleyin".

## Page builder
- [ ] `{phone}` / `{email}` placeholders inside RTL sentences must be wrapped in `<bdi dir="ltr">`.
- [ ] Replace English fallback "Logic Controls" only where intended; keep brand Latin.
- [ ] Footer links in `src/components/nav.ts` point to non-existent slugs: `services/commissioning-support` (→ `testing-commissioning`), `industries/cosmetics-filling` (→ `cosmetics-personal-care`), `industries/packaging` (→ `packaging-labeling`). Labels in ui.json are already aligned to those pages.

## WhatsApp prefill
- [x] zh/tr pre-filled WhatsApp messages (`common.whatsapp.*`, ui.json) arrive in Chinese/Turkish — make them bilingual (local language + English) so engineers can read them. → done: local line + "\n" + English line ({service}/{industry}/{project} referred to as "named above" in the English line).
- [ ] zh pages: native reviewer should confirm 新十月城 / 阿拉伯塔（Borg El Arab）.

## Client questions (pending)
- [ ] Repeat project pairs separate jobs? Real years for 2025-dated ones?
- [ ] Working hours + response time; zones actually served.
- [ ] WeChat ID for zh pages.
- [ ] Permission to name clients / testimonials.
- [x] Gmail verified; info@ + sales@ rules created (2026-10-06).
- [ ] Client to confirm receipt of 2 TEST emails (website form 'New website inquiry (EN)' + info@ forward test from mhatem5351@gmail.com); check spam, mark 'Not spam'.
- [x] Founder bio + photo approved by user 2026-10-06.
- [ ] Confirm the syrup jet-mixing project (LinkedIn 2026-09-26) was delivered under Logic Controls and the beverage client is fine with the two photos (client name on the HMI is already blanked).

## Content enrichment pass (after TR transcreation finishes) — all 4 locales
- [x] Remove founding year everywhere (user decision 2026-10-06): about.seo.description, about story "founded in 2025", common.stats.founded label (stat already removed from stats.ts), common.*.preFounding → reword without year ("delivered by our engineers before the company was established").
- [x] Add `about.founder` {eyebrow,title,name,role,bio[],highlights[]}: Mohammed Tarek Aboalsafa, B.Sc. Electrical Power & Machines (Helwan University, 2020), 4+ yrs; past roles described NOT named (multinational pharma plant in Cairo / GMP; engineering training-equipment manufacturer; machine-automation firm).
- [x] New project `beverage-syrup-jet-mixing` (LinkedIn 2026-09-26): Siemens S7-1200 + SIMATIC HMI + 2× Yaskawa VFDs, "Radial Jet Mixing System", beverage factory (anonymised). Images: client-data/linkedin/raw/post-media/2026-09-26-syrup-{1,2}.jpg.
- [x] Technologies/services additions from LinkedIn: EPLAN Electric P8 (panel design), SQL database integration for SCADA/reports/OEE, ISA-88-structured batch control, EMS/BMS monitoring, purified-water utilities recommissioning, classic relay control, Yaskawa drives.
- [x] Industry sub-sector mentions (team experience): chocolate & bakery lines, edible-oil and egg-liquid fillers, wax filling & capping, ampoule filling, drainage-station SCADA, feed-factory SCADA, metal-sheet cut-to-length.
- [ ] Recommend client creates LinkedIn company page "Logic Controls Egypt" (name collision with Logic Controls Inc., USA).

## HMI demo (native review)
- [ ] AR: check bidi of permissive checklist line "TT-102 ≥ 72.0 °C" and divert-limit line in RTL.
- [ ] Edge: "Simulate fault" during CIP briefly shows "Press Start to run the pasteurizer" — tweak message.
- [ ] Recipe setpoints (Cream 75 °C/15 s, Juice 85 °C/30 s) are plausible demo values — client may adjust.
- [ ] Remove local `as` casts of `getMessages().hmi` in HmiDemo/ControlLoop now that `Messages.hmi` is typed.

## Round 2 — copy changes (meaning-level, apply to ALL 4 locales together; from EN review)
- [x] home.services.intro → "Eight services, from electrical design and panels to commissioning and support. Take the full scope or only the part you need." (avoid repeating home.why.items[0])
- [x] Idioms: services.maintenance-support.cta.title "…acting up?" → "Machine stopped or showing faults?"; testing-commissioning.intro[0] "succeeds or slips" → "Commissioning decides whether a line starts on time."; packaging-labeling intro[0]+cta.title "in step with" → "synchronized with"; beverage-syrup challenge "in step with the plant's CIP system" → "together with…"; machine-retrofits.capabilities[4].text "while the controls are open" → "in the same upgrade". → done in all 4 locales (zh retrofit line and ar/zh packaging lines already read "synchronized" / "in the same upgrade").
- [x] Honesty: drop "Leading" (anaerobic client; syrup challenge); olive-autoclave + milk-pasteurizer result "ensure safe, high-quality" → "support safe, consistent"; hmi.caption "built to ISA-101" → "designed following ISA-101". → done; ar/zh/tr "رائدة/知名/Önde gelen" removed; pasteurizer "support compliance" kept (modest in all locales).
- [x] hmi.intro.lead: explain HTST on first use (high-temperature, short-time); add to glossary. → done; HTST row added to the AR, ZH and TR glossary sections.
- [x] industries.food-beverage.needs[3].text "customer complaints" → "complaint investigations".
- [x] cheese-cooker + pipe-tester results → full sentences.
- [x] projects.*.client: drop ", Egypt" (location row already says Egypt).
- [x] home.foreignBand.cta → "For foreign manufacturers". → also: home.foreignBand.title/text reworded ("A local engineering team for your new plant") so the eyebrow ui.nav.foreign no longer repeats it; common.ctaBand.foreign title/text aligned to the zh structure ("Involve a local automation team early" + send-us line); about.eyebrows.why → "Working with us".
- [x] about.why.items[5] → "Written scope and clear limits before work starts".
- [x] projects.*.solution → split into 2-paragraph arrays (template change needed). → done: arrays of 2 paragraphs (syrup: 3), same count in all locales; renderer in src/pages/[lang]/projects/[slug].astro accepts string | string[].

## Round 2 — UX changes (pages/components; after motion director)
- [x] Mobile language access: show all-4 language menu on mobile and for zh/tr visitors (not only the quick switch). → globe menu now on every page below 1024px (icon-only on phones, next to the quick switch; quick switch hides below 352px); ≥1024px the utility bar lists all four.
- [x] Contact page: drop self-linking CTA band; move "What we need to quote" checklist beside the form. → new ChecklistPanel (light) at the top of the sidebar; collapsed right under the form below 1024px.
- [x] Mobile home ~25,000px: compact service rows on mobile; move featured projects up. → en 24,950 → 15,149px at 390 (ar 26,424 → 16,164 · zh 23,624 → 14,210 · tr 25,469 → 15,519): projects right after the doors (swipe row on phones), service rows + industry tiles below 768px, compact zone chips, HMI "what you are seeing" points hidden on phones, checklist collapsed, section rhythm token ~50px on phones. 12k would need dropping a section (process / zones / HMI) — not done.
- [x] Service pages: merge quote-checklist block + CTA band (duplicate buttons). → one QuoteCta band (service pitch + buttons | checklist).
- [x] Section index labels "01 —" missing text on service/industry/project pages; home section 05 label missing. → rule: an index only with eyebrow text; detail pages show titles only; home 05 eyebrow = services.index.processEyebrow.
- [x] Case study mobile: move gallery right after meta row. → media block first in DOM (2-up photos on phones, vertical reel above "At a glance"); `lg:order-last` keeps desktop story-first.
- [x] Home: foreign pitch appears 3× — differentiate the dark band (e.g. feature commissioning case). → anaerobic waste-treatment commissioning case (HMI + panel photos, S7-200 SMART / MCGS chips, highlights, case link) + "For foreign manufacturers" CTA.
- [x] Chips: stop uppercasing (PLCs → PLCS bug). → chips keep source casing (mono + 0.04em tracking), all locales.
- [x] 404: add Services/Projects/Quote links; services index: add case studies; footer: "All services"/"All industries". → wired (404 per-language "popular pages" row; services index "Recent work" strip of the 3 newest case studies; footer column links).
- [x] Hero stats: lead with "50+ projects" + "15 case studies" (data-driven count) instead of "4+ years". → home hero: projects · case studies (PROJECTS.length) · years · industries.
- [x] About: merge "What we stand for" and "Why choose us" overlap. → one section (values 2×2 + first four "why" points + platforms); about.why.items[4–5] and about.eyebrows.why no longer rendered (keys kept).
- [x] Foreign page: second CTA "Email an engineer".
- [x] Founder photo APPROVED by user 2026-10-06 → `src/assets/people/founder.jpg` (800×800, light-grey bg). Use on About founder block + small founder strip on home and foreign-manufacturers pages. → FounderBlock photo (chamfered frame) + new FounderStrip (home "why us", foreign "experience"), link → about/#founder.

## Round 2 — zh layout fixes (from native zh review; screenshots scratchpad/review-zh/shots/)
- [x] catalog.ts `html()`/`keepCodes()` must use rich.ts zh word-wrap helper for H1/H2, FAQ questions, card titles (zh headings break mid-word: 维⏎护, 个人护⏎理). → one engine `src/lib/text.ts` (rich.ts + catalog.ts delegate); Card title/summary, FAQ question, ProjectNav, ProcessSteps render through it.
- [x] `src/pages/[lang]/index.astro` featured cards: apply `keepCodes()` ("Siemens S7-⏎1200"). → fixed inside Card (no page edit).
- [x] `text-wrap: balance` on ProjectNav `.type-h4`; `text-wrap: pretty` on FAQ `.prose-lc`.
- [x] rich.ts `zhWords()`: glue digit runs to following measure word ("50⏎多个项目").
- [x] Chips.astro: join with " · " so "·" never starts a line. → "&nbsp;· " join + whole short items; html() also glues " · " in any message (Footer zones line still renders raw text, see typography follow-ups).
- [x] Tech chips on case studies come from projects.ts `technologies[]` in English and uppercase ("YASKAWA VFDS") — localise generic terms (VFDs, Motion control…) via messages; keep brand/model Latin; stop uppercase. → strings ready: messages/<locale>/tech.json items{English → localised}, 43 strings incl. technologies.ts products + PROTOCOLS; `Messages.tech` typed. Wired: `techLabel()` (src/lib/text.ts) in Card tags (home featured, ProjectCard) and TechStack.
- [x] Field.astro optional marker: localise brackets (zh （选填）).
- [x] Footer.astro:123 `". "` join → locale-aware (zh "Logic Controls 版权所有").
- [x] QuoteCta extra space after 。; ASCII colons in sr-only labels (Footer, QuoteCta, ContactChannels) → localise. (also contact hero pills, thanks, privacy, language button; ProcessSteps.astro sr-only "{step} {n}: " now uses colon(locale) → zh "：")
- [x] Borg El Arab zh = 阿拉伯堡 (zh.wikipedia langlink) — fixed.

## Round 2 — tr layout fixes (from native tr review; screenshots scratchpad/review-tr/slices/)
- [x] Chips.astro `isCode()` treats any basic-Latin text as English code → wrong Turkish uppercase (i→I not İ). Only real codes (model numbers, abbreviations) should get lang="en". → `isCode()` in src/lib/text.ts: acronyms, tokens with digits, units, known brands only.
- [x] (same as zh) project technology chips from projects.ts are English-only ("Yaskawa VFDs", "Motion control", "VFD-driven fans and drum", "MEAN WELL power supply", "…with expansion module") — localise. → see tech.json. Wired via techLabel().
- [x] Home hero foreign-box (index.astro ~l.159) squeezes into two narrow columns at 390px + WhatsApp FAB overlaps — stack on mobile. (stacked below 640px, data-fab-avoid)
- [x] Card summaries split "S7-1200" at hyphen — use non-breaking hyphen / keepCodes in summaries too. → Card renders summaries through html() (nowrap code spans).
- [x] HMI demo: "Meyve suyu" recipe button wraps on desktop (minor). → recipe buttons size to their label (flex auto; balanced 2 lines only when really narrow).
- [x] GLOSSARY TR additions: set değeri, lojik, Tag, Engellendi, Ham ürün tankı.

## Round 2 — ar layout fixes (from native ar review; screenshots scratchpad/review-ar/)
- [x] HmiDemo status bar "…HTST-01نظرة عامة" no gap: `.hs-screen` margin-inline-start lands wrong in RTL span → use flex gap.
- [x] Latin names split inside <bdi> ("IEC | 60204-1", "Schneider | Electric", "WinCC | Professional", "LS | Electric", "Logic | Controls"): `[dir=rtl] bdi { white-space: nowrap }` + add  ‑ to LATIN_RUN in rich.ts. → only atoms stay whole (codes, standards, numbers+units, names ≤3 words / ≤20 chars); multi-token runs (`bdi.lc-wrap`) wrap between tokens, never across "و"/"and"/commas.
- [x] Parenthesised Latin glosses wrap with inverted brackets ("ضغط Pressure)" / "(switch"): in rich.ts html(), wrap "(" + run + ")" in nowrap span. → brackets go inside the LTR isolate (`<bdi>(Pressure switch)</bdi>`): one-token glosses never wrap, longer ones wrap with correct brackets (glyph orientation verified).
- [x] Project & service cards skip html()/keepCodes → "S7-" / "1200" breaks (same as zh/tr item).
- [x] Industry tiles: text-wrap: balance on titles (AR wraps to 3 lines with orphan). → balance was already on; AR tile titles one step smaller (0.9×) so "الأغذية والمشروبات / والألبان" is 2 lines at 1280–1440.
- [x] HMI mode chip hard-coded "AUTO/MAN" (hmi-demo.ts:182) → localise via hmi.json keys (all 4 locales). → keys ready: hmi.mode.{auto,manual} (AUTO/MAN · آلي/يدوي · 自动/手动 · OTO/MAN); CIP state can reuse hmi.controls.cip. Wired (HmiDemo runtime + hmi-demo.ts; localised words use the page font, no tracking).
- [x] Mobile hero brand chip breaks inside brand names. → joined chip keeps each brand whole, "·" glued.
- [x] Header logo overlaps utility link (check after motion director). → measured 1024/1100/1280/1440 × en/ar/zh/tr: no overlap.

## Round 2 — typography follow-ups (after src/lib/text.ts; page/component owners)
- [ ] Footer.astro:135 `{t.footer.zones}` renders raw text → TR 390px "6 Ekim ⏎· 10. Ramazan": render with `set:html={html(locale, t.footer.zones)}` (rich.ts) so the "·" sticks to the item before it.
- [ ] LinkTiles.astro:36 `{it.title}` (and :40 `{it.text}`) plain → zh 390px "设备自动化、驱⏎动与运动控制": render through html(locale, …) like Card (locale via prop or Astro.currentLocale).
- [ ] Font swap: metric-matched fallbacks + preloads give CLS 0 on load (all locales, 1440/390). Only when fonts land after first paint can the 390px TR / AR hero H1 re-wrap by one line (stress test, fonts delayed 600 ms: /tr/ 0.036, /ar/industries/food-beverage/ 0.032; desktop ≤ 0.001). If field data shows it, set `display: "optional"` on both families in astro.config.mjs.
- [ ] Android has no Arial/Tahoma: the fallback faces resolve to nothing and the stack falls through to system-ui (unadjusted). Add Roboto / Noto Sans Arabic faces once measured on a device.

## Client confirmations from round-1 iteration (2026-10-07)
- [ ] "Talk to a past client" reference block now appears on case studies (based on existing copy "references can be arranged on request, with the client's permission") — confirm the client can actually provide references.
- [ ] Reply-time promise, working hours, street address (UX-03, CS-05) — needed for contact page, footer, LocalBusiness JSON-LD and Google Business Profile.
- [ ] Are the paired projects (2 shampoo, 2 pasteurizer, 2 laundry) separate jobs? (CS-02)
- [ ] Gallery image captions (projects.items[slug].imageCaptions) — client can describe photos.
- [ ] Cloudflare dashboard: Web Analytics auto-injects a second beacon (token 1f3d2a95…) not visible via API — turn off "automatic setup / JS snippet injection" (PERF-05); our manual beacon (8a235c8b…) stays.

## Client questionnaire (from PK6, 2026-10-07) — send to client
1. Reply-time commitment + working days/hours (Sun–Thu?) to show on contact/thanks/footer.
2. Street address (or industrial zone); can it be public; do customers visit?
3. Google Business Profile (address hidden?) — who owns the Google account; service areas.
4. Team size and roles; can we name them / show photos?
5. Commercial register no., tax card no., legal form — publishable?
6. 1–2 testimonials (by role/sector) + willingness to arrange reference calls.
7. Are the pairs separate jobs: milk pasteurizer vs pasteurizer-with-CIP; laundry washer 2026 vs hotel washer-extractor 2024 (same HMI design?); shampoo LS vs shampoo Delta.
8. Per project: I/O count, commissioning days on site, what the machine had before, one result they stand behind, zone shown, bottle-printer PLC/motion brand, olive-autoclave HMI brand, assumed years (concrete plant, Delta shampoo, milk pasteurizer).
9. Does anyone speak in the shampoo video (captions)? OK to strip audio from printing + laundry videos?
10. Real photos for laundry washer, concrete plant, pipe tester; sharper cheese-cooker panel photo.
11. Any publishable typical price range? (default: none)
12. Native Egyptian check of "لوحات كنترول" / "أوتوميشن" in titles.
