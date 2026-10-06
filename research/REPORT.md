# Logic Controls website — research summary & recommendations (2026-10-06)

Constraints applied: **$0 forever** (domain is the only cost; paid items flagged ⚠), launch languages **AR · EN · ZH · TR**, root `/` auto-detects → EN fallback. Sources for every claim are in `tech-stack.md`, `market-and-audience.md`, `competitors-and-ux.md`.

## 1. Languages (ranked)
| # | Locale | URL / hreflang | Why |
|---|---|---|---|
| 1 | Arabic (RTL) | `/ar/` · `ar` | Local buyers; ~64% mobile, Google ~96% share; also Gulf investors |
| 2 | English | `/en/` · `en` | Indian/European/Korean/Japanese investors + Egyptian engineers; fallback |
| 3 | Chinese | `/zh/` · `zh-Hans` | #1 greenfield FDI source H1 2026 ($4.9bn of $12.4bn), ~half of SCZONE's $11.6bn; 2,500+ firms; low English proficiency |
| 4 | Turkish | `/tr/` · `tr` | ~1,700 firms / 200 factories concentrated in 10th of Ramadan, Sadat, SCZONE; ~$500m/yr new |

5th-language triggers: Italian if ≥2 Italian machine-builder partnerships or ≥5% traffic; Russian ~2028–29. German/Hindi not needed. **Market gap:** none of 8 Egyptian/MENA competitors reviewed has real ZH or TR pages; only one has real Arabic.

## 2. Sitemap (ASCII slugs under `/{lang}/`)
- `/` — tiny script: saved choice → browser language → `/en/`
- `/{lang}/` Home — dual-path entry: "Factories in Egypt" / "Setting up in Egypt?"
- `services/` → control-panels · plc-hmi-programming · machine-automation · scada-monitoring (only if delivered) · commissioning-support
- `industries/` → food-beverage · pharmaceutical · cosmetics-filling · packaging (textiles only if real projects)
- `projects/[slug]` — case studies, filterable by industry/service
- `foreign-manufacturers/` — investor landing page (also the ZH/TR home hero)
- `technologies/` — brands worked with, worded honestly
- `about/` — engineers, standards worked to, zones served
- `contact/` + `contact/thanks/` — RFQ form, WhatsApp (ZH: WeChat QR + email), static map, hours
- `privacy/` — needed for Egypt's PDPL 151/2020
- `insights/` — phase 2

Navigation: ≤5 items — Services · Industries · Projects · About · Contact — + sticky **Request a quote** + language switcher labelled in each own script (العربية / English / 中文 / Türkçe).

## 3. Key sections per page
- **Home:** hero H1 "PLC control panels & machine automation for factories in Egypt", proof line, CTAs **Request a quote** + **WhatsApp an engineer**; proof figures as static text; services; industries; 3 featured case studies; "Setting up in Egypt?" band; zones served; client logos (with permission).
- **Service / industry pages:** scope, related projects, brands, visible FAQ, CTA, "what we need from you to quote", typical lead times confirmed by client.
- **Case study:** industry · service · zone · year; three outcome figures; Challenge → Solution → Tech stack → Result; gallery; CTA. Anonymised allowed.
- **Foreign manufacturers:** local engineering team; commissioning of imported Chinese/Turkish lines (FAT/SAT, I/O checks, Arabic HMI translation); standards & documentation built to IEC 60204-1 / IEC 61439 practice (**never claim certifications not held**); spare parts & response by zone; bilingual handover docs (AR operators, EN/ZH/TR management); local content; setup FAQ.
- **Contact:** two-step RFQ — step 1 has 4 required fields (name, company, mobile/WhatsApp, need); step 2 optional. "Send drawings on WhatsApp", address, hours, privacy consent.

## 4. Stack (verified on npm + official docs)
- **Astro 7.3.5** (2026-06-22), fully static: built-in i18n routing (`prefixDefaultLocale: true`, all locales prefixed), content collections, `astro:assets`, built-in Fonts API (stable since Astro 6).
- `@astrojs/sitemap` 3.7.4 with i18n — does **not** emit x-default; add it in `<head>`.
- **Tailwind CSS 4.3.3** via `@tailwindcss/vite`; logical utilities only (`ms-/me-/ps-/pe-/inset-s-/text-start`), `rtl:` only for icon flips.
- Node 24 LTS (Astro needs ≥22.12). **Wrangler 4.147.0**. No Cloudflare adapter needed for a static site.
- Astro 7 gotchas: new compiler rejects unclosed/misnested HTML; `compressHTML` now strips whitespace between inline elements (can glue Arabic and Latin words).

