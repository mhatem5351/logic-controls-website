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
- [ ] Gmail verification click for Email Routing (blocks info@/sales@ rules + form delivery).
- [ ] Founder: OK to publish the `about.founder` bio (past employers described, not named)? Founder photo (`client-data/linkedin/photo.jpg`) only with his approval.
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
