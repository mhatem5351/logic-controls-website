# Logic Controls website

Multilingual marketing and lead site for **Logic Controls**, an industrial automation company in 6th of October City
(Giza, Egypt): PLC / HMI / SCADA programming, control panels, machine automation, retrofits, commissioning.
Live at **https://logic-controls.com**.

Two audiences: local factories (Arabic first) and foreign manufacturers setting up plants in Egypt (English, Chinese,
Turkish). Every page exists in **4 locales**: `en`, `ar` (RTL), `zh` (Simplified Chinese, `zh-Hans`), `tr`.
The site is a static build with a tiny Worker in front. Hosting is on Cloudflare's free tier: the domain is the
only paid item, so never turn on a paid Cloudflare or third-party feature.

## Stack

| Layer | What |
|---|---|
| Site | [Astro 7](https://astro.build) static output (`build.format: "directory"`, trailing slashes), TypeScript strict, no UI framework: small vanilla-JS islands |
| Styling | Tailwind CSS 4 (Vite plugin), design tokens in `src/styles/global.css`, motion in `src/styles/motion.css` |
| Images / fonts | `astro:assets` + sharp (AVIF / WebP / JPEG), self-hosted Montserrat + Alexandria (fontsource), a 5 KB Turkish subset |
| Hosting | Cloudflare Workers static assets (`wrangler.jsonc`), custom domain, `public/_headers` (CSP, caching) and `public/_redirects` |
| Worker | `worker/index.ts`: `/` redirects to the visitor's language (cookie, then `Accept-Language`); `/api/rfq` takes the quote form (honeypot, then Turnstile, then `send_email` to the owner's inbox). Every other path is a free static-asset hit (`run_worker_first: ["/", "/api/*"]`) |
| Forms / anti-spam | Cloudflare Turnstile + Email Routing `send_email` binding |
| Analytics | Cloudflare Web Analytics (beacon loads on the production hostname only) |
| Tests | Vitest 5 (unit), Playwright Test 1.63 (E2E, chromium + webkit), axe-core, html-validate, custom static checks, GitHub Actions |

## Structure

```
src/
  pages/[lang]/…          every route, once per locale (getStaticPaths); 404.astro; index.astro (dev-only root)
  layouts/BaseLayout.astro  <html lang dir>, SEO head (canonical, hreflang, OG, JSON-LD), header, footer
  components/             UI; sections/{main,catalog}/; motion/ (live HMI demo); illustrations/ (animated SVG)
  scripts/                client scripts (HMI simulation, zones map, play-when-visible)
  data/                   language-neutral facts: projects, services, industries, zones, technologies, stats, site
  i18n/                   config, getMessages(); messages/<locale>/<namespace>.json; CONTENT.md; GLOSSARY.md
  lib/text.ts             plain text → safe HTML with each locale's line-breaking and bidi rules
  assets/                 images processed at build (projects, brand, people, fonts)
public/                   copied as is: _headers, _redirects, media/ (videos + posters), icons, robots.txt
worker/index.ts           the Worker ("/" and /api/rfq)
scripts/                  check-i18n.mjs (runs before every build), indexnow.mjs, screenshot.mjs
tests/
  unit/                   Vitest: text.ts, check-i18n.mjs, data integrity, Worker
  e2e/                    Playwright specs + fixtures (global-setup checks prerequisites)
  static/                 check-dist.mjs (link crawl, leaks, secrets), check-budgets.mjs + budgets.json
docs/followups.md         open client questions and content follow-ups
research/                 market, competitor and tech-stack research behind the site's decisions
```

Internal pages (`/[lang]/styleguide/`, `/[lang]/lab/*`) only exist in `astro dev`; production builds skip them.

## i18n model

- URLs are `/{lang}/<ascii-slug>/` in every locale. `/` has no page: the Worker sends a 302 to the right language,
  checking the `lang` cookie first (set by the language switcher), then `Accept-Language` (q-values; `zh-TW` → `zh`),
  then English. `hreflang` alternates for the 4 locales plus `x-default` are on every page and in the sitemap.
- Copy lives in `src/i18n/messages/<locale>/<namespace>.json`. **English is the source of truth.** Every other locale
  must have exactly the same keys and array lengths, with no empty strings or `TODO`s, and only Latin letters that the
  shipped Montserrat subsets contain. `scripts/check-i18n.mjs` enforces all of this and fails the build.
- Strings are plain text. Render them through `html()` / `plain()` from `src/lib/text.ts`, which escapes and applies
  the per-locale rules: codes such as `S7-1200` or `IEC 60204-1` never wrap; Latin runs in Arabic text sit in
  `<bdi dir="ltr">` (a parenthesised gloss keeps its brackets inside); Chinese breaks only between words, and a number
  stays with its measure word; ` · ` separators stick to the item before them.
