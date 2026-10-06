# Content guide (page-builder + transcreators)

English (`messages/en/`) is the single source of truth. `ar/`, `zh/`, `tr/` currently hold **verbatim English copies** of every namespace except `ui.json` (owned by the design agent). Translators replace them, keeping the same keys and array lengths (`node scripts/check-i18n.mjs` enforces this).

All strings are plain text: no HTML, no Markdown. Paragraphs are arrays. Render brand, model and protocol names exactly as written (LTR inside RTL, wrap in `<bdi>`).

## 1. Namespaces

| File | Used by | Top-level keys |
|---|---|---|
| `seo.json` | `<head>` defaults, JSON-LD | `siteName`, `defaultTitle`, `defaultDescription`, `organizationDescription`, `ogImageAlt` |
| `common.json` | every page | `labels`, `breadcrumbs`, `filters`, `stats`, `platforms`, `process`, `quoteChecklist`, `ctaBand.{default,service,industry,project,foreign}`, `whatsapp`, `zones`, `locations`, `company`, `notes` |
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

**Item shapes**

- `services.items[slug]`: `title`, `navTitle`, `summary` (cards), `seoTitle`, `seoDescription`, `h1`, `intro[]`, `capabilities[] {title,text}`, `deliverables[]`, `situations[]`, `faq[] {q,a}`, `cta {title,text}`
- `industries.items[slug]`: `title`, `navTitle`, `summary`, `seoTitle`, `seoDescription`, `h1`, `intro[]`, `needs[] {title,text}`, `applications[]`, `faq[] {q,a}`, `cta {title,text}`
- `projects.items[slug]`: `title` (H1), `cardTitle` (cards), `client` (anonymised), `summary`, `seoTitle`, `seoDescription`, `challenge`, `solution`, `scope[]`, `result`, `highlights[3]` ("At a glance" chips), `imageAlts{key}`, plus `videoTitle` **only** on projects with a video.

TypeScript note: `imageAlts` keys differ per project and `videoTitle` is not on every item. Read them with a guard, e.g. `(item.imageAlts as Record<string, string>)[img.key]` and `"videoTitle" in item ? item.videoTitle : undefined`.

## 2. Data files (`src/data/`)

| File | Exports |
|---|---|
| `site.ts` (existing) | NAP, phone, email, `whatsappLink(message)`, brands, counts |
| `services.ts` | `SERVICE_SLUGS` (display order), `SERVICES[] {slug, icon, industries, featuredProjects}`, `getService()` |
| `industries.ts` | `INDUSTRY_SLUGS`, `INDUSTRIES[] {slug, icon, services}`, `getIndustry()` |
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
1. Hero: `hero.eyebrow`, H1 `hero.title`, `hero.lead`, `hero.proof`, buttons `hero.ctaPrimary` → `contact/` and `hero.ctaSecondary` → WhatsApp `whatsapp.default`; stats strip from `STATS` + `common.stats`. Suggested hero image: `pasteurizer-cip-recipes/hmi.jpg` (alt `hero.imageAlt`), or the `/media/hero-filling.mp4` loop with its poster.
2. Platforms strip: `common.platforms` + `SITE.brands` (text or logos) → `technologies/`
3. Two doors: `audiences.local` → `services/`, `audiences.foreign` → `foreign-manufacturers/`
4. Services: `services.title/intro`, 8 cards from `services.json items[slug].{title,summary}` in `SERVICE_SLUGS` order
5. Featured projects: `projects.title/intro`, `featuredProjects()` (tablet coating, pasteurizer CIP, shampoo filling LS/Wecon) with `cardTitle`, `client`, `cover`
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

**Case study**: breadcrumb → H1 `title` → meta row (`labels.client` `client` · `labels.industry` · `labels.year` `year` · `labels.location` `common.locations.egypt`) → cover → `highlights` → `challenge` → `solution` → `scope` → tech chips (`technologies[]` from data, `labels.technologiesUsed`) → `result` → video (`videoTitle`) → gallery (`imageAlts`) → related projects (`relatedProjects`) → `ctaBand.project`. Footer notes: `common.notes.anonymised`, `common.notes.photos`; if `year < 2025` also `common.notes.preFounding`.
Projects index: `index.h1/intro` → filters (`common.filters`, by `industries` and `services`) → cards sorted by `projectsSorted()` → `notes.anonymised` + `notes.preFounding`.

**Foreign manufacturers**: hero (+ `chips`) → `needs` → `services` → `timeline` → `standards` → `proof` → `languages` → zones (`common.zones`) → `faq` → `ctaBand.foreign`. Suggested as the hero target for `/zh/` and `/tr/` visitors (link prominently from their home pages).

**Technologies**: H1 + `intro` → `brands` (`BRANDS` + `brands.items[slug].text`, product chips with `brands.productsLabel`) → `drives` → `scada` → `networks` → `signals` → `otherBrands` → `choosing` → `common.notes.brands` → `ctaBand.default`.

**About**: H1 + `lead` → `story` → `mission` → stats (`numbers.title` + `STATS`) → `values` → `why` → `common.process` → `location` → `cta`.

