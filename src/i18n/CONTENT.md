# Content guide (page-builder + transcreators)

English (`messages/en/`) is the single source of truth. `ar/`, `zh/`, `tr/` hold full native transcreations of every namespace (not word-for-word translations). Any change to English must be mirrored in all three, keeping the same keys and array lengths (`node scripts/check-i18n.mjs` enforces this).

All strings are plain text: no HTML, no Markdown, no entities, no bidi or soft-hyphen controls. Paragraphs are arrays. Write brand, model and protocol names exactly as written; the text engine (`src/lib/text.ts`) does the typography: it isolates Latin runs and phone numbers / digit groups in Arabic text (no LRI/PDI needed in the copy; `check-i18n` warns when it finds them), keeps codes and names on one line, breaks Chinese between words, and adds Turkish soft hyphens to headings only. Links inside copy use `{link:<site-path>|label}` (or `{link:ext:https://…|label}` for an allow-listed official host, `src/lib/link-policy.mjs`), with the same targets in every locale.

Page builders: headings, card titles, FAQ questions and tile / TOC labels go through `heading()`; body text (paragraphs, leads, answers, summaries, chips) through `html()`; attributes, `<title>` and breadcrumb labels through `plain()`; JSON-LD and `og:image:alt` through `cleanText()`. A component that renders a text prop with `set:html` uses `heading()` or `toHtml()`, which accept plain text or already rendered HTML. Never put a raw message string in `set:html` or in a text node: it skips the line-breaking and bidi rules.

## 1. Namespaces

| File | Used by | Top-level keys |
|---|---|---|
| `seo.json` | `<head>` defaults, JSON-LD | `siteName`, `defaultTitle`, `defaultDescription`, `organizationDescription`, `ogImageAlt` |
| `common.json` | every page | `labels`, `breadcrumbs`, `filters`, `stats`, `platforms`, `process`, `quoteChecklist`, `ctaBand.{default,service,industry,project,foreign}`, `teamStrip` (home + foreign pages → `about/`; no names or portraits: the founder asked not to be featured, October 2026), `whatsapp`, `zones`, `locations`, `company`, `notes` |
| `home.json` | `/{lang}/` | `seo`, `hero`, `audiences`, `services`, `projects`, `industries`, `why`, `foreignBand`, `faq` |
| `services.json` | `/services/`, `/services/{slug}/` | `index.{seo,h1,intro,engagement,faq}`, `items[slug]` |
| `industries.json` | `/industries/`, `/industries/{slug}/` | `index.{seo,h1,intro}`, `items[slug]` |
| `projects.json` | `/projects/`, `/projects/{slug}/` | `index.{seo,h1,intro}`, `items[slug]` |
| `foreign.json` | `/foreign-manufacturers/` | `seo`, `hero`, `needs`, `services`, `timeline`, `standards`, `proof`, `languages`, `faq` |
| `technologies.json` | `/technologies/` | `seo`, `h1`, `intro`, `brands`, `drives`, `scada`, `networks`, `signals`, `otherBrands`, `choosing` |
| `about.json` | `/about/` | `seo`, `h1`, `lead`, `story`, `mission`, `values`, `why`, `numbers`, `location`, `cta` |
| `contact.json` | `/contact/`, `/contact/thanks/` | `seo`, `h1`, `intro`, `form`, `validation`, `errors`, `channels`, `nextSteps`, `thanks` |
| `privacy.json` | `/privacy/` | `seo`, `h1`, `lastUpdated`, `intro`, `sections[] {title, paragraphs[], items[]}` |
| `ui.json` | header, footer, buttons | design agent's file. Button labels: `ui.cta.quote` / `ui.cta.whatsapp`. |
| `tech.json` | technology / product / protocol chips | `items{"<English string from projects.ts or technologies.ts>": "<localised chip>"}`. Brand and model names stay Latin; generic words are translated. Add a key whenever a new string appears in the data files. |

**Item shapes**