- Language-neutral facts (slugs, years, technologies, zones) live in `src/data/`. Translations reference them by slug.
- Writing and translation rules: `src/i18n/CONTENT.md`. Terminology: `src/i18n/GLOSSARY.md`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Astro dev server (`http://localhost:4321`). Astro 7 allows only one dev server per project, so share it |
| `npm run build` | `check-i18n` + `astro build` into `dist/` |
| `npm run preview` | build, then `wrangler dev` on `http://127.0.0.1:8787`: the production setup (Worker, headers, redirects, 404, form) |
| `npm run check` | `astro check` + i18n check |
| `npm run qa:html` | html-validate over `dist/**/*.html` |
| `npm test` | unit + static checks (needs a build) |
| `npm run test:unit` | Vitest: `tests/unit/**` |
| `npm run test:static` | i18n check, `astro check`, html-validate, `tests/static/check-dist.mjs` |
| `npm run test:budget` | performance budgets over `dist/` (`-- --update` re-baselines) |
| `npm run test:e2e` | Playwright against `wrangler dev` on port 8788 (needs a build and `.dev.vars`) |
| `npm run test:visual` | optional screenshot comparison (`@visual`, local only) |
| `npm run test:all` | build, then everything above except visual |
| `npm run deploy` | build + `wrangler deploy` |
| `npm run indexnow` | submit every sitemap URL to IndexNow (Bing, Yandex…) after a content deploy |

## Local development

```sh
nvm use 24            # .node-version; package.json requires >= 22.12
npm ci
npm run dev           # pages, styles, components (Worker routes do not run here: "/" is a meta refresh)
npm run preview       # production-like: Worker + _headers + _redirects + /api/rfq with Turnstile test keys
```

`.dev.vars` (git-ignored) feeds `wrangler dev`. It must hold Cloudflare's **public** always-pass Turnstile test
secret, never the production secret:

```
TURNSTILE_SECRET=1x0000000000000000000000000000000AA
ALLOWED_HOSTNAMES=logic-controls.com,www.logic-controls.com,example.com,localhost,127.0.0.1
```

`astro dev` renders the Turnstile test site key. A production build ships the real site key, which only works on
logic-controls.com; the E2E fixtures swap in the test key. Form emails sent through `wrangler dev` are written to
`.wrangler/tmp/email/**/email-{text,html}/` instead of being delivered.

## Testing

| Suite | Runner | Covers |
|---|---|---|
| Unit (`tests/unit`) | Vitest | `text.ts`: escaping of hostile input in every locale, atoms, Arabic isolates, Chinese breaking, plus invariants checked over every message string. `check-i18n.mjs`: fixture trees for every failure mode. `src/data`: cross-references, images, alts, videos, featured = 3, zones. Worker: locale negotiation and `/api/rfq` (honeypot, 422, 403, 303 / JSON, escaping, message fallback, 405, 502) |
| Static (`tests/static/check-dist.mjs`) | node | every internal link, asset, `#anchor` and ARIA idref in `dist/` resolves; trailing slashes; no mixed-locale links; contact preselection values exist; tel / mailto / wa.me formats; sitemap ↔ pages; no `/lab/` or `/styleguide/`; no `client-data` or raw Facebook / Telegram / screenshot file names; no tokens (`cfut_`, `cfat_`, `ghp_`…), no `TURNSTILE_SECRET`, and no value from a local `.env` |
| Budgets (`tests/static/check-budgets.mjs`) | node | gzip HTML / CSS / JS and image bytes per page type, largest CSS / JS / font / image / video file, against `budgets.json` (measured values + 10 %) |
| E2E (`tests/e2e`) | Playwright | full-sitemap smoke (status, `lang` / `dir`, one `h1`, title width, description, canonical, 5 hreflang, no console errors); redirects (`/` by language and cookie, every `_redirects` rule, 404, headers); language switcher; header, drawer, skip link; quote form (localized validation, 2 steps, Turnstile, email written and escaped, preselection, error panel, no-JS POST, honeypot); HMI demo; zones map; project filters; gallery; FAQ; axe (WCAG 2.2 AA, every page type × locale, open UI states); reduced motion |

Projects: `chromium-desktop` (1440×900), `chromium-mobile` (Pixel 7), `webkit-mobile` (iPhone 15). Viewport-independent
checks are tagged `@desktop-only` and run once. The web server is
`wrangler dev --port 8788 --local-protocol https` (self-signed certificate), so it never collides with `npm run preview`
on 8787 and the production CSP behaves as on the live site. Reports go to `playwright-report/`, traces to `test-results/`.