**Contact**
- Two-step form. Step 1 (required): `name`, `company`, `phone`, `need`. Step 2 (optional): `industry`, `location`, `timeline`, `message`, `email`, `contactPreference`. Then `consent` (required, unticked) + Turnstile (`form.security`).
- Suggested field names for `/api/rfq`: `name, company, phone, email, need, industry, location, timeline, message, contactPreference, consent, locale` (hidden) and `page` (hidden, referring path).
- Option values are the JSON keys (language-neutral). `location` options = `ZONES` (labels `common.zones.items[slug].name`) + `otherEgypt` + `outsideEgypt`. Preselect `need`/`industry` from `?service=` / `?industry=`.
- Consent line: `form.fields.consent.text` with `{link}` → `<a href="privacy/">{linkText}</a>`.
- Errors: `?error=invalid|verification|send|unknown` → `errors.title` + `errors[code]` (unknown codes → `errors.unknown`) + `errors.fallback` with phone, WhatsApp and email.
- Sidebar: `channels`, `form.whatsappHint` (`whatsapp.drawings`), `nextSteps`.
- Inputs: phone and email `dir="ltr"`; free text `dir="auto"`. Suggested `messageTooLong` max: 2000.
- Thanks page: `thanks.*` (noindex; excluded from the sitemap).

**Privacy**: render `sections[]` in order; skip empty `paragraphs`/`items`. Replace `{email}` with `SITE.email` and `{phone}` with `SITE.phone.display`. The notice promises that the `lang` cookie holds only the language code and lasts one year (`Max-Age=31536000`). Keep the cookie code in line with that.

## 5. Placeholders (never translate the braces)

`{service}`, `{industry}`, `{project}` (WhatsApp messages, use the page's `title`/`cardTitle`), `{count}` (filters), `{current}` / `{total}` (form steps), `{max}` (validation), `{link}` (consent), `{email}` / `{phone}` (privacy).

## 6. SEO

- `seo.title` / `seoTitle` values are complete titles (most already end in "| Logic Controls"). Do not append the site name again. Max 60 characters, descriptions max 155 (English).
- `seo.organizationDescription` → JSON-LD `Organization.description`. Use `SITE` for NAP. Add `alternateName: "لوجيك كنترولز"` only if the client approves the Arabic spelling.
- Keep FAQs visible on the page. FAQPage markup gives no rich result any more (optional).

## 7. Images and video

- `src/assets/projects/<slug>/`: chosen photos with clean names. Third-party logos and nameplates are already cropped out or blurred (tablet coater plates and SCADA logo, autoclave door plate, customer logos on the cheese-cooker and pipe-tester HMIs, product brand on the shampoo reel still, OEM nameplate on the printing reel still).
- Many HMI screenshots are about 800 px wide: use them at card or gallery size, not full-bleed.
- Videos already exist in `/public/media/` and are referenced from `projects.ts`. Check before launch: the shampoo video shows the product brand on some bottles, and the printing video may show the original machine builder's nameplate (see `video.note`). The laundry video is vertical (540×960).

## 8. Notes for transcreators

**Tone.** Short sentences, concrete nouns, no slogans. Write natively; do not translate word for word.
- Arabic (local buyers: owners, plant and maintenance managers, machine builders): direct, practical, Egyptian business register (Modern Standard Arabic, not dialect). Keep technical terms in Latin script as Egyptian engineers use them (PLC, HMI, SCADA, VFD, CIP, I/O). Use common local terms: لوحات تحكم، برمجة PLC، تطوير الماكينات، صيانة، انفرتر (VFD).
- Chinese (investors, plant managers, HQ engineers): formal and precise. Lead with commissioning, local support, spare parts and documentation. Use the official Chinese names of zones (e.g. 苏赫纳, 泰达). No italics.
- Turkish (investors and plant managers in 10th of Ramadan, Sadat, SCZONE): formal "siz" address, plain business Turkish. Use "Türkiye" and correct casing (İ/ı).

**Keep exactly as written** (all languages): PLC, HMI, SCADA, VFD, CIP, FDV, I/O, FAT, SAT, MCC, BOM, PID, RTD, OEM, MES, OEE, GMP, 21 CFR Part 11, Modbus RTU, Modbus TCP, PROFINET, RS-485, 4-20 mA, 0-10 V, ft·lb, psi, IEC 60204-1, IEC 61439, UL, CE, WinCC Professional, TIA Portal, S7-1200, S7-200 SMART, DVP, LX3V, M100, Altivar, C60N, all brand names (Siemens, Schneider Electric, Delta, LS Electric, Wecon, MCGS, VEICHI, MEAN WELL), and "Logic Controls". See `GLOSSARY.md` for preferred renderings.

**Numbers.** Western digits (0-9) in every locale, including Arabic. Keep "50+", "4+", "2025", "15-step", "380 V, 50 Hz" as is. Do not add numbers, percentages, results, certifications or client names that are not in the English.

**Claims that must not change.** "Platforms we program and integrate" (never "partner", "authorized", "certified dealer"). "Designed following IEC 60204-1 and IEC 61439 practice" (never "certified" or "compliant"). No 24/7 promise, no stock or warehouse, no UL/CE certification, no named clients. Chinese and Turkish documents are "on request".

**Length.** Aim for SEO titles of about 60 characters in Latin scripts and about 30 characters in Chinese; descriptions about 155 and 80 characters. Turkish runs longer: shorten wording rather than cut meaning. Button labels must stay short (2–4 words).

**Spelling (English).** US spelling throughout: labeling, synchronization, localization, authorized.
