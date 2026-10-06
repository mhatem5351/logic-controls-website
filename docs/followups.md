# Follow-ups (internal)

## Copy consistency (fix in EN, then propagate)
- [ ] `projects.commercial-laundry-washer-control`: title/card say "Laundry washer", SEO title/client say "Hotel laundry washer" — pick one.
- [ ] `projects.shampoo-filling-delta-wecon.result` says "improved"; other case studies say "helped improve" — align.
- [ ] `technologies.drives.title` "Drives and motion" mixes VFDs and stepper drives — fine, but check AR rendering.
- [ ] Pipe tester "Make/Break" = make-up / break-out torque (ft·lb). Confirm wording with client.

## ui.json alignment (after design agent finishes)
- [ ] AR nav labels vs page titles: cosmetics ("مستحضرات التجميل والتعبئة" vs "مستحضرات التجميل"), packaging ("التغليف" vs "التغليف والليبل"), commissioning ("التشغيل والدعم الفني" vs "الاختبار والتشغيل").
- [ ] Same check for zh/tr ui.json vs page titles.

## Page builder
- [ ] `{phone}` / `{email}` placeholders inside RTL sentences must be wrapped in `<bdi dir="ltr">`.
- [ ] Replace English fallback "Logic Controls" only where intended; keep brand Latin.

## WhatsApp prefill
- [ ] zh/tr pre-filled WhatsApp messages (`common.whatsapp.*`, ui.json) arrive in Chinese/Turkish — make them bilingual (local language + English) so engineers can read them.
- [ ] zh pages: native reviewer should confirm 新十月城 / 阿拉伯塔（Borg El Arab）.

## Client questions (pending)
- [ ] Repeat project pairs separate jobs? Real years for 2025-dated ones?
- [ ] Working hours + response time; zones actually served.
- [ ] WeChat ID for zh pages.
- [ ] Permission to name clients / testimonials.
- [ ] Gmail verification click for Email Routing (blocks info@/sales@ rules + form delivery).