Known issues are kept as tests marked `it.fails` (Vitest) or `test.fixme` (Playwright) with a note. They start failing
loudly once the issue is fixed, so flip them then.

Visual tests: record a baseline on a commit you trust with `npm run test:visual -- --update-snapshots`, then run
`npm run test:visual` after a change. Baselines depend on the OS and fonts, so they stay on your machine
(`tests/e2e/__screenshots__/` is git-ignored).

### CI

`.github/workflows/ci.yml` runs on pushes to `main`, on pull requests and on manual dispatch. It skips docs-only
changes and cancels a run when a newer push supersedes it. One job on `ubuntu-24.04` with Node 24 runs `npm ci`,
`npm run build` (Astro's image cache is restored first), `npm test`, `npm run test:budget`, installs the Playwright
browsers (cached), writes `.dev.vars` with the public test secret, then runs `npm run test:e2e` with 2 workers and 1
retry. The Playwright report is uploaded only on failure. There is no deploy step and no Cloudflare secret in CI. A
cached run takes about 8–10 minutes, well inside the 2,000 free minutes a month GitHub Free gives private repos.

## Deploy

```sh
set -a; source .env; set +a        # CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID for wrangler
npm run deploy                     # build + wrangler deploy (Worker + static assets, custom domain)
npm run indexnow                   # after content changes
```

The production Turnstile secret is a Worker secret (`npx wrangler secret put TURNSTILE_SECRET`). Plain vars
(`OWNER_EMAIL`, `MAIL_FROM`, `ALLOWED_HOSTNAMES`) and the `send_email` destination live in `wrangler.jsonc`. The
destination must be a verified Email Routing address. A Cloudflare redirect rule sends `www` to the apex domain.

## Environment

`.env` (git-ignored, chmod 600). Key names only, never commit or print the values:

| Key | Used for |
|---|---|
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | wrangler deploy / Cloudflare API |
| `CLOUDFLARE_ACCOUNT_TOKEN_OLD` | legacy account token (no zone permissions) |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET` | Turnstile widget (the site key is public and also in `src/data/site.ts`) |
| `CF_WEB_ANALYTICS_TOKEN`, `CF_WEB_ANALYTICS_SITE_TAG` | Web Analytics (the beacon token is public) |
| `INDEXNOW_KEY` | `npm run indexnow` (the key file is `public/<key>.txt`) |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_S3_ENDPOINT` | R2 credentials (R2 is not used by the site) |
| `GITHUB_TOKEN_PERSONAL` | pushing to the private GitHub repo |

`.dev.vars` holds `TURNSTILE_SECRET` (the test secret) and `ALLOWED_HOSTNAMES` for `wrangler dev` (see above).
`tests/static/check-dist.mjs` fails the build check if any `.env` secret value shows up in `dist/`.

## Content rules (honesty)

The site makes only claims the client can back up. In short (the full rules are in `src/i18n/CONTENT.md`):

- Brands are "platforms we program and integrate", **never** "partner", "authorized" or "certified". Panels are
  "designed following IEC 60204-1 / IEC 61439 practice", never "certified" or "compliant". Batch control is "structured
  following ISA-88 principles". No UL / CE certification, no 24/7 promise, no stock or warehouse.
- **No named clients**: case studies are anonymised. Third-party logos and nameplates are cropped or blurred in photos
  and videos. Never glob `client-data/` from `src/`, because the raw photos contain them.
- Numbers come from the client (50+ projects, 4+ years). Never add figures, percentages, results or client names that
  are not in the English source. Use Western digits in every locale, including Arabic. Show **no founding year**
  anywhere. Projects delivered before the company existed say "delivered by our engineers before the company was
  established".
- The founder's past employers are described, never named. Sub-sectors from the team's past jobs are "our engineers'
  experience", not Logic Controls case studies.
- The zones list is a coverage statement ("we work across…"), not a list of past project sites. Map distances are
  labelled straight-line.
- Chinese and Turkish documentation is "on request". On `zh` pages, email replaces WhatsApp as the main channel,
  because WhatsApp is blocked in mainland China.

## Where the docs live

- `src/i18n/CONTENT.md`: content model, page section order, placeholders, translation and claim rules
- `src/i18n/GLOSSARY.md`: EN → AR / ZH / TR terminology
- `src/components/illustrations/STYLE.md`: the animated illustration system
- `docs/followups.md`: open client questions and content follow-ups
- `research/`: market, audience, competitor and tech-stack research (`REPORT.md` is the summary)
- Header comments in `worker/index.ts`, `src/lib/text.ts`, `astro.config.mjs`, `wrangler.jsonc`, `public/_headers`,
  and in each test file
