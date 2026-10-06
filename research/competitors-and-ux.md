# Competitors & UX research: Logic Controls website

Researched 2026-10-06. Competitor sites were read with WebFetch, and their raw HTML was checked with `curl` for `<html lang/dir>`, hreflang, WhatsApp links, JSON-LD and generator tags. No browser automation was used. Every factual claim cites a URL. Where something is my recommendation rather than a sourced fact, it says so (**Rec.**). This file covers section 2 of the brief. Stack and versions are in `tech-stack.md`.

**Lead decisions applied (2026-10-06):**
- Launch locales: **Arabic, English, Chinese (Simplified), Turkish** at `/ar/ /en/ /zh/ /tr/`.
- Root `/` auto-detects the browser language and falls back to English. `x-default` points to `/`.
- The site must cost **$0/month forever**. The domain is the only paid item.
- Anything below that costs money or needs a credit card is marked **[PAID]**. See §6 for the full list.

---

## 0. TL;DR: what to steal and what to avoid

1. **Arabic is almost unclaimed.** Of the 5 Egyptian integrator sites reviewed, only one (Pulse, formerly Giza Systems, a 1,100-person group) has a real Arabic version. Sinamix, MISC, Mechatronics and the main ATCS site are all `lang="en"` with no Arabic pages (see §1). A fast, properly done Arabic-first site is a real differentiator in the local market.
2. **WhatsApp is under-used.** Only ATCS (1 of 8 MENA sites) has a `wa.me` link, which it labels "Talk to an Engineer" ([atcs-eg.com](https://atcs-eg.com/), raw HTML has `wa.me/201021046972`). Every other site relies on phone, email or forms.
3. **Case studies list equipment, not outcomes.** Sinamix project cards show client, scope and hardware ("S7-300, HMI 9 Inch") with no results ([sinamix.com/projects](https://www.sinamix.com/projects/)). MISC cards show title, client and a teaser ([miscegypt.com/projects](https://www.miscegypt.com/projects/)). The best global sites add quantified outcomes, such as Vention's "5,700+ SKUs palletized" ([vention.com](https://vention.com/)) and Patti's "$200,000 annually" quote ([pattiengineering.com](https://pattiengineering.com/)).
4. **Anti-pattern: JS count-up stat counters.** Pulse, INTECH, Grantek and Vertech all serve "0+ projects" or "3 Projects Completed" in the static HTML that crawlers and link previews read, because the real numbers are only animated in by JS. Pulse's HTML has `data-to-value="2000"`, yet the text reads 0 ([pulsebysolutions.com](https://pulsebysolutions.com/), [intechww.com](https://www.intechww.com/), [grantek.com](https://www.grantek.com/), [vertech.com](https://www.vertech.com/)). **Rec.:** render the final numbers as static text.
5. **Anti-pattern: language switching without real URLs.** INTECH offers 8 languages through the Google Translate widget (`translate.google.com/translate_a/element.js` in its HTML). Al Qudwa's "Arabic" link is `href="#"`. Mechatronics Egypt is a hash-routed SPA (`/#/home`) whose served HTML contains only the word "MECHATRONICS". None of these can be indexed per language ([Google: dynamic language switching may not be crawled](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)).
6. **Best-in-class pattern:** a specific hero ("what + for whom + where"), two CTAs (quote plus a softer one), industry-filterable case studies, certification and partner badges, real testimonials, and a sticky "Talk to an engineer" or "Get a quote" button. SAS Technology's "Industrial Automation Company in Saudi Arabia" hero ([saselectrotech.com](https://saselectrotech.com/)) and Vertech's "industrial automation for the modern plant" with "Let's Chat" and "See Real Results" ([vertech.com](https://www.vertech.com/)) are good models.
7. **Four real locales would be unique in this market.** No Egyptian competitor has properly indexed Chinese or Turkish pages. INTECH only machine-translates through a widget. Separate, human-reviewed `/zh/` and `/tr/` pages with hreflang would make Logic Controls the findable local partner for Chinese and Turkish manufacturers. On `/zh/` this needs China-safe contact options (WeChat or email, not WhatsApp) and no Google embeds (§4.11).

---

## 1. Egyptian & MENA competitor websites (8 reviewed)

Measured 2026-10-06 with `curl` (raw HTML only, so JS-injected content is not counted).

| # | Company / URL | Base | Platform (generator) | `<html>` lang/dir | hreflang in `<head>` | WhatsApp link | Script tags |
|---|---|---|---|---|---|---|---|
| 1 | Sinamix: [sinamix.com](https://www.sinamix.com/) | 10th of Ramadan, EG | WordPress + Elementor 4.2 | `en-US` | none | none | 50 |
| 2 | MISC Egypt: [miscegypt.com](https://www.miscegypt.com/) | Cairo, EG | WordPress + Elementor 4.1 | `en-US` | none | none | 59 |
| 3 | ATCS: [atcs-eg.com](https://atcs-eg.com/) | Cairo (4 branches), EG | WordPress 7.1 | `en`, `ltr` | none | **yes** (2 numbers) | 45 |
| 4 | Pulse by solutions (formerly Giza Systems): [pulsebysolutions.com](https://pulsebysolutions.com/) | Cairo + GCC/Africa | WordPress + WPML | `en-US`; `/ar/` is `lang="ar" dir="rtl"` | only on switcher `<a>` tags, not `<link rel=alternate>` | none | 50 |
| 5 | Mechatronics Egypt: [mechatronics-eg.com](https://www.mechatronics-eg.com/) | EG | Angular-style SPA (`/#/home`) | `en` | none | none | 5 (content all client-side) |
| 6 | Al Qudwa Automation: [alqudwasys.com](https://alqudwasys.com/) | Dubai, UAE (+KSA) | Webflow | `en` | none (Arabic link is `href="#"`) | none | 10 |
| 7 | SAS Technology: [saselectrotech.com](https://saselectrotech.com/) | Al Khobar, KSA | WordPress 7.0 | `en-US` | none | none | 30 |
| 8 | INTECH Process Automation: [intechww.com](https://www.intechww.com/) | KSA/UAE/US | WordPress (Total theme) | `en-US` | none (Google Translate widget) | none | 69 |

Not reviewable, which is itself a finding: many Egyptian integrators have a weak or broken web presence and rely on directories. **AEE** (`aeecontrols.com`) returns DNS ENOTFOUND, the **EISAC Automation** domain is parked for sale on GoDaddy, and **EGICS** and **Target Engineering** reset the connection. All four mainly appear through [Yellow Pages Egypt](https://yellowpages.com.eg/en/keyword/scada-system) and [automa.net](https://automa.net/business-directory/egypt/system-integrator) listings.

### 1.1 Sinamix: https://www.sinamix.com/
- **What they do:** Siemens system integrator and LV control-panel builder founded in 2014 in 10th of Ramadan ([Yellow Pages EG](https://yellowpages.com.eg/en/profile/sinamix-automation/693272), [CB Insights](https://www.cbinsights.com/company/sinamix)).
- **Hero:** "welcome to sinamix", "we do it once..we do it right". Generic, with no "what, for whom, where".
- **Structure:** Home, About, Services, Products (Industrial Automation, Drives, LV Distribution, Industrial Control), Projects, Partners, Careers, News, Contact.
- **Case studies:** Projects are grouped by industry (pharma, oil & gas, metals). Each card gives client, scope and hardware, e.g. "Indirect Heater Skids A, B, C & D. S7-300. HMI 9 Inch." There are no results or metrics ([projects](https://www.sinamix.com/projects/)).
- **Trust:** "Authorized Siemens System Integrator", 3 downloadable certificates, named pharma and oil clients. No client-logo wall and no numbers.
- **CTAs:** "Get a quote" and a PDF catalogue. Contact is by phone, fax and email only, with no form or WhatsApp.
- **Languages:** English only.
- **Take:** Credible project list, but the generic hero and English-only content are weak for a local Arabic audience. Copy the "hardware used" field and add an outcome field.

### 1.2 MISC Egypt: https://www.miscegypt.com/
- **What they do:** Siemens Solution Partner since 1999, ISO 9001 certified by TÜV SÜD ([search summary of company profile](https://wuzzuf.net/jobs/careers/MISC-Egypt-1098)).
- **Hero:** "The Art Of Automation", with the subline "100+ Projects across Egypt (and Growing)". The proof point in the hero is good.
- **Structure:** Partners, Projects, Certificates, Services, About, Quality, Documentation, Clients, Contact. A sticky "Get A Quote" button.
- **Case studies:** Filterable by type (Oil & Gas, Water, Tobacco…) and by application. Five sector case studies (Mondelez, KAPCI, Eastern Company, Petrotrade, Ain Shams WWTP) ([projects](https://www.miscegypt.com/projects/)).
- **Trust:** 25+ client logos (Petrobel, Enppi, Veolia, Mondelez). Partner badges for Siemens Solution Partner, Honeywell and ZALUX. Stats: "25+ years", "78 projects", "90% client satisfaction". Note that "78 projects" contradicts the hero's "100+".
- **Languages:** English only. Hours are given as "Sun–Thu 9AM–5PM", which is a nice local touch.
- **Take:** The strongest Egyptian benchmark for **trust architecture** (logos, partner tiers, certificates page, filterable projects). Gaps: no Arabic, inconsistent numbers, no WhatsApp.

### 1.3 ATCS for Control Systems: https://atcs-eg.com/
- **What they do:** Distributor (Schneider industrial, Delta PLC/HMI/servo, Panasonic) plus integrator and panel builder, established 2014 ([Yellow Pages EG](https://yellowpages.com.eg/en/profile/atcs-for-control-systems/533774)).
- **Hero:** "Automation Products. Engineering Expertise. Egypt.", with the subline "Explore drives, soft starters, PLCs and HMI panels, backed by technical support from ATCS." Clear and geo-anchored.
- **CTAs:** "Shop Products" plus **"Talk to an Engineer" (WhatsApp)**. The raw HTML contains `wa.me/201021046972` and `wa.me/201009021327`.
- **Trust:** 4 branches with Google Maps, a technical blog with model-level guides. No case studies, no client logos, no RFQ form.
- **Languages:** English UI with Arabic used for branch addresses and header.
- **Take:** The best Egyptian **conversion pattern**: a WhatsApp CTA framed as "talk to an engineer", rather than a generic chat bubble. It is weak on proof (no projects).

### 1.4 Pulse by solutions (formerly Giza Systems): https://pulsebysolutions.com/
- **What they do:** Large MEA systems integrator (1974, ~1,100 staff, part of the stc "solutions" group) covering SCADA, process control and smart cities ([Craft](https://craft.co/giza-systems)). Its `gizasystems.com` URL now 301-redirects here.
- **Hero:** "intelligence that transforms". Abstract corporate copy that says nothing about automation.
- **Structure:** About, Industries & Solutions, Success Stories, Knowledge Hub, Sustainability & CSR, Contact. EN/AR switcher.
- **Trust:** 80+ client logos, Saudi LCGPA local-content certificate, Tasneef grades. The stat counters render "0" in HTML (`data-to-value="2000"` animated by JS).
- **Arabic:** `/ar/` is a real translation (`<html dir="rtl" lang="ar">`, H1 "تكنولوجيا ذكية من أجل التحول"). However, the Arabic `<title>` is left in English and there are no `<link rel="alternate" hreflang>` tags in `<head>`. WPML only puts `hreflang` on the switcher anchors, which Google does not use as hreflang annotations ([Google hreflang methods](https://developers.google.com/search/docs/specialty/international/localized-versions)).
- **Take:** Proof that a big Egyptian brand invests in Arabic. Its execution mistakes (untranslated `<title>`, missing hreflang, zero counters) are easy to avoid.

### 1.5 Mechatronics Egypt: https://www.mechatronics-eg.com/
- **What they do:** PLC, drive, sensor and control-panel supplier and integrator ([Bahrain Business Gate profile](https://bahrainbusinessgate.bh/members-club/mechatronics/)).
- **Finding:** The site is a client-rendered SPA with hash routes (`/#/home`). WebFetch and `curl` see only `<title>MECHATRONICS</title>` and font CSS, with no services, projects or contact text in the served HTML.
- **Take:** The clearest **anti-pattern** for SEO, link previews and AI answers. Content has to be in the HTML (static pre-render).

### 1.6 Al Qudwa Automation Systems (UAE): https://alqudwasys.com/
- **Hero:** "Transforming Industries Pioneering Automation", with the subline "Leading System Integrator and Solution Provider", "+10 years… around 40 staff". Being honest about size builds trust for a mid-size firm.
- **Structure:** Solutions (11), Services (8), Industries, Products, Projects, Partners, Clients, News, Contact. "Get a Quote" in the header and footer.
- **Trust:** Client logos (DEWA, Emaar, Tabreed, e&, Sharjah Gov). "+13 years". No certification badges.
- **Languages:** The switcher shows English/Arabic/Hindi, but the Arabic link is `href="#"`, i.e. client-side switching on a single URL with no hreflang. That is not indexable per language.
- **Take:** Good client-logo wall and size transparency. The language implementation is a model to avoid.

### 1.7 SAS Technology (KSA): https://saselectrotech.com/
- **Hero:** "Industrial Automation Company in Saudi Arabia", with the subline "…trusted system integrator delivering PLC, SCADA, BMS, LV panels, and substation automation across Saudi Arabia…". CTAs "Request a Free Consultation" and "View Our Services". **The best SEO-literal hero in the set.**
- **Trust:** "Saudi Aramco & ISO 9001 Approved", partner logos (ABB, Schneider, Rockwell, Siemens, Copa-Data, Inovance), standards cited (IEC 61850, IEC 61131-3), city list in the header ("Al Khobar HQ • Riyadh • Jeddah • Bahrain • Oman").
- **Case-study format:** Title | Location | Description | Specs, e.g. "NWC – Taif Lifting Station Automation | Dammam, KSA | ABB PLC…".
- **Form:** Name, Email, Phone, Scope description, i.e. 4 fields.
- **Gaps:** English only in KSA, no WhatsApp, and only established in 2023, which they state openly.
- **Take:** A young integrator, close to Logic Controls' stage, that wins on **specificity**: geo-keyword hero, the brands it works with, the standards it designs to, and a short form.

### 1.8 INTECH Process Automation (KSA/UAE/US): https://www.intechww.com/
- **What they do:** Global integrator founded in 1991 with 450+ staff and an ABB Value Provider for the UAE and Iraq ([ABB news](https://new.abb.com/news/detail/88014/abb-partners-with-intech-process-automation-in-uae-and-iraq)).
- **Hero:** "Deployment-ready modular solutions from our Houston Center of Excellence". CTAs "Explore our solutions" and "Talk to our expert", plus a persistent "Talk to Sales".
- **Structure:** A mega-menu by offering (Process Automation, Digital, OT-Cybersecurity, Electrical, Skids, Field Services) and industry segmentation. Downloadable brochures.
- **Languages:** 8 (EN, AR, ZH, FR, ID, RU, ES, DE), but delivered by the **Google Translate widget**, so the translations are machine-generated, not indexable and not reviewed. Counters render "0".
- **Take:** Shows that MENA integrators know foreign-language visitors matter (including Chinese). Delivering that through a widget is the wrong way to do it.

---

## 2. Best-in-class global integrator & industrial-brand sites (8 reviewed)

| # | Company / URL | Why it's on the list | Hero (exact) | Patterns worth extracting | Weak spots |
|---|---|---|---|---|---|
| 1 | **Vertech**: [vertech.com](https://www.vertech.com/) | 2022 CSIA Integrator of the Year | "industrial automation for the modern plant" / "There's a human way to do MES, SCADA, Controls, and Industrial IT…" | Two CTAs, "Let's Chat" and **"See Real Results"**. Resources hub filterable by industry and type (case studies, white papers, calculators). Client logos (Tesla, Intel, Tillamook). Cert badges: CSIA, UL508A/698A, Inductive Automation Premier, Rockwell, AVEVA. Office list with phone numbers. | Counter shows "3 Projects Completed" in HTML (JS animation) |
| 2 | **E Tech Group**: [etechgroup.com](https://www.etechgroup.com/) | CSIA certified, 2025 SI of the Year | "Beyond Automation and Control" / "We are the Main Automation Partner…" | **Dedicated "Partners & Certifications" page** with tiered badges (Rockwell Platinum, Siemens Solution Partner, Schneider Alliance, AVEVA, Ignition Premier, TÜV Rheinland). 12-industry nav including "OEM & Machine Builders". Named testimonials. | Little quantification in case studies; vague value prop |
| 3 | **Grantek**: [grantek.com](https://www.grantek.com/) | 40-yr integrator, pharma & F&B focus | "CONSULT DESIGN DELIVER" | Industry-first nav (Pharma & Life Sciences, F&B, CPG). Inline contact forms with region select. **Office pages per location** with map links. "24/7 Support" in the nav. | Stat counters render "0"; no logo wall |
| 4 | **Interstates**: [interstates.com](https://www.interstates.com/) | CSIA Integrator Member of the Year | "Serving you for over 70 years Built on Trust" / "From project inception to ongoing facility operation…" | Lifecycle message (design → operate). Project stories framed around business outcomes. 4 detailed testimonials from ops directors and VPs. Safety section. | No partner logos; outcomes not quantified |
| 5 | **Patti Engineering**: [pattiengineering.com](https://pattiengineering.com/) | CSIA certified, Siemens/FANUC/Beckhoff partner | "Modern Solutions for Today's Automation Challenges" | Nav section **"Partners"** listing each vendor technology (Siemens, FANUC, Mitsubishi, Beckhoff, Ignition). Case-study cards tagged by vendor and industry. A **quantified testimonial** ("$200,000 annually"). Final CTA "Contact an Expert". | Few logos |
| 6 | **Brock Solutions**: [brocksolutions.com](https://www.brocksolutions.com/) | 800+ staff, employee-owned | "Solutions that Perform." | **Panel fabrication has its own CTA** ("Let's Get Started"). Credentials as plain numbers: 800+ employees, 30+ years, "Canada's Best Managed" 29 years running. Customer quote bubbles with logos. | Testimonials lack metrics |
| 7 | **Actemium Avanceon**: [avanceon.com](https://www.avanceon.com/) | VINCI Energies integrator, F&B/CPG/water | No single hero. Pillars: "Define your digital future", "Turn data into decisions" | Solutions × Industries matrix. Dated case studies and blogs (recent dates signal an active firm). | Generic "Know More" CTAs; no quantified proof |
| 8 | **Vention** (industrial automation brand): [vention.com](https://vention.com/) | Best modern design in the set; correct multilingual SEO | "The Floor Runs on Us." / "Vention helps manufacturers automate their operations in record time…" | **Quantified everything**: "1.3-year payback", "3–8× faster deployment", "28K+ machines". Customer stories use the same challenge, solution, 2–3 numbers format. Real-equipment photography. **Correct hreflang**: `x-default`, `en`, `fr` (`/fr`), `de` (`/de`) in `<head>` (verified via `curl`). | Pricing behind a demo; no chat |

CSIA certification is third-party validation that an integrator meets audited best practices in 10 areas, including project management, quality, service and support, and cybersecurity ([CSIA](https://www.controlsys.org/certification)). It is the North American trust badge. The Egyptian equivalents are **vendor partner tiers** (e.g. Siemens Solution Partner, used by Sinamix and MISC) and **ISO 9001**.

---

## 3. Patterns extracted for Logic Controls (do / avoid)

| Do | Avoid |
|---|---|
| Hero that names **what + for whom + where** (SAS, ATCS) | Abstract slogans ("intelligence that transforms", "welcome to sinamix") |
| Two CTAs: **Request a quote** + **WhatsApp an engineer** (ATCS) | One generic "Contact us" |
| Proof in or near the hero: years, projects, industries, brands (MISC "100+ Projects across Egypt") | Inconsistent numbers across pages (MISC 100+ vs 78) |
| Static numbers in HTML | JS count-up counters that crawlers read as "0" (Pulse, INTECH, Grantek, Vertech) |
| Case studies filterable by **industry** and **service**, with hardware **and** outcome | Equipment-only project cards (Sinamix) |
| A "Brands & Technologies we work with" page with honest wording (Patti, E Tech) | Claiming "authorized/partner" status without a certificate |
| Separate, server-rendered URL per language with hreflang (Vention) | Google Translate widget (INTECH), `href="#"` switchers (Al Qudwa), SPA hash routes (Mechatronics) |
| Location and service-area clarity (ATCS branches + maps, SAS city list, Grantek office pages) | No address, or virtual-office addresses |
| Downloadable company profile PDF (INTECH, Sinamix catalog) | Gating basic info behind forms |
| Light pages (static HTML, few scripts) | 45–69 script tags typical of WordPress/Elementor builds in this set |

---

## 4. B2B industrial website UX best practices (2025–2026)

### 4.1 What technical buyers want
- 73% of technical buyers rely on vendor websites and online technical publications. About 60% of the buying process happens online before engineers contact sales, and 70% rarely or never use AI to evaluate vendors ([TREW Marketing, 2025 State of Marketing to Engineers](https://www.trewmarketing.com/blog/2025-state-of-marketing-to-engineers-research)).
- Engineers rate data sheets the most useful content (77%), followed by CAD drawings (45%), demo videos (42%) and white papers (38%) ([TREW/GlobalSpec research archive](https://www.trewmarketing.com/resources/research-archives)).
- NN/g's long-running B2B studies found success rates of only 58% on B2B sites versus 66% on consumer sites. Pricing is the information users want most and find least. Credibility has to be established before people will hand over contact details ([NN/g, B2B usability](https://www.nngroup.com/articles/b2b-usability/), 2006, still the canonical study, and [NN/g report](https://www.nngroup.com/reports/b2b-websites-usability/)).
- **Rec.:** Even without a price list, publish **typical ranges or lead times** (e.g. "standard control panel: 2–4 weeks from approved drawing", using figures the client confirms), list **what we need from you to quote**, and keep all service info ungated.

### 4.2 Recommended sitemap / information architecture
**Rec.**, derived from the patterns in §1–3. ASCII slugs are shared across all four locales, under a locale prefix: `{lang}` ∈ `ar | en | zh | tr`.

```
/                         → x-default: detects browser language → 302 to /ar/ /en/ /zh/ /tr/; falls back to /en/ (see §5.1)
/{lang}/                  Home
/{lang}/services/         Services hub
   control-panels/        Control panel design & manufacturing (لوحات التحكم الكهربائية)
   plc-hmi-programming/   PLC & HMI programming (برمجة PLC و HMI)
   machine-automation/    Machine automation & retrofits/upgrades (أتمتة وتطوير الماكينات)
   scada-monitoring/      SCADA / production monitoring (only if delivered)
   commissioning-support/ Commissioning, maintenance & AMC / after-sales (التشغيل والصيانة)
/{lang}/industries/       Industries hub
   food-beverage/  pharmaceutical/  cosmetics-filling/  packaging/  (+ others with proof)
/{lang}/projects/         Case studies (filter: industry × service), /{lang}/projects/{slug}/
/{lang}/technologies/     Brands & technologies (LS Electric PLC, Wecon HMI, VFDs, sensors…)
/{lang}/foreign-manufacturers/  "Setting up a factory in Egypt?": landing page for audience B
/{lang}/about/            Story, team & engineers, workshop, quality/standards, location map
/{lang}/insights/         (Phase 2) technical guides for SEO (start with AR/EN)
/{lang}/contact/          RFQ form + WhatsApp (zh: WeChat QR + email) + phone + static map + hours
/{lang}/contact/thanks/   Confirmation (what happens next + WhatsApp/WeChat follow-up)
/{lang}/privacy/          Privacy notice (Egypt PDPL, see §4.6)
/sitemap-index.xml, /robots.txt, /404
```
Notes:
- Five top-level nav items at most: **Services · Industries · Projects · About · Contact**, plus a persistent **"Request a quote"** button and a language switcher. "Technologies" and "Foreign manufacturers" go in the footer and in contextual links. The foreign-manufacturers page is the home-page entry point for audience B ("Setting up in Egypt? →").
- Every service and industry page ends with: relevant projects → brands used → FAQ (visible) → RFQ / WhatsApp CTA.
- ASCII slugs keep links short when shared on WhatsApp, because Arabic slugs are percent-encoded. Google supports both and recommends audience-language words where possible ([Google URL structure](https://developers.google.com/search/docs/crawling-indexing/url-structure)). **Rec.:** ASCII slugs with fully Arabic titles, H1s and meta descriptions.

### 4.3 Hero messaging
- **Formula (Rec.):** `[What we build] for [who] in [where]` + one proof line + `Request a quote` (primary) + `WhatsApp an engineer` (secondary). Add a strip of 3–4 static proof chips (years, projects, industries, brands). This combines SAS's literal geo-headline, ATCS's WhatsApp CTA and MISC's proof subline (§1).
- **Draft EN (verify all numbers with the client):** "PLC control panels & machine automation for factories in Egypt." Subline: "Designed, built, programmed and commissioned in-house: filling, food & beverage, pharma and cosmetics lines running on LS PLC and Wecon HMI."
- **Draft AR:** "لوحات تحكم وأنظمة أتمتة للمصانع في مصر". Subline: "تصميم وتصنيع وبرمجة وتشغيل داخل شركتنا — لخطوط التعبئة والأغذية والأدوية ومستحضرات التجميل باستخدام LS PLC وشاشات Wecon HMI." Write the Arabic natively rather than translating, and keep acronyms (PLC, HMI, SCADA, VFD) in Latin script, as Egyptian engineers use them.
- **Foreign-manufacturer variant** (for `/en/foreign-manufacturers/`, and as the home hero on `/zh/` and `/tr/`): "Your local automation & controls partner in Egypt", covering commissioning, spare parts, local support and documentation in your language.
  - **Draft ZH** (native review required): "您在埃及的本地自动化与控制合作伙伴". Subline: "PLC 控制柜设计制造、编程、现场调试与售后支持 — 提供中文 / 英文技术文档。"
  - **Draft TR** (native review required): "Mısır'daki yerel otomasyon ve kontrol ortağınız". Subline: "PLC kontrol panoları, makine otomasyonu, devreye alma ve satış sonrası destek — Türkçe / İngilizce dokümantasyon."
  - Promise documentation "in your language" only if the client can deliver it. Otherwise say "English technical documentation; we speak your language on the website and at first contact".
- Use real photos of panels, the workshop and commissioning on site, not stock robots. Vention's real-equipment photography is the benchmark ([vention.com](https://vention.com/)).

### 4.4 Case-study template (Challenge → Solution → Tech stack → Result)
**Rec.** This adds an outcome field to what Sinamix and MISC already show, follows Vention's challenge/solution/2–3-number cards, and uses SAS's Title | Location | Specs header (§1–2).

```
Title:     "<Outcome verb> <machine/line> for <industry client or anonymized descriptor>"
Meta:      Industry · Service · City/industrial zone · Year · Duration
At a glance (3 chips): e.g. "Changeover 25 → 8 min", "0 unplanned stops in 6 months", "Commissioned in 10 days"
1. Challenge   – production problem in the plant's terms (downtime, manual steps, accuracy, safety, old relay logic)
2. Solution    – what we designed/built/programmed; scope boundary (panel, program, HMI screens, SCADA, training)
3. Tech stack  – PLC (e.g. LS XGB/XGK), HMI (Wecon model), drives/servo, sensors, network protocol, standards followed
4. Result      – measured before/after numbers + client quote (name/title, with permission)
Gallery:   panel interior, HMI screens (blur client data), installed machine
CTA:       "Have a similar line? Request a quote / WhatsApp an engineer"
Schema:    Article (optional) + BreadcrumbList
```
- Allow **anonymized** case studies ("a leading pharma plant in 6th of October City") when clients won't give permission. Keep the numbers truthful and approved by the client.
- Filter the list by industry and by service, as MISC and Vertech do ([MISC projects](https://www.miscegypt.com/projects/), [Vertech resources](https://www.vertech.com/case-studies)).

### 4.5 Trust signals (in priority order)
1. **Real project photos and case studies** (above).
2. **Client logos**, used with permission. MISC's 25+ logos and Al Qudwa's DEWA and Emaar logos are the strongest trust elements on their sites (§1.2, §1.6).
3. **Brands & technologies** with honest labels: "We program and integrate LS Electric PLCs and Wecon HMIs". Only use "authorized partner" if the vendor has issued a certificate. E Tech, Patti and SAS show tiered partner badges (§2).
4. **Standards you design to.** For example, control-panel assemblies to [IEC 61439-1:2020](https://webstore.iec.ch/en/publication/32338) and machine electrical equipment to [IEC 60204-1 Ed. 6.1](https://webstore.iec.ch/en/publication/1026). State this only if the client follows and documents it. These are audience-B reassurance points, and `market-and-audience.md` covers compliance.
5. **Static numbers**: years, projects, panels delivered, industries, response time. They must be the same on every page.
6. **Location proof**: workshop address, map, photos of the facility, service-area list of industrial cities, and working hours (as MISC and ATCS show).
7. **Named testimonials** with a metric (Patti's "$200,000 annually", §2).
8. Downloadable **company profile PDF** in AR and EN at launch, plus ZH and TR once a native speaker has reviewed them.

### 4.6 RFQ / quote form design
- **Field count matters.** Baymard found 8 fields is the practical optimum for checkout, versus an average of 11.3. A single "Full name" field avoided the confusion seen with split first/last name fields ([Baymard](https://baymard.com/blog/checkout-flow-average-form-fields)). Recent industry benchmark compilations report a large drop-off beyond about 5–7 fields on lead forms, and that splitting longer forms into 2–3 steps raises completion. Treat these as directional ([Foundry CRO 2026](https://foundrycro.com/blog/form-conversion-rate-benchmarks-2026/), [Visionary Marketing 2026](https://visionary-marketing.co.uk/blog/form-completion-rate-statistics-2026)).
- **Rec.: two-step RFQ.**
  - Step 1 (required, 4 fields): Full name · Company · Mobile/WhatsApp (with country code) · What do you need? (select: New control panel / Machine automation / Retrofit-upgrade / PLC-HMI programming / Troubleshooting & support / Spare parts).
  - Step 2 (optional): Industry (select) · Plant location (governorate / industrial city select + "Outside Egypt") · Timeline (select) · Description (textarea) · Email · Preferred contact (WhatsApp / call / email).
  - Add a "Prefer WhatsApp? Send photos of the machine nameplate or drawings →" link instead of file upload, which keeps the static form simple.
  - **Per-locale variants:**
    - On `/zh/`, label the contact field "Phone / WeChat ID" (电话 / 微信号), make Email required, and replace the WhatsApp link with "Email drawings to info@…".
    - On `/en/`, `/zh/` and `/tr/`, add a step-2 option to the "What do you need?" list: "New factory in Egypt: full automation scope" (audience B).
    - Store a hidden `locale` field so the owner knows which language to reply in.
- Visible labels, not placeholder-only. Mark optional fields. Validate inline. Use `autocomplete` attributes (`name`, `organization`, `tel`, `email`) to meet [WCAG 2.2](https://www.w3.org/TR/WCAG22/) 1.3.5 Identify Input Purpose. Use `type="tel"` and `inputmode="tel"`.
- In RTL pages, set phone and email inputs to `dir="ltr"`. Use `dir="auto"` plus the `dirname` attribute on free-text fields, so mixed Arabic and English model numbers render correctly and their direction is submitted ([W3C, HTML dir](https://www.w3.org/International/questions/qa-html-dir)).
- Use spam protection without CAPTCHA puzzles (Turnstile, see `tech-stack.md`). WCAG 2.2 3.3.8 forbids cognitive tests without an alternative ([W3C, what's new in 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)).
- The thank-you page should say what happens next and when ("an engineer will contact you within X working hours"), offer a WhatsApp button for urgent requests, and list office hours.
- **Privacy:** Egypt's Personal Data Protection Law 151/2020 now has Executive Regulations (Ministerial Decree 816/2025, issued 1 Nov 2025) covering consent, privacy notices and direct electronic marketing ([Al Tamimi](https://www.tamimi.com/law_update_articles/from-policy-to-practice-egypt-issues-executive-regulations-of-the-personal-data-protection-law/), [CMS](https://cms.law/en/are/legal-updates/egypt-s-pdpl-executive-regulations-issued-one-year-compliance-countdown-begins)). **Rec.:** add a short consent line and privacy-notice link under the form. Do not pre-tick marketing opt-ins. Get local legal review.

### 4.7 WhatsApp click-to-chat (Egypt)
- **Format:** `https://wa.me/<number>?text=<url-encoded message>`. The number is in full international format, digits only, with no `+`, spaces, dashes, brackets or leading zeros ([WhatsApp Help Center, "How to use click to chat"](https://faq.whatsapp.com/5913398998672934), with the format confirmed by [dotdigital](https://support.dotdigital.com/en/articles/11331301-click-to-chat-for-whatsapp) and [Unipile](https://www.unipile.com/fr/?p=275019)).
  - An Egyptian mobile written locally as `010 1234 5678` becomes `https://wa.me/201012345678` (country code 20, drop the leading 0). This is the same pattern ATCS uses (`wa.me/201021046972`).
- **Rec.:**
  - Use **per-page pre-filled text in the page's language**, e.g. on `/ar/services/control-panels/`: `?text=` + encodeURIComponent("مرحباً، أريد عرض سعر للوحة تحكم — من صفحة لوحات التحكم"). The sales team then knows the context immediately.
  - Use **two placements**: (1) a secondary hero CTA labelled "WhatsApp an engineer" / "كلّم مهندس واتساب" (ATCS pattern), and (2) a floating button. In LTR the floating button goes bottom-right. In RTL mirror it to bottom-left, at least 44–48 px. It must not cover focused elements (WCAG 2.4.11) or the cookie and consent text.
  - Use the **WhatsApp Business app** profile (name, hours, address, catalogue of services, greeting and away messages) so the conversation keeps the brand. Show the same number in the footer as `tel:` as well.
  - **$0:** the WhatsApp Business **app** and `wa.me` links are free. The WhatsApp Business **Platform/Cloud API** is **[PAID]**: Meta has charged per template message since 1 Jul 2025, although customer-initiated non-template replies are free ([Meta pricing docs](https://developers.facebook.com/docs/whatsapp/pricing/)). It also needs a payment method. Don't use the API or any paid chat widget.
- **Contact channel per locale (Rec.):**

  | Locale | Primary CTA | Secondary | Notes |
  |---|---|---|---|
  | `/ar/` | WhatsApp an engineer | RFQ form, phone | Pre-filled Arabic text |
  | `/en/` | Request a quote (form) | WhatsApp, email | Pre-filled English text |
  | `/tr/` | Request a quote (form) | WhatsApp, email | Pre-filled Turkish text |
  | `/zh/` | Request a quote (form) + email | **WeChat ID/QR** | WhatsApp is blocked in mainland China (§4.11). Add "In Egypt? WhatsApp us" as a tertiary link for Chinese managers already on site |
- **Why it matters:** Egypt had 121 M mobile connections (102% of population) and 98.2 M internet users (82.7%) at end-2025, with a median mobile download of 56.45 Mbps ([DataReportal Digital 2026 Egypt](https://datareportal.com/reports/digital-2026-egypt)). DataReportal publishes no WhatsApp figure for Egypt. Vendor estimates put Egyptian WhatsApp users at about 52 M, but treat that as unverified ([ChatDaddy 2026](https://chatdaddy.tech/blog/whatsapp-business-api-egypt), [Statista forecast](https://www.statista.com/statistics/1145037/whatsapp-users-in-egypt/)).

### 4.8 Arabic RTL design considerations
- **Markup:** `<html lang="ar" dir="rtl">` on Arabic pages. Set direction in HTML, not CSS, and do not infer direction from `lang` ([W3C i18n, "Structural markup and right-to-left text in HTML"](https://www.w3.org/International/questions/qa-html-dir)).
- **CSS:** Use logical properties (`margin-inline-start`, `padding-inline-end`, `inset-inline-start`, `text-align: start`) so a single stylesheet serves LTR and RTL ([MDN, CSS logical properties](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_logical_properties_and_values)). Tailwind's `ms-*`/`me-*`/`ps-*`/`pe-*` and the `rtl:` variant are covered in `tech-stack.md`.
- **Mirror:** page layout, nav order, breadcrumbs, back/next chevrons and arrows, carousels and sliders, step and progress indicators, and the floating WhatsApp button side.
- **Do not mirror:** logos, phone numbers, product codes, media playback controls, clocks, checkmarks, and icons of real objects ([Material Design, Bidirectionality](https://m2.material.io/design/usability/bidirectionality.html)). Keep the Logic Controls logo unflipped, including its italic slant.
- **Mixed-direction strings:** wrap Latin model numbers and units inside Arabic text (`LS XGB-DR16C`, `24 VDC`, `IP65`) in `<bdi>` or `<span dir="ltr">`, and wrap phone numbers in `dir="ltr"`. Otherwise the bidi algorithm can reorder `+20 10…` and dash-separated codes ([W3C](https://www.w3.org/International/questions/qa-html-dir)).
- **Typography:**
  - Never apply `letter-spacing` to Arabic, because it breaks letter joining ([MDN letter-spacing](https://developer.mozilla.org/en-US/docs/Web/CSS/letter-spacing)). Reset any tracking used on Latin headings with `:lang(ar)`.
  - Use no fake italics on Arabic and no `text-transform: uppercase`, since Arabic has no case. Keep the brand's italic feel in the logo and Latin headings only.
  - Arabic looks smaller than Latin at the same size, because the letter bodies are small relative to their extenders ([Thomas Phinney quoted by Alex Strick](https://alexstrick.com/personal/2017-03-12-why-are-arabic-fonts-so-small.html)). **Rec.:** make Arabic body text about 1–2 px (≈10–15%) larger than Latin, with line-height around 1.7 for body text versus about 1.5 for Latin. Font choice is in `tech-stack.md`.
- **Numerals:**
  - The W3C Arabic Layout Requirements list Egypt among countries that traditionally use Arabic-Indic digits (٠–٩) ([W3C alreq, Oct 2025](https://www.w3.org/TR/alreq/)). CLDR's default for `ar` is `arab`, so `Intl` will output ١٢٣ unless told otherwise ([CLDR users list](https://corp.unicode.org/pipermail/cldr-users/2019-April/000918.html), [MDN, numberingSystem](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale/numberingSystem)).
  - A spot check on 2026-10-06 found that major Egyptian Arabic sites use **Western digits** in body text: youm7.com had 224 Western and 0 Arabic-Indic, and masrawy.com 187 and 0 (`curl` text count).
  - **Rec.:** use Western digits (0–9) everywhere: specs, model numbers, phone numbers, stats. They match datasheets, nameplates and WhatsApp numbers. Format with `ar-EG-u-nu-latn` in `Intl`.
- **Content:** Write native Arabic copy, not a literal translation. Google advises one language per page, no side-by-side translations, and translating the main content rather than just the boilerplate ([Google multi-regional](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)).

### 4.9 Mobile performance
- **Core Web Vitals "good" thresholds at the 75th percentile:** LCP ≤ 2.5 s, INP ≤ 200 ms (INP replaced FID in 2024), CLS ≤ 0.1 ([web.dev, Web Vitals](https://web.dev/articles/vitals)).
- **Competitor baseline:** the WordPress/Elementor sites in §1 serve 150–460 KB of raw HTML and 45–69 `<script>` tags on the home page (`curl`, 2026-10-06). A static site can beat them easily.
- **Rec. checklist:**
  - Static HTML with JS only for islands (form, language menu).
  - LCP hero image in AVIF/WebP with `fetchpriority="high"`, responsive `srcset`, and explicit `width`/`height` to protect CLS.
  - Lazy-load images below the fold.
  - Self-hosted, subset fonts with `font-display: swap` and only 2 weights per script.
  - No autoplay video hero on mobile, no count-up animations, no chat-widget SDKs (a plain `wa.me` link is about 0 KB).
  - Keep tap targets apart. Test on mid-range Android over 4G.

### 4.10 Accessibility (WCAG 2.2 AA)
- WCAG 2.2 became a W3C Recommendation on 5 Oct 2023. It adds 2.4.11 Focus Not Obscured (AA), 2.5.7 Dragging Movements (AA), 2.5.8 Target Size Minimum (AA), 3.2.6 Consistent Help (A), 3.3.7 Redundant Entry (A) and 3.3.8 Accessible Authentication (AA), and removes 4.1.1 Parsing ([W3C, what's new](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)).
- Target size must be **at least 24×24 CSS px**, or spaced so that 24 px circles don't overlap ([W3C, Understanding 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)).
- **Rec. checklist:**
  - Correct `lang`/`dir` on every page and `lang` on inline foreign-language snippets.
  - Text contrast at least 4.5:1. Check that the navy/blue brand colours on charcoal pass.
  - Visible focus rings that the sticky header and WhatsApp button never cover.
  - Help (WhatsApp, phone) in the **same place on every page** (3.2.6).
  - Form labels and errors in text, not colour only. Alt text in each language. No drag-only sliders.
  - Carousels have pause controls.

### 4.11 Locale-specific UX: Chinese (`/zh/`) and Turkish (`/tr/`)
**Chinese (Simplified):**
- **Blocked services:** mainland China blocks the whole Google suite (Search, Maps, YouTube, Gmail, Fonts APIs) and WhatsApp, Facebook and Instagram ([Wikipedia, websites blocked in mainland China](https://en.wikipedia.org/wiki/List_of_websites_blocked_in_mainland_China), [Hongkiat, Google Fonts in China](https://www.hongkiat.com/blog/google-fonts-china/)). Any third-party request to these from a `/zh/` page will hang or fail for visitors in China. **Rec.** for `/zh/` pages:
  - **No Google Maps iframe and no YouTube embeds.** Use a **static map image** and the address as text. An image exported from OpenStreetMap is free, with the attribution "© OpenStreetMap contributors" (ODbL) ([OSM copyright](https://www.openstreetmap.org/copyright)). Host videos as self-hosted MP4 or a poster image with a link out.
  - **No Google Fonts, Google Analytics, reCAPTCHA or Google Tag Manager.** Self-host every asset on the same domain. This is site-wide good practice anyway. Analytics should be Cloudflare Web Analytics (see `tech-stack.md`).
  - **No WhatsApp as primary CTA.** Use the RFQ form plus `mailto:` and a **WeChat ID with QR image**.
    - A normal (personal or work) WeChat account's QR code is free ([QR Code Generator, WeChat QR guide](https://www.qr-code-generator.com/blog/wechat-qr-code/)).
    - A WeChat **Official Account** is **[PAID]**: overseas entities pay about USD 99/year for verification, by international credit card ([AppInChina](https://appinchina.co/blog/how-to-open-a-wechat-official-account-step-by-step-guide/)). Skip it.
  - **Check that Turnstile and the form endpoint work from mainland China** before launch. Cloudflare's in-China delivery (China Network) is **[PAID]**: Enterprise-only, and it needs an ICP filing for each apex domain ([Cloudflare China Network](https://developers.cloudflare.com/china-network/)). On the free plan, mainland visitors are served from Cloudflare locations outside the mainland, so pages load more slowly. Keep `/zh/` pages very light and test them with a free online China speed test.
- **Typography and layout:**
  - Use a CJK system-font stack. Don't ship CJK webfonts (the strategy is in `tech-stack.md`).
  - Use no italics on Han text.
  - Body line-height around 1.7 (**Rec.**).
  - Han text is denser than English, so check that headings don't look sparse.
  - Keep model numbers in Latin.
- **Content:** Chinese investors' main questions are already covered on the foreign-manufacturers page (commissioning, spare parts, documentation, response time). Show **Chinese-brand experience prominently** if it's real. LS (Korean) and Wecon (Chinese HMI maker) are relevant here, and Wecon has opened local offices including in Egypt ([Plant Automation Technology, WECON](https://www.plantautomation-technology.com/suppliers/wecon-technology-coltd)).

**Turkish:**
- **Casing:** Turkish has two i's (`i/İ` and `ı/I`). `text-transform: uppercase` and JS case functions only produce correct results when the language is declared ([MDN, text-transform](https://developer.mozilla.org/en-US/docs/Web/CSS/text-transform)). **Rec.:**
  - Put `<html lang="tr">` on every `/tr/` page.
  - Use `toLocaleUpperCase('tr')` and `toLocaleLowerCase('tr')` in JS, never `toUpperCase()`.
  - Avoid all-caps CSS on buttons and labels, or test them ("İletişim", not "ILETIŞIM").
- **Fonts:** The Latin font subset must include **Latin Extended-A** (ç ğ ı İ ö ş ü). If you subset to basic Latin only, Turkish glyphs fall back to a system font mid-word (**Rec.**, see `tech-stack.md`).
- **Numbers:** Format with `Intl` `tr-TR` in running text (decimal comma, e.g. 1.234,5). Keep spec tables in a single consistent notation (**Rec.**).
- **Text expansion:** Turkish strings run longer than English. Leave room in buttons and nav. Test the header at 360 px width with the Turkish labels (**Rec.**).

---

## 5. Multilingual & local SEO

### 5.1 URL structure
- Google lists ccTLDs, subdomains, **subdirectories** (`example.com/de/`) and parameters. It does **not recommend** parameters, and subdirectories are "simple to establish and maintain" on one gTLD ([Google multi-regional](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)). **Decided:** subdirectories `/ar/ /en/ /zh/ /tr/` on `logic-controls.com`.
- **hreflang codes (decided):** `ar`, `en`, `tr`, and `zh-Hans` for Chinese. Google accepts ISO 639-1 language codes, an optional ISO 3166-1 region and an ISO 15924 script, and its docs use `zh-Hans` as the example ([Google hreflang](https://developers.google.com/search/docs/specialty/international/localized-versions)).
  - **Rec.:** use `zh-Hans` (Simplified script, any country), not `zh-CN`. The readers are Chinese investors anywhere, including in Egypt, not only users located in China.
  - Use the same values in `<html lang>`: `ar` (+`dir="rtl"`), `en`, `zh-Hans`, `tr`.
- **Don't auto-redirect between language versions.** Link to the other versions instead ([Google](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)). Google also notes that content changed dynamically by language settings may not all be crawled (same source).
- **Root `/` (decided: auto-detect, English fallback, `x-default` = `/`):** Google explicitly suggests `x-default` for "language/country selectors or auto-redirecting home pages" ([Google](https://developers.google.com/search/docs/specialty/international/localized-versions)). **Rec.** implementation:
  - **Detection:**
    - `/` returns a **302** (not 301, so it stays cacheable per visitor) to the best match from `Accept-Language`: `ar*`→`/ar/`, `zh*`→`/zh/`, `tr*`→`/tr/`, anything else→`/en/`.
    - Send `Vary: Accept-Language`.
    - An explicit choice in the language switcher sets a cookie that overrides detection.
    - Googlebot usually sends no `Accept-Language`, so it gets `/en/`, which is fine.
    - This can run as a tiny Worker on `/` only, or as a static `/index.html` with an inline `navigator.languages` redirect plus 4 visible language links as a no-JS fallback. Both are $0 (see `tech-stack.md` for free-plan limits).
  - **Only the home cluster uses `x-default` = `/`.** Inner pages have no root equivalent, so their `x-default` points to the `/en/` version of that page.
  - Never auto-redirect away from any `/{lang}/…` URL. The switcher keeps visitors on the equivalent page in the other language.

### 5.2 hreflang (in `<head>` of every page)
Each page lists **itself and all alternates**. Links must be **bidirectional**, or Google may ignore them. The methods are HTML `<link>`, HTTP `Link:` headers (for PDFs) or the XML sitemap ([Google](https://developers.google.com/search/docs/specialty/international/localized-versions)). Google does not use `hreflang` or `lang` to detect a page's language; it reads the visible content (same source). So the translation must be real.
```html
<!-- Home page (any locale): x-default = root auto-detect -->
<link rel="alternate" hreflang="ar"        href="https://logic-controls.com/ar/" />
<link rel="alternate" hreflang="en"        href="https://logic-controls.com/en/" />
<link rel="alternate" hreflang="zh-Hans"   href="https://logic-controls.com/zh/" />
<link rel="alternate" hreflang="tr"        href="https://logic-controls.com/tr/" />
<link rel="alternate" hreflang="x-default" href="https://logic-controls.com/" />

<!-- Inner page, e.g. on /ar/services/control-panels/ : x-default = English version -->
<link rel="alternate" hreflang="ar"        href="https://logic-controls.com/ar/services/control-panels/" />
<link rel="alternate" hreflang="en"        href="https://logic-controls.com/en/services/control-panels/" />
<link rel="alternate" hreflang="zh-Hans"   href="https://logic-controls.com/zh/services/control-panels/" />
<link rel="alternate" hreflang="tr"        href="https://logic-controls.com/tr/services/control-panels/" />
<link rel="alternate" hreflang="x-default" href="https://logic-controls.com/en/services/control-panels/" />
<link rel="canonical" href="https://logic-controls.com/ar/services/control-panels/" />  <!-- self-canonical per locale -->
```
- Keep the `<head>` `<link>` method even though the sitemap also carries hreflang. **Yandex** no longer reads language versions from sitemaps and wants `<link rel="alternate" hreflang>` in `<head>` ([Yandex Webmaster, localized pages](https://yandex.com/support/webmaster/en/yandex-indexing/locale-pages.html); direct fetch was blocked, so this is per the help-page text in search results). Yandex had 25.19% of search in Türkiye in Sep 2026 (§5.6).
- **Bing** weights the language declaration (`<html lang>` and the `content-language` meta/HTTP header) more than hreflang ([SER, Bing language meta tag](https://seroundtable.com/archives/020427.html), [WooRank](https://www.woorank.com/en/edu/seo-guides/best-practices-for-language-declaration)). **Rec.:** add `<meta http-equiv="content-language" content="ar|en|zh-Hans|tr">` per page. It's free and cheap insurance, because Bing had 21.76% of search in China in Sep 2026 (§5.6).
- Translate `<title>` and meta description per locale. Pulse's Arabic page still has an English `<title>` (§1.4).
- If a page exists in only some locales, emit hreflang only for the versions that exist, and don't point it at a fallback page in another language.

### 5.3 XML sitemap with hreflang
Use the `xhtml:link` alternates inside each `<url>`, with `xmlns:xhtml="http://www.w3.org/1999/xhtml"` declared and every variant, itself included, listed ([Google's sitemap example](https://developers.google.com/search/docs/specialty/international/localized-versions#sitemap)):
```xml
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>https://logic-controls.com/ar/services/control-panels/</loc>
    <xhtml:link rel="alternate" hreflang="ar"        href="https://logic-controls.com/ar/services/control-panels/"/>
    <xhtml:link rel="alternate" hreflang="en"        href="https://logic-controls.com/en/services/control-panels/"/>
    <xhtml:link rel="alternate" hreflang="zh-Hans"   href="https://logic-controls.com/zh/services/control-panels/"/>
    <xhtml:link rel="alternate" hreflang="tr"        href="https://logic-controls.com/tr/services/control-panels/"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="https://logic-controls.com/en/services/control-panels/"/>
  </url>
  <!-- repeat the <url> block for the /en/, /zh/ and /tr/ URLs with the same five alternates.
       Home cluster: same pattern but x-default → https://logic-controls.com/ -->
</urlset>
```
- List only the four locale URLs as `<loc>`. Don't list `/` as a `<loc>`, because it is a redirect; it appears only as the home cluster's `x-default` alternate.
- Submit the sitemap in **Google Search Console**, **Bing Webmaster Tools** and **Yandex Webmaster**. All three are free with no card (§6). Reference it in `robots.txt`. Generation with `@astrojs/sitemap` i18n is covered in `tech-stack.md`. Its `i18n.locales` map should use `{ ar: 'ar', en: 'en', zh: 'zh-Hans', tr: 'tr' }`.

### 5.4 Local SEO for Egypt
- **Google Business Profile (GBP):**
  - Local ranking is driven by **relevance, distance and prominence**. Prominence comes from links, mentions and directories, plus review count and score. Verification, complete and accurate info, review replies and photos all help, and you cannot pay for local rank ([Google, local ranking](https://support.google.com/business/answer/7091?hl=en)).
  - The name must be the real-world name, with no keywords ("Logic Controls", not "Logic Controls PLC Panels Cairo"). Choose the **most specific category** ("this business IS a…"). A service business that doesn't receive customers at its location should **hide its address** and set a service area of roughly 2 hours' drive or less. Virtual offices are ineligible ([GBP guidelines](https://support.google.com/business/answer/3038177?hl=en)).
  - **Rec.:** check category candidates in the GBP picker. The likely fit is something like "Industrial automation / Electrical engineer / Industrial equipment supplier", so verify which exists. Add photos of the workshop and panels, and ask every finished-project client for a Google review in Arabic or English.
- **NAP consistency (Rec.):** Use one canonical name, address and phone in EN and AR, identical across the website footer, Contact page, JSON-LD, GBP, Facebook page, LinkedIn, [Yellow Pages Egypt](https://yellowpages.com.eg/en/keyword/plc) and [automa.net](https://automa.net/business-directory/egypt/system-integrator). Most competitors are listed on these two directories (§1), and directories feed "prominence" ([Google](https://support.google.com/business/answer/7091?hl=en)).
- **Location content:** An "Areas we serve" block lists the industrial cities served (10th of Ramadan, 6th of October, Obour, Sadat, Borg El Arab, Sokhna…). Mention a city only if the client actually serves it, and don't create thin per-city doorway pages.

### 5.5 Structured data (JSON-LD)
- **Organization:** on the home and about pages, with `name`, `url`, `logo` (at least 112×112), `address`, `telephone`, `email`, `contactPoint`, `sameAs` and `description` ([Google, Organization](https://developers.google.com/search/docs/appearance/structured-data/organization), updated 2026-09-08).
- **LocalBusiness:** requires `name` and `address`. Recommended properties include `geo` (5+ decimals), `openingHoursSpecification`, `telephone` and `url`. Google says to "use the most specific LocalBusiness sub-type possible" ([Google, LocalBusiness](https://developers.google.com/search/docs/appearance/structured-data/local-business), updated 2026-09-08).
  - No subtype fits an automation integrator. The generic `ProfessionalService` subtype is deprecated on schema.org ([schema.org/ProfessionalService](https://schema.org/ProfessionalService)). **Rec.:** use plain `LocalBusiness` for the office or workshop, linked to the `Organization` by `@id`.
- **Service:** one per service page (`serviceType`, `provider` → org `@id`, `areaServed: EG`, `availableLanguage`). There is no Google rich result for it; it helps machine understanding.
- **BreadcrumbList:** on all inner pages.
- **FAQPage:** Google **stopped showing FAQ rich results for all sites on 7 May 2026** and removed the documentation on 15 Jun 2026 ([Search Central updates](https://developers.google.com/search/updates), [FAQ doc notice](https://developers.google.com/search/docs/appearance/structured-data/faqpage)). Since Aug–Sep 2023 they had already been limited to government and health sites. **Rec.:** keep visible FAQs on service pages because they help users and AI answers. The markup is optional and won't produce a rich result.
- **AI Overviews / AI Mode:** there are no special requirements or schema. Normal SEO applies, and structured data should match the visible text ([Google, AI features](https://developers.google.com/search/docs/appearance/ai-features)).
- **Translation quality:** Google's spam policy targets automated transformations, translation included, used to mass-produce low-value pages ([Google spam policies](https://developers.google.com/search/docs/essentials/spam-policies)). Use human-reviewed translations for every locale you publish.

Example (home page, `/en/`; localize `name`/`description` and `inLanguage` per locale):
```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://logic-controls.com/#org",
      "name": "Logic Controls",
      "alternateName": "لوجيك كنترولز",
      "url": "https://logic-controls.com/",
      "logo": "https://logic-controls.com/logo-512.png",
      "email": "info@logic-controls.com",
      "telephone": "+20-XX-XXXX-XXXX",
      "sameAs": ["https://www.facebook.com/<page>", "https://www.linkedin.com/company/<slug>"],
      "contactPoint": [{
        "@type": "ContactPoint", "contactType": "sales",
        "telephone": "+20-XX-XXXX-XXXX", "areaServed": "EG",
        "availableLanguage": ["ar", "en", "zh-Hans", "tr"]
      }]
    },
    {
      "@type": "LocalBusiness",
      "@id": "https://logic-controls.com/#workshop",
      "name": "Logic Controls",
      "parentOrganization": { "@id": "https://logic-controls.com/#org" },
      "address": { "@type": "PostalAddress", "streetAddress": "<street>", "addressLocality": "<city>",
                   "addressRegion": "<governorate>", "addressCountry": "EG" },
      "geo": { "@type": "GeoCoordinates", "latitude": 0.00000, "longitude": 0.00000 },
      "telephone": "+20-XX-XXXX-XXXX",
      "openingHoursSpecification": [{ "@type": "OpeningHoursSpecification",
        "dayOfWeek": ["Saturday","Sunday","Monday","Tuesday","Wednesday","Thursday"],
        "opens": "09:00", "closes": "17:00" }],
      "url": "https://logic-controls.com/en/contact/"
    }
  ]
}
```
(The hours, phone, address and coordinates above are placeholders to confirm with the client. Set `contactPoint.availableLanguage` to the languages the team can actually answer in, which may be only `ar` and `en` even though the site has four locales.)

### 5.6 Search engines per locale ($0 only)
| Locale / market | Search share, Sep 2026 ([StatCounter](https://gs.statcounter.com/)) | Action | Cost |
|---|---|---|---|
| Egypt (`/ar/`, `/en/`) | Google dominant | Google Search Console + Google Business Profile | Free |
| Türkiye (`/tr/`) | Google 73.42%, **Yandex 25.19%**, Bing 0.71% ([StatCounter TR](https://gs.statcounter.com/search-engine-market-share/all/turkey)) | GSC + **Yandex Webmaster** (verify via meta tag; relies on `<head>` hreflang) | Free |
| China (`/zh/`) | **Baidu 46.65%, Bing 21.76%**, Yandex 14.98%, Haosou 12.26%, Google 1.46% ([StatCounter CN](https://gs.statcounter.com/search-engine-market-share/all/china)) | **Bing Webmaster Tools** (can import from GSC) + `content-language` meta. **Skip Baidu Webmaster**: registration needs a mainland-China phone number, and overseas numbers have not been accepted since May 2022 ([Webnots](https://www.webnots.com/baidu-webmaster-tools-guide/), [Chinafy](https://chinafy.com/blog/how-to-set-up-your-baidu-webmaster-account-in-2024)). Baidu can still crawl the site unaided. Baidu gives hreflang little weight, so clear `/zh/` URLs and native Chinese titles matter more ([Chinafy, multilingual on Baidu](https://www.chinafy.com/blog/how-to-create-a-multilingual-website-that-ranks-on-baidu)) | Free (Baidu skipped: not cheap) |
| Chinese HQ staff searching from outside China | Google | Covered by GSC | Free |

---

## 6. $0 check: every tool or service named in this file
| Item | Status | Note |
|---|---|---|
| `wa.me` links, WhatsApp Business **app** | Free | No card ([Meta pricing](https://developers.facebook.com/docs/whatsapp/pricing/) applies only to the Platform) |
| WhatsApp Business **Platform / Cloud API**, chat widgets | **[PAID]** | Per-template-message billing since 1 Jul 2025. Not needed |
| WeChat personal/work account + QR | Free | |
| WeChat **Official Account** verification | **[PAID]** | About USD 99/yr by credit card ([AppInChina](https://appinchina.co/blog/how-to-open-a-wechat-official-account-step-by-step-guide/)). Skip |
| Cloudflare **China Network** (in-mainland delivery) | **[PAID]** | Enterprise-only add-on + ICP filing ([Cloudflare](https://developers.cloudflare.com/china-network/)). Accept slower mainland loads |
| Google Search Console, Bing Webmaster Tools, Yandex Webmaster | Free | No card |
| Baidu Webmaster | Free but needs a mainland phone number | Skip |
| Google Business Profile | Free | |
| Yellow Pages Egypt / automa.net basic listings | Free basic listing (paid upgrades exist, so skip those) | |
| Turnstile, Cloudflare Web Analytics, hosting/forms | Free tier | Limits in `tech-stack.md` |
| OpenStreetMap static map image | Free | Attribution required (ODbL) |
| Google Maps "Share → Embed" iframe (`/ar/`, `/en/`, `/tr/` only, optional) | Free, no API key | Heavier than a static image. Never on `/zh/` |
| Self-hosted fonts (OFL) | Free | See `tech-stack.md` |
| Page-speed / accessibility testing (PageSpeed Insights, Lighthouse, WAVE) | Free | |
| CSIA certification, IEC standard texts | **[PAID]** | Only referenced as benchmarks. Don't buy |
| Human translation / native review for zh & tr | **Labour cost, not a tool** | For $0: LLM draft + review by a native-speaking contact. Don't publish unreviewed machine output (Google's [spam policy](https://developers.google.com/search/docs/essentials/spam-policies) targets low-value automated translation at scale) |
| Paid stock photography | **[PAID]**, avoid | Use the client's own workshop and project photos |

---

## Sources (all accessed 2026-10-06)
**Competitors:**
- Egypt and MENA: [sinamix.com](https://www.sinamix.com/), [sinamix projects](https://www.sinamix.com/projects/), [miscegypt.com](https://www.miscegypt.com/), [MISC projects](https://www.miscegypt.com/projects/), [atcs-eg.com](https://atcs-eg.com/), [pulsebysolutions.com](https://pulsebysolutions.com/), [pulsebysolutions.com/ar](https://pulsebysolutions.com/ar/), [mechatronics-eg.com](https://www.mechatronics-eg.com/), [alqudwasys.com](https://alqudwasys.com/), [saselectrotech.com](https://saselectrotech.com/), [intechww.com](https://www.intechww.com/).
- Global: [vertech.com](https://www.vertech.com/), [etechgroup.com](https://www.etechgroup.com/), [grantek.com](https://www.grantek.com/), [interstates.com](https://www.interstates.com/), [pattiengineering.com](https://pattiengineering.com/), [brocksolutions.com](https://www.brocksolutions.com/), [avanceon.com](https://www.avanceon.com/), [vention.com](https://vention.com/).
- Profiles and directories: [Yellow Pages EG: Sinamix](https://yellowpages.com.eg/en/profile/sinamix-automation/693272), [Yellow Pages EG: ATCS](https://yellowpages.com.eg/en/profile/atcs-for-control-systems/533774), [automa.net EG integrators](https://automa.net/business-directory/egypt/system-integrator), [Craft: Giza Systems](https://craft.co/giza-systems), [ABB: INTECH](https://new.abb.com/news/detail/88014/abb-partners-with-intech-process-automation-in-uae-and-iraq), [CSIA certification](https://www.controlsys.org/certification).

**UX research:**
- Buyer behaviour and forms: [TREW 2025](https://www.trewmarketing.com/blog/2025-state-of-marketing-to-engineers-research), [TREW research archive](https://www.trewmarketing.com/resources/research-archives), [NN/g B2B usability](https://www.nngroup.com/articles/b2b-usability/), [Baymard form fields](https://baymard.com/blog/checkout-flow-average-form-fields), [Foundry CRO 2026](https://foundrycro.com/blog/form-conversion-rate-benchmarks-2026/), [Visionary Marketing 2026](https://visionary-marketing.co.uk/blog/form-completion-rate-statistics-2026).
- Egypt data and WhatsApp: [DataReportal Digital 2026 Egypt](https://datareportal.com/reports/digital-2026-egypt), [WhatsApp click to chat](https://faq.whatsapp.com/5913398998672934), [dotdigital wa.me](https://support.dotdigital.com/en/articles/11331301-click-to-chat-for-whatsapp).
- RTL, typography and digits: [W3C HTML dir](https://www.w3.org/International/questions/qa-html-dir), [W3C alreq](https://www.w3.org/TR/alreq/), [Material bidirectionality](https://m2.material.io/design/usability/bidirectionality.html), [MDN logical properties](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_logical_properties_and_values), [MDN letter-spacing](https://developer.mozilla.org/en-US/docs/Web/CSS/letter-spacing), [MDN numberingSystem](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale/numberingSystem), [Arabic optical size](https://alexstrick.com/personal/2017-03-12-why-are-arabic-fonts-so-small.html).
- Performance and accessibility: [web.dev Web Vitals](https://web.dev/articles/vitals), [WCAG 2.2 new](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/), [WCAG 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
- Standards and privacy: [IEC 61439-1](https://webstore.iec.ch/en/publication/32338), [IEC 60204 series](https://webstore.iec.ch/en/publication/1026), [Egypt PDPL regs (Al Tamimi)](https://www.tamimi.com/law_update_articles/from-policy-to-practice-egypt-issues-executive-regulations-of-the-personal-data-protection-law/), [CMS PDPL update](https://cms.law/en/are/legal-updates/egypt-s-pdpl-executive-regulations-issued-one-year-compliance-countdown-begins).

**SEO:**
- Google Search Central: [localized versions / hreflang](https://developers.google.com/search/docs/specialty/international/localized-versions), [multi-regional sites](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites), [URL structure](https://developers.google.com/search/docs/crawling-indexing/url-structure), [Organization](https://developers.google.com/search/docs/appearance/structured-data/organization), [LocalBusiness](https://developers.google.com/search/docs/appearance/structured-data/local-business), [FAQPage](https://developers.google.com/search/docs/appearance/structured-data/faqpage), [Search Central updates](https://developers.google.com/search/updates), [AI features](https://developers.google.com/search/docs/appearance/ai-features), [spam policies](https://developers.google.com/search/docs/essentials/spam-policies).
- Google Business Profile: [GBP guidelines](https://support.google.com/business/answer/3038177?hl=en), [GBP local ranking](https://support.google.com/business/answer/7091?hl=en).
- schema.org: [ProfessionalService](https://schema.org/ProfessionalService).

**Chinese and Turkish locales, and $0 checks:**
- Blocking and China delivery: [Wikipedia, websites blocked in mainland China](https://en.wikipedia.org/wiki/List_of_websites_blocked_in_mainland_China), [Hongkiat, Google Fonts in China](https://www.hongkiat.com/blog/google-fonts-china/), [Cloudflare China Network](https://developers.cloudflare.com/china-network/).
- WeChat: [AppInChina, WeChat Official Account](https://appinchina.co/blog/how-to-open-a-wechat-official-account-step-by-step-guide/), [WeChat QR guide](https://www.qr-code-generator.com/blog/wechat-qr-code/).
- WhatsApp pricing: [Meta WhatsApp pricing](https://developers.facebook.com/docs/whatsapp/pricing/).
- Turkish and maps: [MDN text-transform (Turkish i)](https://developer.mozilla.org/en-US/docs/Web/CSS/text-transform), [OSM copyright](https://www.openstreetmap.org/copyright), [WECON supplier profile](https://www.plantautomation-technology.com/suppliers/wecon-technology-coltd).
- Search share: [StatCounter Turkey](https://gs.statcounter.com/search-engine-market-share/all/turkey), [StatCounter China](https://gs.statcounter.com/search-engine-market-share/all/china).
- Yandex, Bing and Baidu: [Yandex localized pages](https://yandex.com/support/webmaster/en/yandex-indexing/locale-pages.html), [SER, Bing language meta](https://seroundtable.com/archives/020427.html), [WooRank language declaration](https://www.woorank.com/en/edu/seo-guides/best-practices-for-language-declaration), [Webnots, Baidu Webmaster](https://www.webnots.com/baidu-webmaster-tools-guide/), [Chinafy, Baidu account 2024](https://chinafy.com/blog/how-to-set-up-your-baidu-webmaster-account-in-2024), [Chinafy, multilingual on Baidu](https://www.chinafy.com/blog/how-to-create-a-multilingual-website-that-ranks-on-baidu).