## 5. Hosting & deploy ($0)
- **Workers with Static Assets, not Pages** (Pages docs: "Start new projects with Workers").
- Free: static asset requests free & unlimited; only `/` and `/api/rfq` run Worker code (100k/day); 20,000 files/version; 25 MiB/file; 3,000 build min/month.
- Deploy: `astro build && wrangler deploy` (or Workers Builds via Git). `logic-controls.com` as `custom_domain: true` route in `wrangler.jsonc`.
- **www → apex:** proxied placeholder `www` DNS record + one Single Redirect rule (Free: 10). `_redirects` can't redirect across hosts.
- Cloudflare Web Analytics, manual beacon in layout; count conversions via `/contact/thanks/` visits.

## 6. Contact form
- **Recommended:** form → Worker `/api/rfq` → Turnstile server-side validation (siteverify) → `send_email` binding → owner Gmail (must be a verified Email Routing destination). Free on all plans, no quota. Reply-To = customer.
- Optional: store each lead in Workers KV as a backup (free: 1,000 writes/day).
- ⚠ **Excluded:** auto-confirmation email to the customer — Cloudflare Email Service to arbitrary recipients is beta and Workers-Paid-only. Thank-you page + human reply covers it. If ever needed: Resend free tier (no card; 3,000/mo, 100/day).
- **info@logic-controls.com → Gmail:** free with Email Routing: verify destination → enable (adds MX/SPF) → rule for `info@` (optionally `sales@`).

## 7. API tokens
Account token (Workers deploy) + new zone token (DNS, Workers Routes, Email Routing Rules) cover deploy, custom domain, DNS, forward rule. Confirm Zone:Read and Email Routing **Edit**. Wrangler uses one token per run → the deploy token needs both account + zone perms. Possibly needed: Zone Settings Edit (enable Email Routing), Email Routing Addresses Edit (account-level; owner must click verification email), Single Redirect Edit (www rule). *(Lead note: the user-scoped token added later already passes all these checks.)*

## 8. Fonts (self-hosted, OFL)
- **EN + TR: Montserrat Variable** (`@fontsource-variable/montserrat`) — geometric with true italic; bold-italic headings echo the logo. ~38 KB latin subset.
- **AR: Alexandria Variable** (`@fontsource-variable/alexandria`) — designed as Montserrat's Arabic companion (Mohamed Gaber, Cairo). ~31 KB. Upright, no letter-spacing, body +10–15%, line-height ~1.7.
- Turkish ğ/ş/İ need latin-ext (+~70 KB, loads only when used; can subset). `<html lang="tr">` for correct i/İ casing.
- **ZH: no webfont** — system stack (PingFang SC, Microsoft YaHei, Noto Sans CJK SC, HarmonyOS Sans SC). Self-hosted Noto Sans SC = 101 files / ~4.4 MB. Montserrat still renders Latin/digits. No italics on CJK.
- Neutral alternative: IBM Plex Sans + IBM Plex Sans Arabic (no variable; ~43 KB/weight).

## 9. Top 10 UX / content decisions
1. Native copy per language; no Google Translate widget. ZH/TR AI-drafted + reviewed.
2. Locale-specific CTAs: AR = WhatsApp-first (pre-filled message with page context; FAB on left in RTL); EN/TR = form-first + WhatsApp; ZH = form + email + WeChat QR (WhatsApp/Google blocked in mainland China).
3. Zero Google dependencies on ZH pages (no Maps/YouTube/Fonts/reCAPTCHA); static OSM map image; self-hosted media; plain `mailto:` fallback.
4. Proof numbers as static text, identical everywhere (animated counters render "0" to crawlers).
5. Outcome-led case studies with real photos — no stock.
6. Honest trust claims: "We program and integrate LS & Wecon", not "partner", unless certified. No UL/CE/IEC certification claims unless true.
7. Industrial zones served, in all 4 languages; only zones actually served; no thin per-city pages.
8. Correct RTL: logical CSS, mirror layout & arrows (never the logo), isolate LTR model numbers/phones, Western digits, LTR inputs for phone/email.
9. Multilingual SEO: self-referencing hreflang in `<head>` + sitemap (Yandex ignores sitemap hreflang); x-default → `/` on home, EN on inner pages; never auto-redirect away from `/{lang}/`; `content-language` meta for Bing; JSON-LD Organization + LocalBusiness + Service + BreadcrumbList; keep FAQs visible (FAQ rich results ended 2026-05-07).
10. Performance/a11y: LCP ≤2.5 s, INP ≤200 ms, CLS ≤0.1 on mid-range Android/4G; JS only for form + language menu; WCAG 2.2 AA (24px targets). Free: Google Business Profile, Search Console, Bing Webmaster, Yandex Webmaster (skip Baidu — needs a CN phone).

## 10. Client inputs still needed
Verified numbers (years, projects, panels, response time); real project/workshop photos; 3–6 case studies + client-name/logo permission; WhatsApp, WeChat ID/QR; exact address & hours (consistent NAP); which standards they truly design to; which zones they serve; whether multilingual documentation is a real offer.

**Watch-out:** Egyptian phones set to English land on `/en/` under the EN fallback — make the "العربية" switch prominent in the header.