- `services.items[slug]`: `title`, `navTitle`, `summary` (cards), `seoTitle`, `seoDescription`, `h1`, `capabilitiesTitle` / `situationsTitle` (the H2s of those sections, naming the service: "What our control-panel work covers"; optional, the generic `common.labels.capabilities` / `situations` are the fallback), `intro[]`, `capabilities[] {title,text}`, `deliverables[]`, `situations[]`, `faq[] {q,a}`, `cta {title,text}`
- `industries.items[slug]`: `title`, `navTitle`, `summary`, `seoTitle`, `seoDescription`, `h1`, `needsTitle` / `applicationsTitle` (H2s naming the sector: "What food and dairy lines need from their controls"; optional, generic labels as fallback), `intro[]`, `needs[] {title,text}`, `applications[]`, `faq[] {q,a}`, `cta {title,text}`
- `projects.items[slug]`: `title` (H1), `cardTitle` (cards), `client` (anonymised), `summary`, `seoTitle`, `seoDescription`, `challenge`, `solution[]` (2–3 paragraphs; same count in every locale), `scope[]`, `result`, `highlights[3]` ("At a glance" chips), `facts[] {label, value}` ("Project facts" table, 5–6 rows, same row count in every locale), `imageAlts{key}`, optional `imageCaptions{key}` (a short visible caption under a gallery photo, ≤ 60 characters, for screens that are unreadable at thumbnail size: settings, recipes, program editor; only facts the item's copy already states), plus `videoTitle` and `videoDescription` **only** on projects with a video. `cardTitle` is also the link text of every in-content link to the case study, the last breadcrumb, the OG card headline and `Article.name`: near-duplicate pairs (the two shampoo fillers, pasteurizers, laundry washers) must differ in what the job was, not only in the PLC brand.
  - `facts` uses only what the copy and `projects.ts` already state: equipment, our scope, PLC, HMI/SCADA, drives, and a figure already in the copy (15 steps, 5 chemical inputs, 6-step recipes, 4 nozzles, 2 VFDs). Never add an I/O count, duration, percentage or result the client has not given. Labels are reused across projects (see `GLOSSARY.md` → Project facts labels).
  - `videoDescription`: a plain description of what the clip shows (text alternative for viewers who cannot see it). Describe only what is visible; no claims.
- `foreign.oem` {`eyebrow`, `title`, `intro`, `items[] {title,text}`, `cta`}: block for foreign machine builders (OEMs) who need a local commissioning and service team. CTA → `contact/?service=oem-partner` (need option `contact.form.fields.need.options.oem-partner`), WhatsApp `common.whatsapp.oem`. No partnership, agency or authorization wording.

TypeScript note: `imageAlts` keys differ per project and `videoTitle` is not on every item. Read them with a guard, e.g. `(item.imageAlts as Record<string, string>)[img.key]` and `"videoTitle" in item ? item.videoTitle : undefined`.

## 2. Data files (`src/data/`)

| File | Exports |
|---|---|
| `site.ts` (existing) | NAP, phone, email, `whatsappLink(message)`, brands, counts |
| `services.ts` | `SERVICE_SLUGS` (display order), `SERVICES[] {slug, icon, industries, featuredProjects}` |
| `industries.ts` | `INDUSTRY_SLUGS`, `INDUSTRIES[] {slug, icon, services}` |
| `projects.ts` | `PROJECT_SLUGS`, `PROJECTS[]`, `FEATURED_PROJECT_SLUGS`, `featuredProjects()`, `projectsSorted()`, `projectsByIndustry()`, `projectsByService()`, `relatedProjects()` |
| `zones.ts` | `ZONES[] {slug, region, sczone?, home?}` → names in `common.zones.items[slug]`, region labels in `common.zones.regions` |
| `technologies.ts` | `BRANDS[] {slug, name, products[]}` → text in `technologies.brands.items[slug].text`; `PROTOCOLS` |
| `stats.ts` | `STATS[] {key, value}` → label in `common.stats[key].label`. Values are static text (no count-up animation). |

Icons are suggested Lucide names; swap freely. `industries[0]` of a project is its primary industry (card tag, breadcrumb, filter default). `yearEvidence` and `video.note` are internal: never render them.

## 3. Routes and link targets

All routes are `/{lang}/<slug>/` with a trailing slash (use `localePath(locale, path)`).

| Page | Path | Main CTA targets |
|---|---|---|
| Home | `/` | `contact/`, WhatsApp, `foreign-manufacturers/`, `services/`, `projects/`, `industries/` |
| Services | `services/`, `services/{slug}/` | `contact/?service={slug}` (preselect `need`), WhatsApp `whatsapp.service` |
| Industries | `industries/`, `industries/{slug}/` | `contact/?industry={slug}`, WhatsApp `whatsapp.industry` |
| Projects | `projects/`, `projects/{slug}/` | `contact/`, WhatsApp `whatsapp.project` |
| Foreign manufacturers | `foreign-manufacturers/` | `contact/?service=new-factory`, WhatsApp `whatsapp.foreign`; `proof.cta` → `projects/anaerobic-waste-treatment-commissioning/` |
| Technologies | `technologies/` | `contact/` |
| About | `about/` | `contact/` |
| Contact | `contact/`, `contact/thanks/` | form → `/api/rfq` → `contact/thanks/` or `contact/?error=<code>` |
| Privacy | `privacy/` | linked from the consent line and the footer |

WhatsApp links: `whatsappLink(t.common.whatsapp.<key>)` after replacing placeholders. On `/zh/`, WhatsApp is blocked in mainland China: keep the form and `mailto:` as primary, WhatsApp as tertiary ("In Egypt?"). No WeChat ID exists yet.

## 4. Page section order

**Home** (`home.json` unless noted)
1. Hero: chip `hero.eyebrow` (`hero.eyebrowShort` at 1024–1279 px), H1 `hero.title`, `hero.lead`, buttons `hero.ctaPrimary` → `contact/#quote` and a second action (`hero.ctaSecondary` → WhatsApp `whatsapp.default`; on zh/tr the foreign-manufacturers door `audiences.foreign.cta`); proof strip: projects · case studies (`PROJECTS.length`, `common.stats.caseStudies`) · experience · industries. Media: the `/media/hero-filling-v3` loop (MP4 + AV1 WebM, desktop only) with its `-v4` poster, the LCP image (`src/components/hero-media.ts`).
2. Platforms strip: `common.platforms` + `SITE.brands` (text or logos) → `technologies/`
3. Two doors: `audiences.local` → `services/`, `audiences.foreign` → `foreign-manufacturers/`
4. Services: `services.title/intro`, 8 cards from `services.json items[slug].{title,summary}` in `SERVICE_SLUGS` order
5. Featured projects: `projects.title/intro`, `featuredProjects()` (tablet coating, beverage syrup jet mixing, shampoo filling LS/Wecon) with `cardTitle`, `client`, `cover`
6. Industries: `industries.title/intro`, 7 tiles (`industries.json items[slug].{title,summary}`)
7. Why us: `why.items`
8. How we work: `common.process`
9. Foreign band: `foreignBand` → `foreign-manufacturers/`
10. Zones: `common.zones` + `ZONES`
11. FAQ: `faq` (visible; FAQPage markup optional)
12. Final CTA: `common.ctaBand.default` + `common.quoteChecklist` + `whatsappHint`

**Service page**: breadcrumb → H1 `h1` + `intro` → `capabilities` (`labels.capabilities`) → `situations` (`labels.situations`) → `deliverables` (`labels.deliverables`) → related projects (`SERVICES[].featuredProjects`, then `projectsByService`; hide the block if empty, which is the case for `maintenance-support`) → related industries → `faq` → `cta` + `common.quoteChecklist`.
Services index: `index.h1/intro` → 8 cards → `index.engagement` → `common.process` → `index.faq` → `ctaBand.default`.

**Industry page**: H1 + `intro` → `needs` → `applications` → related projects (`projectsByIndustry`) → related services (`INDUSTRIES[].services`) → `faq` → `cta`. Index: `index.h1/intro` + 7 cards.

**Case study**: breadcrumb → H1 `title` → meta row (`labels.client` `client` · `labels.industry` · `labels.year` `year` · `labels.location` `common.locations.egypt`) → cover → `highlights` → `challenge` → `solution` → `scope` → tech chips (`technologies[]` from data, `labels.technologiesUsed`) → `result` (+ `facts` table in "At a glance") → video (`videoTitle`, described by `videoDescription`) → gallery (`imageAlts`) → related projects (`relatedProjects`) → `ctaBand.project`. Footer notes: `common.notes.anonymised`, `common.notes.photos`; for projects delivered before the company existed (data logic, `year < 2025`) also `common.notes.preFounding` ("Delivered by our engineers before the company was established."). The site shows **no founding year anywhere** (client decision 2026-10-06): never print the threshold year in copy.
Projects index: `index.h1/intro` → filters (`common.filters`, by `industries` and `services`) → cards sorted by `projectsSorted()` → `notes.anonymised` + `notes.preFounding`.

**Foreign manufacturers**: hero (+ `chips`) → `needs` → `services` → `timeline` → `standards` → `proof` → `languages` → `oem` (machine builders) → zones (`common.zones`) → `faq` → `ctaBand.foreign`. Suggested as the hero target for `/zh/` and `/tr/` visitors (link prominently from their home pages).

**Technologies**: H1 + `intro` → `brands` (`BRANDS` + `brands.items[slug].text`, product chips with `brands.productsLabel`) → `drives` → `scada` ("Software, SCADA and data": EPLAN Electric P8, WinCC, SQL/OEE) → `networks` → `signals` → `otherBrands` → `choosing` → `common.notes.brands` → `ctaBand.default`.

**About**: H1 + `lead` → `story` → `mission` → stats (`numbers.title` + `STATS`) → `values` → `why` → `common.process` → `location` → `cta`.

**Contact**
- Two-step form with JS (`RfqForm.astro`; without JS one long form). Step 1: `name`, `company`, `phone` (zh: `email` required, phone optional), "what do you need" (`service`, labels `form.fields.need`), preferred reply channel `reply` (WhatsApp / phone call / email; no WhatsApp on zh; Email makes the email required, the others the phone). Step 2 (optional): `message`, up to 3 attachments, `industry`, `location`, `timeline`, `country`, `email`. Then `consent` (required, unticked) + Turnstile (`form.security`).
- Field names, limits and validation: the contract in `src/lib/rfq-rules.ts` (shared by the form script and the Worker), plus hidden `locale`, `page` and the honeypot `lc_hp`.
- Option values are the JSON keys (language-neutral). `location` options = `ZONES` (labels `common.zones.items[slug].name`) + `otherEgypt` + `outsideEgypt`. Preselect from `?service=` / `?industry=` / `?location=` / `?timeline=`; `?project=` / `?intent=reference` start the description (`src/lib/context-params.ts`).
- Consent line: `form.fields.consent.text` with `{link}` → `<a href="privacy/">{linkText}</a>`.
- Errors: `?error=invalid|attachments|verification|send` (the Worker's codes) → `errors.title` + `errors[code]` (unknown codes → `errors.unknown`) + `errors.fallback` with phone, WhatsApp and email.
- Sidebar: `channels`, `form.whatsappHint` (`whatsapp.drawings`), `nextSteps`.
- Inputs: phone and email `dir="ltr"`; free text `dir="auto"`. `{max}` in `messageTooLong` comes from `RFQ_MAX.message` (2000).
- Thanks page: `thanks.*` (noindex; excluded from the sitemap).

**Privacy**: render `sections[]` in order; skip empty `paragraphs`/`items`. Replace `{email}` with `SITE.email` and `{phone}` with `SITE.phone.display`. The notice promises that the `lang` cookie holds only the language code and lasts one year (`Max-Age=31536000`). Keep the cookie code in line with that.

## 5. Placeholders (never translate the braces)

`{service}`, `{industry}`, `{project}` (WhatsApp messages, use the page's `title`/`cardTitle`), `{count}` (filters), `{current}` / `{total}` (form steps), `{max}` (validation), `{link}` (consent), `{email}` / `{phone}` (privacy), and others: a translation must keep exactly the placeholders of its English string (`check-i18n` fails otherwise). One allowed addition: the English twin of an English placeholder, `{serviceEn}` next to `{service}` (likewise `{industryEn}`, `{projectEn}`), used by the zh / tr WhatsApp messages for their English line; `pageContact()` in `src/components/contact-cta.ts` always passes both.

## 6. SEO

- Every page of a locale has its own `<title>` and meta description: `check-i18n` fails when two `seoTitle` / `seo.title` values render to the same title (after the suffix below) or two descriptions are equal. A case study must not repeat its industry page's title (they compete for the same query).
- Titles: `Seo.astro` appends " | Logic Controls" when the brand is not already in the string. So a `seoTitle` without the brand gets 17 characters added: keep that keyword part to about 43 characters in Latin scripts (about 22 CJK characters in Chinese). Rendered titles stay within about 600 px at 20 px Arial (roughly 60 characters). The only suffix is "| Logic Controls" (never "| Logic Controls Egypt" or "| Logic Controls Mısır"); "Egypt" goes in the keyword part.
- Lead with the service or machine and Egypt; the brand goes last. The home title and `seo.defaultTitle` follow this too ("Control Panels & PLC Automation in Egypt | Logic Controls"). `seo.siteName` stays "Logic Controls" (the JSON-LD site name).
- Descriptions: start with the machine or service, Egypt and the key feature within about 110 characters. Cap at about 145 characters in English and Turkish (no wider than about 920 px at 14 px Arial) and about 80 characters in Chinese. No label prefix such as "Case study:", "دراسة حالة:", "案例：" or "Proje:": the breadcrumb already says it.
- H1s say what the page is ("Automation projects and case studies in Egypt", not "Projects"). Nav labels and breadcrumbs stay short.
- Near-duplicate case studies (two pasteurizers, two laundry washers, two shampoo fillers) must keep different titles, H1s, descriptions and first sentences that name what differs (platform, scope, features). Arabic titles must differ before the pipe, not only after it.
- Arabic titles and H1s use the terms Egyptian buyers search for where they read naturally: لوحات كنترول، برمجة PLC، أوتوميشن، سكادا، صيانة (see `GLOSSARY.md`). Once per title or H1, never stuffed.
- `seo.organizationDescription` → JSON-LD `Organization.description`. The company node (`#organization`) uses the English values on every page (search engines merge nodes by `@id` and keep one value); localised text belongs on the page nodes. Use `SITE` for NAP. Add `alternateName: "لوجيك كنترولز"` only if the client approves the Arabic spelling.
- `foreign.seo.serviceName` / `serviceType`: the JSON-LD Service of the foreign-manufacturers page (what is offered, not the H1 slogan; no partner wording).
- Keep FAQs visible on the page. FAQPage markup gives no rich result any more (optional).
- Page dates (sitemap `<lastmod>`, case-study `datePublished` / `dateModified`) come from `src/data/content-dates.json`: each page is dated by a hash of its OWN copy subtree, data record and project photos (the `scripts/content-dates.mjs` header lists what counts; a photo rename counts too). After any copy, data or photo change run `node scripts/content-dates.mjs --write` and commit the JSON in the same commit; `--check` lists stale pages (`npm run deploy` refuses to deploy while any are stale); `--bootstrap` rebuilds the file from git history. A forgotten refresh dates the changed pages at build time (with a warning), so a change is never understated. Templates, nav, `ui.json`, `seo.json` and common.json chrome (labels, breadcrumbs, CTA bands, notes) do not re-date pages; the common.json body blocks a page shows (stats, zones, process, teamStrip, quoteChecklist on contact) and the SITE figures behind the stats do. After deploying content changes, run `npm run indexnow` (it submits only the re-dated URLs) and commit `scripts/indexnow-state.json`.

## 7. Images and video

- `src/assets/projects/<slug>/`: chosen photos with clean names. Third-party logos and nameplates are already cropped out or blurred (tablet coater plates and SCADA logo, autoclave door plate, customer logos on the cheese-cooker and pipe-tester HMIs, product brand on the shampoo reel still, OEM nameplate on the printing reel still).
- Many HMI screenshots are about 800 px wide: use them at card or gallery size, not full-bleed.
- Case-study videos are the `-v3` files in `/public/media/` (each with a 480p variant and `-v3` WebP posters), referenced from `projects.ts`: shampoo filling, bottle printing, hotel laundry. The product brand on the shampoo bottles and the machine builder's nameplate on the printing machine are blurred in them. The laundry video is vertical (540×960). Every clip has its audio track stripped, so there is nothing to caption; each has a `videoDescription` text alternative. The home hero loop is `hero-filling-v3` (MP4 + WebM) with a `-v4` poster set (`src/components/hero-media.ts`).
- `/media/*` is cached as immutable: a changed file gets a new `-vN` name, never the old one (`tests/static/check-budgets.mjs` fails on a media file name without a version).

## 8. Notes for transcreators

**Tone.** Short sentences, concrete nouns, no slogans. Write natively; do not translate word for word.
- Arabic (local buyers: owners, plant and maintenance managers, machine builders): direct, practical, Egyptian business register (Modern Standard Arabic, not dialect). Keep technical terms in Latin script as Egyptian engineers use them (PLC, HMI, SCADA, VFD, CIP, I/O). Use common local terms: لوحات تحكم، برمجة PLC، تطوير الماكينات، صيانة، انفرتر (VFD).
- Chinese (investors, plant managers, HQ engineers): formal and precise. Lead with commissioning, local support, spare parts and documentation. Use the official Chinese names of zones (e.g. 苏赫纳, 泰达). No italics.
- Turkish (investors and plant managers in 10th of Ramadan, Sadat, SCZONE): formal "siz" address, plain business Turkish. Use "Türkiye" and correct casing (İ/ı).

**Keep exactly as written** (all languages): PLC, HMI, SCADA, VFD, CIP, FDV, I/O, FAT, SAT, MCC, BOM, PID, RTD, OEM, MES, OEE, GMP, 21 CFR Part 11, Modbus RTU, Modbus TCP, PROFINET, RS-485, 4-20 mA, 0-10 V, ft·lb, psi, IEC 60204-1, IEC 61439, UL, CE, WinCC Professional, TIA Portal, S7-1200, S7-200 SMART, SIMATIC HMI, DVP, LX3V, M100, Altivar, C60N, EPLAN Electric P8, SQL, ISA-88, EMS, BMS, HTST (explain on first use: high-temperature, short-time), all brand names (Siemens, Schneider Electric, Delta, LS Electric, Wecon, MCGS, VEICHI, MEAN WELL, Yaskawa), and "Logic Controls". See `GLOSSARY.md` for preferred renderings.

**Numbers.** Western digits (0-9) in every locale, including Arabic. Keep "50+", "4+", "15-step", "380 V, 50 Hz" as is. No founding year in any locale. Do not add numbers, percentages, results, certifications or client names that are not in the English.

**Claims that must not change.** "Platforms we program and integrate" (never "partner", "authorized", "certified dealer"). "Designed following IEC 60204-1 and IEC 61439 practice" (never "certified" or "compliant"). No 24/7 promise, no stock or warehouse, no UL/CE certification, no named clients. Chinese and Turkish documents are "on request". Batch control is "structured following ISA-88 principles" (never "ISA-88 certified/compliant"). The founder is not featured on the site at all (his request, October 2026). Past employers are never named ("a multinational pharmaceutical plant in Cairo", "an Egyptian manufacturer of engineering training equipment", "a machine-automation company"). Sub-sectors from LinkedIn (chocolate/bakery, oil and liquid-egg fillers, ultrafiltration, wax filling, ampoules, EMS/BMS, purified water, drainage/feed-mill SCADA, cut-to-length, grinding, decal printing) are "our engineers' experience", not Logic Controls case studies.

**Length.** Aim for SEO titles of about 60 characters in Latin scripts and about 30 characters in Chinese (rendered, with the brand); descriptions about 145 and 80 characters (see section 6). Turkish runs longer: shorten wording rather than cut meaning. Button labels must stay short (2–4 words). Keep sentences under about 30 words: split long lists into two sentences or into `scope[]` bullets.

**Answers and results.** FAQ answers open with the answer, then name what it depends on. Never open with "It depends". Prices, durations and response times are given only when the client has confirmed them. Case-study results say what the machine or operators can now do ("Operators run, clean and adjust the pasteurizer from one HMI"), not "helped improve efficiency". Vary the first sentence of `solution[0]`: lead with what the machine now does, not with the PLC brand, which the hero, chips and facts already show.

**Arabic no-break spaces.** Use U+00A0 only after a free-standing "و" or after "الـ" when the next word is Latin ("PLC و\u00a0HMI", "الـ\u00a0PLC"), so the conjunction never ends a line. Never put U+00A0 before "و", "مع" or a "و"-prefixed word ("S7-1200\u00a0و" or "M100\u00a0ومصدر" fuse two codes into one unbreakable run that overflows phones). Compound names that must not break use U+00A0 inside the name: "أبو\u00a0الصفا".

**Spelling (English).** US spelling throughout: labeling, synchronization, localization, authorized.
