# Tech Stack — Logic Controls website (logic-controls.com)

Research date: 2026-10-06. Versions checked on the npm registry (`npm view <pkg> version`) on that date. Behaviour checked against the official docs linked in each section.

**Project constraints (decided by the lead):**
1. **$0 forever.** The domain is the only paid item. Everything below uses **Cloudflare Free / Workers Free** features or third-party free tiers that need **no credit card**. Anything that needs a paid plan is marked **⚠ PAID** and is *not* part of the recommended build. Full audit in §9.
2. **Launch locales: Arabic (`ar`), English (`en`), Chinese Simplified (`zh` → hreflang/lang `zh-Hans`), Turkish (`tr`).** The root URL `/` auto-detects the browser language and falls back to **English**.

---

## 0. TL;DR (pinned versions)

| Piece | Version (2026-10-06) | Why |
|---|---|---|
| **Astro** | `astro@7.3.5` (major 7, released 2026-06-22) | Static-first, built-in i18n routing, Fonts API, content collections, image optimisation |
| **@astrojs/sitemap** | `3.7.4` | i18n-aware sitemap with `xhtml:link hreflang` |
| **Tailwind CSS** | `tailwindcss@4.3.3` + `@tailwindcss/vite@4.3.3` | Official Astro integration is the Vite plugin |
| **Wrangler** | `wrangler@4.147.0` (major 4) | Deploys Workers with Static Assets |
| **@astrojs/cloudflare** | `14.3.3` (peer: `astro ^7.2.0`, `wrangler ^4.125.0`) | **Not needed** for a static site. Only add it if pages move to on-demand rendering |
| **Node.js** | 24 LTS (Astro needs `>=22.12.0`, and odd-numbered versions are not supported) | Workers Builds image defaults to Node 24.18.0 |
| **Hosting** | **Cloudflare Workers + Static Assets** (not Pages) | Cloudflare's own docs now say to start new projects on Workers |
| **Form** | Tiny Worker route `/api/rfq` → Turnstile siteverify → `send_email` binding to the owner's **verified** address | Free on every plan, with no third-party dependency or card |
| **Fonts** | Montserrat Variable (Latin: en and tr) + Alexandria Variable (Arabic, Montserrat's official companion) + **system CJK stack for zh** (zero font files). Alternative: IBM Plex Sans + IBM Plex Sans Arabic | Matches the bold-italic geometric logo. About 20 self-hosted font files in total, a tiny share of the 20,000-file limit |
| **Locales** | `/ar/` `/en/` `/zh/` `/tr/`, all prefixed. `/` is handled by the Worker: `lang` cookie, then `Accept-Language`, then `/en/` | x-default = `/` |

Sources: npm registry; [Astro 7 release post](https://astro.build/blog/astro-7/); [Astro install docs (Node requirement)](https://docs.astro.build/en/install-and-setup/); [Workers Builds build image](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/).

---

## 1. Astro

### 1.1 Current stable major and breaking changes
- **Astro 7** was released on **June 22, 2026**. Its focus is speed: a Rust `.astro` compiler, the Rust-based **Sätteri** Markdown/MDX processor, and a queue-based renderer. With **Vite 8 / Rolldown**, builds are "15-61% faster". Route caching is now stable, and Advanced Routing arrives through `src/fetch.ts`. — [astro.build/blog/astro-7](https://astro.build/blog/astro-7/)
- **v7 breaking changes** from the [v7 upgrade guide](https://docs.astro.build/en/guides/upgrade-to/v7/):
  1. Vite 8 (check plugin compatibility; `@tailwindcss/vite@4.3.3` peer range includes `^8`).
  2. **Rust compiler is the only compiler.** HTML validation is stricter: unclosed tags now error, and invalid nesting is no longer auto-fixed. Write clean HTML.
  3. `src/fetch.ts` is now a reserved filename.
  4. Sätteri replaces remark/rehype. `@astrojs/markdown-remark` is no longer installed by default, so reinstall it only if you need remark/rehype plugins.
  5. **`compressHTML` now defaults to `'jsx'`**, which strips whitespace between inline elements the way React does. **Watch mixed Arabic/Latin inline runs** such as `<b>LS</b> <span>PLC</span>`: put the space inside an element or use `{" "}`.
  6. `@astrojs/db` was removed. Some `astro:transitions` internals were removed.
- **v6 changes, which still matter if you copy older tutorials** ([v6 upgrade guide](https://docs.astro.build/en/guides/upgrade-to/v6/), [v6 release post, 2026-03-10](https://astro.build/blog/astro-6/)):
  - Node `>=22.12.0`.
  - `i18n.routing.redirectToDefaultLocale` now **defaults to `false`** and "can now only be used if `i18n.routing.prefixDefaultLocale` is set to `true`."
  - Legacy content collections were removed: you must use `src/content.config.ts` with explicit `loader`s. **Zod 4** (`z.email()`, `z.url()` are now top-level).
  - `Astro.glob()` was removed (use `import.meta.glob()`). `<ViewTransitions />` became `<ClientRouter />`.
  - Images: no upscaling, crop by default, and responsive styles use generated classes.
  - The **Fonts API** and **CSP** became **stable** in v6. The `<Font />` component is "Added in `astro@6.0.0`" ([ref](https://docs.astro.build/en/reference/modules/astro-assets/#font-)).

### 1.2 Built-in i18n routing
Docs: [docs.astro.build/en/guides/internationalization](https://docs.astro.build/en/guides/internationalization/)
- Keys: `i18n.locales`, `i18n.defaultLocale`, `i18n.routing.prefixDefaultLocale` (`false` by default), `i18n.routing.redirectToDefaultLocale` (needs `prefixDefaultLocale: true`), `i18n.fallback` (e.g. `{ zh: "en" }`), and `i18n.routing.fallbackType` (`"redirect"` by default, or `"rewrite"`, added in 4.15).
- Helpers in `astro:i18n`: `getRelativeLocaleUrl(locale, path)`, `getAbsoluteLocaleUrl()`, `getAbsoluteLocaleUrlList()`. In components: `Astro.currentLocale`.
- `Astro.preferredLocale` and `preferredLocaleList` read `Accept-Language`, so they **only work on on-demand-rendered routes**. A fully static build cannot use them. Root-path language negotiation therefore happens in the Worker (§3.4).
- With `prefixDefaultLocale: true`, every locale lives under `/[locale]/`, and the docs say a **root `src/pages/index.astro` is required**.
- **Recommendation:**
  - Prefix every locale: `/ar/`, `/en/`, `/zh/`, `/tr/`.
  - Let a ~20-line Worker handle `/`: honour the `lang` cookie set by the language switcher first, then the first supported language in `Accept-Language` (`ar*`→ar, `zh*`→zh, `tr*`→tr, `en*`→en), and fall back to **`/en/`**.
  - Point `hreflang="x-default"` at `/` **on the home page set**. Google says x-default works best with language selectors and auto-redirecting home pages. On inner pages, point x-default at the **English** version (e.g. `/en/services/`), because only `/` redirects. Every page lists itself plus all alternates, and they must be reciprocal. — [Google: localized versions](https://developers.google.com/search/docs/specialty/international/localized-versions)
  - **Do not rely on `fallback` for SEO.** `rewrite` serves English content at `/zh/...` URLs, which creates duplicate content. Build only the pages that really exist in a locale, and emit hreflang only for real translations.

```js
// astro.config.mjs
// @ts-check
import { defineConfig, fontProviders } from "astro/config";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://logic-controls.com",
  trailingSlash: "always",            // matches Workers assets "auto-trailing-slash" + dir/index.html output
  i18n: {
    locales: ["ar", "en", "zh", "tr"], // decided launch set
    defaultLocale: "en",
    routing: { prefixDefaultLocale: true, redirectToDefaultLocale: false },
  },
  integrations: [
    sitemap({
      i18n: { defaultLocale: "en", locales: { ar: "ar", en: "en", zh: "zh-Hans", tr: "tr" } }, // "ar" (not ar-EG) so Gulf/Arab investors match; zh-Hans = Simplified script (Google-supported), aligned with competitors-and-ux.md
      filter: (page) => !page.includes("/thanks/"),
    }),
  ],
  fonts: [
    { provider: fontProviders.fontsource(), name: "Montserrat", cssVariable: "--font-latin",
      weights: ["100 900"], styles: ["normal", "italic"], subsets: ["latin", "latin-ext"],
      fallbacks: ["system-ui", "sans-serif"] },
    { provider: fontProviders.fontsource(), name: "Alexandria", cssVariable: "--font-arabic",
      weights: ["100 900"], styles: ["normal"], subsets: ["arabic"],   // Latin glyphs fall through to Montserrat
      fallbacks: ["Segoe UI", "Tahoma", "sans-serif"] },
  ],
  image: { layout: "constrained", responsiveStyles: true },
  vite: { plugins: [tailwindcss()] },
});
```

### 1.3 RTL handling
Astro has no RTL switch, so you set it in the layout:

```astro
---
const locale = Astro.currentLocale ?? "en";
const dir = locale === "ar" ? "rtl" : "ltr";
---
<html lang={locale === "zh" ? "zh-Hans" : locale} dir={dir}>   <!-- lang="tr" is required for correct i/İ, ı/I casing in CSS text-transform -->
```

Then use Tailwind logical utilities everywhere (§2). The `rtl:` variant is for exceptions only, such as flipping directional icons with `rtl:-scale-x-100`.

### 1.4 `@astrojs/sitemap` with i18n
Docs: [integrations-guide/sitemap](https://docs.astro.build/en/guides/integrations-guide/sitemap/)
- Install with `npx astro add sitemap`. `site` is required. It works with static output.
- `i18n: { defaultLocale, locales: { ar: "ar", ... } }` makes each `<url>` carry `<xhtml:link rel="alternate" hreflang="…">` for every locale.
- **It does not emit `x-default`.** Add `<link rel="alternate" hreflang="x-default" …>` in the `<head>` of every page (`/` for the home page, the `/en/` equivalent for inner pages), along with per-page `hreflang` links built with `getAbsoluteLocaleUrl`. Optionally, use the `serialize()` hook to add x-default to the sitemap.
- The sitemap pairs URLs by path. If a page exists only in ar/en, filter it so `/zh/...` alternates are not advertised for pages that do not exist.

### 1.5 Images (`astro:assets`) in a static build
Docs: [guides/images](https://docs.astro.build/en/guides/images/)
- `<Image />` and `<Picture />` from `astro:assets` are processed at **build time with Sharp** for prerendered pages. `<Picture formats={["avif","webp"]}>` gives modern formats with a fallback.
- **Responsive images have been stable since 5.10.** Set `image.layout` globally or `layout="constrained|full-width|fixed"` per image, and Astro writes `srcset`/`sizes`. Enable `image.responsiveStyles: true`.
- Files in `public/` are **not** optimised. Keep project photos in `src/assets/` or a content collection folder. Remote images need `image.domains` or `image.remotePatterns`.
- Every generated variant is a file, so watch the **20,000-file Workers free limit** (§3.2). Use 3–4 widths per photo.

### 1.6 Content collections for projects and case studies
Docs: [guides/content-collections](https://docs.astro.build/en/guides/content-collections/)

```ts
// src/content.config.ts
import { defineCollection, reference } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const projects = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/projects" }), // src/content/projects/{ar,en,zh,tr}/slug.md
  schema: ({ image }) => z.object({
    title: z.string(),
    client: z.string().optional(),          // or "Confidential – F&B plant, 10th of Ramadan"
    industry: z.enum(["food-beverage", "pharma", "cosmetics", "packaging", "water", "other"]),
    location: z.string(),                    // city / industrial zone
    year: z.number(),
    challenge: z.string(), solution: z.string(),
    stack: z.array(z.string()),              // ["LS XGB PLC", "Wecon PI HMI", "VFDs", ...]
    results: z.array(z.object({ value: z.string(), label: z.string() })),
    cover: image(), gallery: z.array(image()).default([]),
    services: z.array(reference("services")).default([]),
    translationKey: z.string(),              // ties ar/en/zh versions together for hreflang
  }),
});
export const collections = { projects };
```

Filter by locale with `getCollection("projects", e => e.id.startsWith("ar/"))`. Generate pages with `getStaticPaths()` and render with `render(entry)`.

### 1.7 Fonts API (stable since 6.0)
- Configure fonts in `astro.config` with `fontProviders.fontsource()` (shown above). Astro downloads and self-hosts the files, generates metric-matched fallbacks, and emits preload links. Use variable ranges as `weights: ["100 900"]`. — [guides/fonts](https://docs.astro.build/en/guides/fonts/), [config reference](https://docs.astro.build/en/reference/configuration-reference/#fonts)
- In the layout: `<Font cssVariable="--font-arabic" preload={[{ subset: "arabic" }]} />` on Arabic pages only, and `--font-latin` everywhere. The `preload` filter accepts weight, style and subset. — [`<Font />` ref](https://docs.astro.build/en/reference/modules/astro-assets/#font-)
- In Tailwind 4: `@theme inline { --font-sans: var(--font-latin); }`, then `:lang(ar) { font-family: var(--font-arabic), var(--font-latin), sans-serif; }`.

---

## 2. Tailwind CSS 4.3

- Official Astro setup ([framework guide, v4.3](https://tailwindcss.com/docs/installation/framework-guides/astro)):
  - `npm install tailwindcss @tailwindcss/vite`
  - `vite: { plugins: [tailwindcss()] }` in `astro.config.mjs`
  - `src/styles/global.css` containing `@import "tailwindcss";`, imported in the base layout
  - **Do not use the old `@astrojs/tailwind` integration** (that was the Tailwind 3 path).
- **Logical properties are the RTL strategy.** They flip automatically with `dir`:
  - Margin `ms-*` / `me-*` → `margin-inline-start/end`. Block equivalents `mbs-*` / `mbe-*`. — [docs/margin](https://tailwindcss.com/docs/margin)
  - Padding `ps-*` / `pe-*`.
  - Positioning: the current docs list **`inset-s-*` / `inset-e-*`** → `inset-inline-start/end`. — [docs/top-right-bottom-left](https://tailwindcss.com/docs/top-right-bottom-left)
  - Also `text-start` / `text-end`, `rounded-s-*` / `rounded-e-*`, `border-s-*` / `border-e-*`.
- The **`rtl:` / `ltr:` variants** compile to `&:where(:dir(rtl), [dir="rtl"], [dir="rtl"] *)`. Tailwind says they are only useful when a site supports both directions, which ours does, so use them for exceptions like icon flips and asymmetric decorations. — [hover-focus-and-other-states#rtl-support](https://tailwindcss.com/docs/hover-focus-and-other-states)
- **Lint rule for the team:** never use `ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-` or `text-left/right` in layout code.

---

## 3. Cloudflare hosting (2026)

### 3.1 Workers + Static Assets vs Pages → **use Workers**
- The Pages docs carry a banner: *"Workers supports most Pages use cases and offers a broader feature set. It is Cloudflare's primary platform for building applications. **Start new projects with Workers.**"* — [developers.cloudflare.com/pages](https://developers.cloudflare.com/pages/)
- The Astro deploy guide says: *"Cloudflare recommends using Cloudflare Workers for new projects."* The `@astrojs/cloudflare` adapter is not required for static sites. — [docs.astro.build/en/guides/deploy/cloudflare](https://docs.astro.build/en/guides/deploy/cloudflare/)
- Workers static assets support `_redirects` and `_headers` (path-level only, with no cross-hostname redirects), custom domains, preview URLs and Git builds. Features exclusive to Workers include Email Workers, Cron and observability. — [migration guide / compatibility matrix](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/)

### 3.2 Free-plan limits

| Limit | Workers Free | Source |
|---|---|---|
| Static-asset requests | **Free and unlimited**. They don't invoke the Worker unless matched by `run_worker_first` | [billing-and-limitations](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) |
| Worker script requests | **100,000 / day** (reset at 00:00 UTC). Over the limit, `run_worker_first` routes get a 429 | [limits](https://developers.cloudflare.com/workers/platform/limits/) |
| CPU per request | 10 ms (fine for form handling: siteverify and email are I/O, not CPU) | same |
| Subrequests | 50 / request | same |
| Static asset files per version | **20,000** (Paid: 100,000) | same |
| Max single asset file | **25 MiB** | same |
| Workers per account | 100 | same |
| Custom domains per zone | 100. Routes per zone: 1,000 | same |
| Workers Builds (Git CI) | 3,000 build-min / month, 1 concurrent, 20-min timeout, 2 vCPU / 8 GB | [builds limits](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/) |
| `_redirects` | 2,000 static + 100 dynamic | [static-assets/redirects](https://developers.cloudflare.com/workers/static-assets/redirects/) |
| `_headers` | 100 rules | [static-assets/headers](https://developers.cloudflare.com/workers/static-assets/headers/) |

For comparison, Pages Free gives 500 builds / month, 20,000 files and 25 MiB per file. — [pages limits](https://developers.cloudflare.com/pages/platform/limits/)

### 3.3 `wrangler.jsonc` (static site + one API route + apex/www)
JSON config is recommended for new projects because "some newer Wrangler features will only be available to projects using a JSON config file". — [wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "logic-controls-site",
  "main": "worker/index.ts",
  "compatibility_date": "2026-10-06",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "html_handling": "auto-trailing-slash",   // default
    "not_found_handling": "404-page",          // serves dist/404.html
    "run_worker_first": ["/", "/api/*"]        // only these invoke the Worker (count toward 100k/day)
  },
  "routes": [
    { "pattern": "logic-controls.com", "custom_domain": true }
    // www: see 3.5 (redirect rule) — or add { "pattern": "www.logic-controls.com", "custom_domain": true }
  ],
  "send_email": [
    { "name": "RFQ_MAIL", "destination_address": "OWNER_GMAIL@gmail.com" }   // must be a VERIFIED Email Routing destination
  ],
  "vars": { "TURNSTILE_SITE_KEY": "0x4AAAA…" },
  "secrets": { "required": ["TURNSTILE_SECRET"] },   // `wrangler secret put TURNSTILE_SECRET`
  "observability": { "enabled": true, "head_sampling_rate": 1 }
}
```

- Build and deploy with `npx astro build && npx wrangler deploy`, or connect the repo to **Workers Builds** (build command `npx astro build`, deploy command `npx wrangler deploy`). Add a `.node-version` containing `24`. — [Astro deploy guide](https://docs.astro.build/en/guides/deploy/cloudflare/), [build image](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)
- Install Wrangler with `npm i -D wrangler@latest` (currently 4.147.0). — [install-and-update](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- Combining a Worker script with assets: requests that match a file are served "without invoking Worker code". The Worker handles the rest via `env.ASSETS.fetch(request)`. — [static-assets](https://developers.cloudflare.com/workers/static-assets/)
- Caching: by default assets get `Cache-Control: public, max-age=0, must-revalidate` with an ETag. Add `_headers` containing `/_astro/*` → `Cache-Control: public, max-age=31536000, immutable`, plus security headers. — [static-assets/headers](https://developers.cloudflare.com/workers/static-assets/headers/)

### 3.4 Custom domain: apex + www
- **Custom Domains**: `routes: [{ pattern, custom_domain: true }]`. *"Cloudflare will create DNS records and issue necessary certificates on your behalf."* Requires an active zone in the same account. **It fails if a CNAME already exists** on that hostname, so delete stale `@`/`www` records first. — [custom-domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- **www → apex (recommended):**
  1. Create a **proxied** placeholder record `www` A `192.0.2.1` (or AAAA `100::`).
  2. Add a **Single Redirect** rule: when `http.host eq "www.logic-controls.com"`, the dynamic target is `concat("https://logic-controls.com", http.request.uri.path)`, status 301, preserve query string. Wildcard form: `https://www.*` → `https://${1}`.
  - Single Redirects "require that the incoming traffic … is proxied by Cloudflare".
  - **Free plan includes 10 Single Redirect rules.**
  - `_redirects` can't do this because domain-level redirects are not supported.
  - Sources: [redirect www→root](https://developers.cloudflare.com/rules/url-forwarding/examples/redirect-www-to-root/), [create-dashboard](https://developers.cloudflare.com/rules/url-forwarding/single-redirects/create-dashboard/), [Rules overview / availability](https://developers.cloudflare.com/rules/url-forwarding/), [static-assets/redirects](https://developers.cloudflare.com/workers/static-assets/redirects/).
- **Root `/` language negotiation** (the lead's decision is "browser language, fallback English"). `run_worker_first: ["/"]` lets the Worker 302 to `/ar/`, `/en/`, `/zh/` or `/tr/`:
  1. Use the `lang` cookie written by the on-page language switcher. This respects explicit choice: a foreign engineer on an Arabic-language phone in Egypt can pick English once.
  2. Otherwise, take the first `Accept-Language` entry, in q-order, whose primary subtag is `ar`, `zh`, `tr` or `en`. `zh-TW`/`zh-HK` also map to `/zh/`, which is Simplified; this is acceptable at launch.
  3. Otherwise, use **`/en/`**.

  Send `Cache-Control: private, no-store` and `Vary: Accept-Language, Cookie` on the 302, so no shared cache pins one language. Only `/` invokes the Worker, so this costs one Worker request per home-page entry, far below the 100k/day free limit.

```ts
const SUPPORTED = ["ar", "en", "zh", "tr"] as const;
function negotiateLocale(req: Request): Response {
  const cookie = /(?:^|;\s*)lang=(ar|en|zh|tr)\b/.exec(req.headers.get("Cookie") ?? "")?.[1];
  const fromHeader = (req.headers.get("Accept-Language") ?? "")
    .split(",").map(p => { const [tag, q] = p.trim().split(";q="); return { l: tag.toLowerCase().split("-")[0], q: q ? +q : 1 }; })
    .sort((a, b) => b.q - a.q).map(x => x.l).find(l => (SUPPORTED as readonly string[]).includes(l));
  const loc = cookie ?? fromHeader ?? "en";
  return new Response(null, { status: 302, headers: {
    Location: `/${loc}/`, "Cache-Control": "private, no-store", Vary: "Accept-Language, Cookie" } });
}
```

### 3.5 API token permissions: is the new zone token sufficient?
**Status (per the lead):** we now have the original account token, which deploys Workers and Pages and behaves like the **"Edit Cloudflare Workers"** template, **plus** a zone-scoped token for `logic-controls.com` with **DNS, Workers Routes and Email Routing**. — [token templates](https://developers.cloudflare.com/fundamentals/api/reference/template/)

**Verdict: sufficient for deploy, custom domain, DNS and the `info@` forwarding rule. Three operations still need either an extra permission or a one-time dashboard click** (all free-plan features):

1. **Enabling Email Routing on the zone** (`POST /zones/{id}/email/routing/dns`). The API reference lists **Zone Settings Write** as the accepted permission, not an Email Routing permission. → Click *Enable Email Routing* once in the dashboard, or add **Zone → Zone Settings → Edit**.
2. **Adding and verifying the owner's Gmail as a destination address** (`POST /accounts/{id}/email/routing/addresses`). This is an **account-level** permission, **Email Routing Addresses Edit**. A zone-scoped token cannot do it. → Add it in the dashboard (the owner must click the verification email anyway), or add **Account → Email Routing Addresses → Edit**.
3. **The www → apex Single Redirect** needs **Zone → Single Redirect → Edit**. → Create the one rule in the dashboard, or add the permission.

**Also confirm** the zone token's "Email Routing" permission is **Email Routing Rules → Edit** (zone), not Read. Also confirm it includes **Zone → Zone → Read**: wrangler resolves the zone ID for `custom_domain` routes.

**Which token to use for `wrangler deploy` with `custom_domain` routes:** the deploying token needs **Account: Workers Scripts Edit** *and* **Zone: Workers Routes Edit + Zone Read (+ DNS Edit)** on the same token, because wrangler uses one token per run. If the two permission sets live on different tokens, either merge them into one token or run `wrangler deploy` with the account token after attaching the domain once in the dashboard. The "Authentication error" seen earlier is what a token without **Zone Resources → Include → logic-controls.com** returns on zone endpoints.

Full reference, with names from the [permissions reference](https://developers.cloudflare.com/fundamentals/api/reference/permissions/) and the API endpoint pages:

| Need | Permission (token UI) | Scope | Used by |
|---|---|---|---|
| Deploy Worker + assets | Workers Scripts **Edit** (already present) | Account | `wrangler deploy`; also the Workers Domains API "Attach to Domain" ([API](https://developers.cloudflare.com/api/resources/workers/subresources/domains/methods/update/)) |
| Custom domain / routes on the zone | Workers Routes **Edit** + **Zone Read** | Zone | `routes` with `custom_domain: true` |
| Edit DNS (placeholder `www`, verification TXT, cleanup) | **DNS Edit** | Zone | `POST /zones/{id}/dns_records` needs "DNS Write" ([API](https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/create/)) |
| Enable Email Routing (adds/locks MX + SPF) | **Zone Settings Edit** | Zone | `POST /zones/{id}/email/routing/dns` needs "Zone Settings Write" ([API](https://developers.cloudflare.com/api/resources/email_routing/subresources/dns/methods/create/)) |
| Create `info@` → Gmail rule, catch-all | **Email Routing Rules Edit** | Zone | `POST /zones/{id}/email/routing/rules` ([API](https://developers.cloudflare.com/api/resources/email_routing/subresources/rules/methods/create/)) |
| Add destination address (owner's Gmail) | **Email Routing Addresses Edit** | **Account** | `POST /accounts/{id}/email/routing/addresses` ([API](https://developers.cloudflare.com/api/resources/email_routing/subresources/addresses/methods/create/)) |
| www → apex redirect rule | **Single Redirect Edit** | Zone | Rulesets `http_request_dynamic_redirect` phase ([docs](https://developers.cloudflare.com/rules/url-forwarding/single-redirects/create-api/)) |
| Create Turnstile widget via API (optional; the dashboard is fine) | **Turnstile Edit** (API lists it as "Turnstile Sites Write"; Account Settings Write also accepted) | Account | `POST /accounts/{id}/challenges/widgets` ([API](https://developers.cloudflare.com/api/resources/turnstile/subresources/widgets/methods/create/)) |
| Create Web Analytics site via API (optional) | **Account Settings Edit** | Account | `POST /accounts/{id}/rum/site_info` ([API](https://developers.cloudflare.com/api/resources/rum/subresources/site_info/methods/create/)) |

Quick verification commands (read-only; each should return `"success": true`):

```bash
curl -s -H "Authorization: Bearer $TOKEN" https://api.cloudflare.com/client/v4/user/tokens/verify
curl -s -H "Authorization: Bearer $TOKEN" "https://api.cloudflare.com/client/v4/zones?name=logic-controls.com"        # Zone Read
curl -s -H "Authorization: Bearer $TOKEN" https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records            # DNS Read/Edit
curl -s -H "Authorization: Bearer $TOKEN" https://api.cloudflare.com/client/v4/zones/$ZONE_ID/email/routing/rules    # Email Routing Rules
curl -s -H "Authorization: Bearer $TOKEN" https://api.cloudflare.com/client/v4/zones/$ZONE_ID/workers/routes         # Workers Routes
```

---

## 4. Contact / RFQ form on free Cloudflare

### Options compared

| Option | Free? | Limits | Verdict |
|---|---|---|---|
| **(a) Email Routing + Worker `send_email` binding → verified destination** | **Yes, on all plans.** *"Sending to verified destination addresses in your account is free on all plans, including when only Email Routing is configured"*. These sends "do not count toward your monthly quota or daily sending limits" | 200 rules / domain; 200 destination addresses / account; 25 MiB to verified destinations; max 50 recipients; max 32 attachments | ✅ **Recommended** |
| **(b) Cloudflare Email Service – Email Sending to arbitrary recipients** (`env.EMAIL.send()`, REST, SMTP) | **⚠ PAID. No.** Public beta since **2026-04-16**, *"available on the Workers paid plan"*: 3,000 / month included, then $0.35 / 1,000. No GA announced in the changelog as of 2026-09-25 | — | ❌ **Excluded** by the $0 rule. That means **no auto-reply email to the customer** from Cloudflare. The thank-you page plus a WhatsApp/WeChat follow-up replaces it |
| **(c) Resend free tier** | Yes, with **no credit card** to start ([lovable.dev FAQ](https://lovable.dev/faq/backend/email/resend-free-tier), [costbench](https://costbench.com/software/email-api/resend/free-plan/)) | 3,000 / month, **100 / day**, 30-day retention ([resend.com/pricing](https://resend.com/pricing)) | Optional add-on only if the client later insists on a customer auto-acknowledgement. Adds a third-party account and DKIM/SPF records on a subdomain (e.g. `send.logic-controls.com`). Not needed for v1 |

Sources: [Email Service pricing](https://developers.cloudflare.com/email-service/platform/pricing/), [Email Service limits](https://developers.cloudflare.com/email-service/platform/limits/), [Email Routing addresses](https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/), [send bindings](https://developers.cloudflare.com/email-service/configuration/send-bindings/), [Workers send API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/), [changelog](https://developers.cloudflare.com/changelog/product/email-service/), [Resend pricing](https://resend.com/pricing).

### Recommended flow
1. Add the owner's Gmail as an Email Routing **destination address** and click the verification link.
2. Enable Email Routing on `logic-controls.com`. This adds and locks the MX, SPF and DKIM records.
3. The form exists in all four locales (fields in `competitors-and-ux.md`). It POSTs to `/api/rfq` with `cf-turnstile-response` and a hidden `locale`, and the Turnstile widget uses `data-language` = `ar` / `en` / `zh-cn` / `tr`.
4. The Worker:
   - (i) validates fields and a honeypot;
   - (ii) calls **Turnstile siteverify** server-side;
   - (iii) calls `env.RFQ_MAIL.send({ from: { email: "website@logic-controls.com", name: "Logic Controls Website" }, to: OWNER, replyTo: visitorEmail, subject: "[RFQ][AR] …", text, html })`;
   - (iv) 303-redirects to `/{locale}/thanks/`, or returns JSON for a progressive-enhancement fetch.

   The `from` address "must always belong to a domain you have onboarded to Email Service". `replyTo` is a supported field, so the owner can reply straight to the customer.
5. File uploads such as drawings and I/O lists: keep them out of v1 (say "send drawings on WhatsApp"). If needed later, attachments are allowed (max 32, 25 MiB to verified destinations).
6. Optional: store a copy of each lead in **Workers KV**, so leads are never lost if mail fails. The free tier is 100,000 reads/day, **1,000 writes/day** and 1 GB, with no card. — [KV pricing](https://developers.cloudflare.com/kv/platform/pricing/)
7. **zh pages:** WhatsApp is not usable in mainland China, so the zh contact page shows email, a WeChat ID/QR and the form. Turnstile reachability from mainland China is **not verified**. Test it from a CN vantage point before launch, and always show a plain `mailto:info@…` fallback on zh pages.

### Turnstile (spam protection)
- Free plan: **up to 20 widgets, 10 hostnames per widget, unlimited challenges**, WCAG 2.2 AAA. — [turnstile/plans](https://developers.cloudflare.com/turnstile/plans/)
- Client: `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>` and `<div class="cf-turnstile" data-sitekey="…" data-language="ar" data-size="flexible" data-appearance="interaction-only">`.
  - The script must be loaded from that exact URL. Do not proxy or self-host it.
  - Inside a `<form>`, it auto-adds the hidden input `cf-turnstile-response`.
  - Supported languages include **`ar-eg` / `ar`**, `zh-cn`, and `tr`.
  - Sources: [client-side rendering](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/), [supported languages](https://developers.cloudflare.com/turnstile/reference/supported-languages/)
- **Server-side validation is mandatory.** *"tokens can be forged"*. `POST https://challenges.cloudflare.com/turnstile/v0/siteverify` with `secret`, `response` and optionally `remoteip` (from `CF-Connecting-IP`) and `idempotency_key`. Tokens are valid for **300 s** and are single-use (a reused token gives `timeout-or-duplicate`). Also check `hostname` and `action` in the response. — [server-side validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)

```ts
// worker/index.ts (sketch)
export default {
  async fetch(req: Request, env: Env) {
    const url = new URL(req.url);
    if (url.pathname === "/") return negotiateLocale(req);          // §3.4
    if (url.pathname === "/api/rfq" && req.method === "POST") {
      const form = await req.formData();
      if (form.get("company_website")) return new Response(null, { status: 204 }); // honeypot
      const ts = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response: form.get("cf-turnstile-response"),
                               remoteip: req.headers.get("CF-Connecting-IP") }),
      }).then(r => r.json());
      if (!ts.success || ts.hostname !== "logic-controls.com") return new Response("Verification failed", { status: 400 });
      await env.RFQ_MAIL.send({ from: { email: "website@logic-controls.com", name: "Logic Controls Website" },
        to: env.OWNER_EMAIL /* = verified destination */, replyTo: String(form.get("email") || ""),
        subject: `[RFQ][${form.get("locale")}] ${form.get("company")} — ${form.get("industry")}`,
        text: renderText(form), html: renderHtml(form) });
      return Response.redirect(new URL(`/${form.get("locale")}/thanks/`, url), 303);
    }
    return env.ASSETS.fetch(req);
  },
};
```

---

## 5. Email Routing: `info@logic-controls.com` → client Gmail (free)

- Requirement: *"You must be using Cloudflare DNS."* Email Routing (inbound forwarding) is **unlimited on Workers Free**. — [enable Email Routing](https://developers.cloudflare.com/email-routing/get-started/enable-email-routing/), [pricing](https://developers.cloudflare.com/email-service/platform/pricing/)
- **Dashboard** (Compute → Email Service → Email Routing):
  1. Destination Addresses → add the Gmail address and verify it. *"Until a destination address is verified, any routing rule that points to it stays disabled."*
  2. Enable Email Routing. Cloudflare adds MX, SPF TXT and DKIM TXT records. **Remove any conflicting existing MX records first.**
  3. Routing Rules → create `info` → *Send to an email* → Gmail. Optionally also `sales@` and `rfq@`, and/or a **catch-all**.

  Source: [Email Routing addresses](https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/).
- **API equivalent** (needs the §3.5 permissions):

```bash
# 1) destination (account-level)
curl -X POST https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/email/routing/addresses \
  -H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json" -d '{"email":"owner@gmail.com"}'
# 2) enable routing + DNS on the zone
curl -X POST https://api.cloudflare.com/client/v4/zones/$ZONE_ID/email/routing/dns -H "Authorization: Bearer $CF_TOKEN"
# 3) rule info@ -> gmail
curl -X POST https://api.cloudflare.com/client/v4/zones/$ZONE_ID/email/routing/rules \
  -H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"info to owner","enabled":true,"matchers":[{"type":"literal","field":"to","value":"info@logic-controls.com"}],"actions":[{"type":"forward","value":["owner@gmail.com"]}]}'
```

- Since **2025-07-03**, Email Routing requires inbound mail to pass SPF or DKIM. — [changelog 2025-06-30](https://developers.cloudflare.com/changelog/product/email-service/)
- Sending *as* `info@` from Gmail ("Send mail as") is not provided by Email Routing, which only forwards. The options are: reply from Gmail; use Gmail "Send mail as" with an external SMTP (e.g. Resend SMTP or Cloudflare Email Service SMTP, which is beta and Paid-only); or move to Google Workspace or Zoho Mail later.

---

## 6. Cloudflare Web Analytics
- *"free, privacy-first analytics … Cloudflare Web Analytics does not collect or use your visitors' personal data."* — [web-analytics/about](https://developers.cloudflare.com/web-analytics/about/)
- Setup:
  - Proxied hostname: dashboard → Web Analytics → add site → choose the hostname → **automatic** JS injection.
  - Otherwise: **manual snippet** before `</body>` (`static.cloudflareinsights.com/beacon.min.js` with `data-cf-beacon='{"token":"…"}'`). If you set a CSP, allow `static.cloudflareinsights.com` and `cloudflareinsights.com`.
  - Auto-injection doesn't work if `Cache-Control: public, no-transform` is set.
  - Sources: [get-started](https://developers.cloudflare.com/web-analytics/get-started/), [FAQ](https://developers.cloudflare.com/web-analytics/faq/)
- **Recommendation:** use the manual snippet in the Astro base layout. It is deterministic and works on the Worker custom domain, preview URLs and future hosts.
- Limits: unsampled data for 7 days, then aggregated to ~10%; **6 months** retention; soft limit of **10 sites/account**; the beacon is blocked by major ad-blockers. — [FAQ](https://developers.cloudflare.com/web-analytics/faq/)
- Track conversions such as WhatsApp clicks, RFQ submissions and phone taps as distinct `/thanks/` page views. Web Analytics has no custom events, so the thank-you URL is your conversion metric. Add `?src=whatsapp` style tracking to outbound links only if you later add a richer tool.

---

## 7. Fonts

### Brand fit
The logo is a **bold italic geometric sans** in charcoal and royal/navy blue.

### Recommended pairing: **Montserrat (Latin) + Alexandria (Arabic)**
- **Alexandria** *"is the Arabic companion of Montserrat"*. It was designed by **Mohamed Gaber** (Cairo-based) with Julieta Ulanovsky (Montserrat's designer). It is a variable font from Thin to Black. — [google/fonts DESCRIPTION](https://raw.githubusercontent.com/google/fonts/main/ofl/alexandria/DESCRIPTION.en_us.html), [METADATA](https://raw.githubusercontent.com/google/fonts/main/ofl/alexandria/METADATA.pb)
- Montserrat is geometric and has a **true italic**, so `font-weight: 800; font-style: italic` on Latin H1/H2 echoes the logo. Arabic headlines stay upright: synthetic slanting of Arabic looks wrong, so set `font-synthesis: none`.
- There is an Egyptian design connection (the designer is Cairo-based, and the name is Alexandria), which is a nice story for an Egyptian brand.

### Fontsource packages (verified 2026-10-06 via `npm view` and the [Fontsource API](https://api.fontsource.org/v1/fonts/alexandria))

| Font | npm package | Subsets | Axes | woff2 size (one subset, variable) |
|---|---|---|---|---|
| Alexandria | `@fontsource-variable/alexandria` (5.3.0) | arabic, latin, latin-ext, vietnamese | wght 100–900 | arabic **31 KB**, latin 30 KB |
| Montserrat | `@fontsource-variable/montserrat` (5.3.0) | latin, latin-ext, cyrillic(-ext), vietnamese | wght 100–900, normal + italic | latin **38 KB** / italic 40 KB; **latin-ext 70 KB / italic 75 KB** |

Sizes are `content-length` from jsDelivr for v5.3.0 files, checked 2026-10-06.

### Four-locale font strategy (ar / en / zh / tr), $0 and within free-plan limits

| Locale | Fonts used | Files fetched (typical page) | Notes |
|---|---|---|---|
| **en** | Montserrat `latin` (normal, plus italic for headings) | ~38 KB (+40 KB if italic headings) | Preload `latin` normal only |
| **ar** | Alexandria `arabic` + Montserrat `latin` for embedded Latin, brand names and Western digits | ~31 + 38 = **~69 KB** | Configure Alexandria with `subsets: ["arabic"]` **only**, so Latin glyphs fall through to the cached Montserrat file. Eastern Arabic digits (U+0660–0669) are in the arabic subset |
| **tr** | Montserrat `latin` + **`latin-ext`** | 38 + **70 KB** (+75 KB if italic headings contain ğ/ş/İ) | Turkish needs **ğ Ğ ş Ş İ** (U+011E–011F, U+015E–015F, U+0130). These are in `latin-ext`. ç ö ü and dotless **ı** (U+0131) are already in `latin`. See the optimisation below |
| **zh** | **System CJK stack** + Montserrat `latin` for Latin and digits | ~38 KB, **0 KB for Chinese** | No CJK webfont (see below) |

- **File-count budget:** the whole font set is **5–7 woff2 files**: Montserrat latin/latin-ext × normal/italic, Alexandria arabic, plus optional Turkish micro-subsets. That is negligible against the **20,000-file Workers Free limit**. Each file is far below the 25 MiB per-file cap.
- Per-subset `unicode-range` means each browser downloads only the subsets whose characters appear on the page. Arabic never loads on `/en/`, and `latin-ext` loads only where Turkish (or other extended) characters appear.
- **Turkish optimisation (optional, free):**
  - At build time, run `pyftsubset` (fontTools, OSS) on Montserrat's latin-ext variable file with `--unicodes=U+011E-011F,U+0130,U+015E-015F` (normal and italic).
  - Register the result as an extra `@font-face` with that `unicode-range`, and drop the Fontsource `latin-ext` subset. Turkish pages then need only a few KB instead of 70–145 KB.
  - Use the Astro Fonts API `local` provider plus `unicodeRange`, or plain CSS. — [config reference](https://docs.astro.build/en/reference/configuration-reference/#fonts)
- **`lang` attribute matters for Turkish.** `<html lang="tr">` makes `text-transform: uppercase` map i→**İ** and ı→**I** correctly. Avoid all-caps CSS on headings in other locales that quote Turkish words.

### Chinese (zh-CN): system font stack, no webfont
- **Do not self-host a CJK webfont.** `@fontsource-variable/noto-sans-sc` is **101 woff2 chunks, ~4.4 MB in total** (jsDelivr package listing, checked 2026-10-06). Unicode-range chunking still makes each page fetch several hundred KB, and the chunks add 101 files to the deploy.
- Every target OS ships a good Simplified Chinese sans. Per the W3C Chinese Layout Requirements "System font mappings" (last verified 2026-09-03), these are:
  - **Windows:** Microsoft YaHei
  - **Apple:** PingFang SC / Heiti SC
  - **Android (AOSP):** Noto Sans CJK SC
  - **Linux:** Noto Sans CJK SC / WenQuanYi Zen Hei
  - **HarmonyOS:** HarmonyOS Sans SC

  Source: [w3c.github.io/clreq/others/system-font-mappings.html](https://w3c.github.io/clreq/others/system-font-mappings.html); stack ordering practice from [Wiredcraft](https://wiredcraft.com/blog/chinese-webfonts-font-family/).

```css
:lang(zh) {
  font-family: var(--font-latin),                       /* Montserrat renders Latin + digits → brand look kept */
    "PingFang SC", "Hiragino Sans GB", "Heiti SC",       /* Apple */
    "Microsoft YaHei UI", "Microsoft YaHei",            /* Windows */
    "HarmonyOS Sans SC", "Noto Sans CJK SC", "Source Han Sans SC", "WenQuanYi Zen Hei", /* Android/Huawei/Linux */
    sans-serif;
  font-synthesis: none;   /* no faux-italic on Han characters */
}
:lang(zh) em, :lang(zh) i { font-style: normal; font-weight: 700; } /* CJK has no italic convention */
```

- Chinese typography tweaks:
  - `line-height: 1.75` for body text.
  - No italic; use bold for emphasis.
  - Avoid letter-spacing on Han characters.
  - Use full-width punctuation in copy.
- Never pull fonts from Google Fonts or other Google-hosted CDNs on any locale. Self-hosting on Cloudflare matters doubly for zh, because `fonts.googleapis.com` is blocked in mainland China.
- **⚠ Mainland China delivery caveat:** in-China PoPs (the "China Network", run with JD Cloud) are *"available as a separate subscription for customers on an Enterprise plan"*, so they are **excluded by the $0 rule**. On the Free plan, mainland visitors are served from PoPs outside China. Expect higher latency, so keep zh pages light: system fonts, AVIF/WebP images, minimal JS. — [Cloudflare China Network docs](https://developers.cloudflare.com/china-network/), [cloudflare.com/china-network](https://www.cloudflare.com/en-ca/application-services/products/china-network/)
- If a branded Chinese headline is ever wanted, subset **one weight to only the exact glyphs used**, for example `pyftsubset NotoSansSC.ttf --text-file=zh-headlines.txt`, which gives a few KB. Never ship the full font.

### Delivery
Use Astro's Fonts API with the Fontsource provider (§1.7). It self-hosts, generates metric-matched fallbacks and preloads:
- Alexandria: `subsets: ["arabic"]`.
- Montserrat: `subsets: ["latin","latin-ext"]` and `styles: ["normal","italic"]`.
- Preload only `latin` normal, plus `arabic` on `/ar/`.

`font-display: swap`. The alternative is `import "@fontsource-variable/montserrat/wght.css"` and `@fontsource-variable/alexandria/arabic.css` in the layout. Both cost $0.

---

## 8. Other implementation notes
- **Trailing slashes:** Astro static output writes `dir/index.html`, and Workers `html_handling: "auto-trailing-slash"` serves `/en/about/`. Set `trailingSlash: "always"` in Astro so canonical, hreflang and sitemap URLs all agree.
- **404:** with `not_found_handling: "404-page"`, Workers serves the nearest `404.html`. Build `src/pages/[locale]/404.astro` plus a root `404.astro`, so `/ar/xyz` gets an Arabic 404.
- **`workers.dev` / preview URLs:** add `X-Robots-Tag: noindex` for non-production hosts. `_headers` can't match by host, so do it in the Worker for preview hosts, or disable `workers_dev`.
- **CSP:** Astro 6+ has stable built-in CSP. Allow `challenges.cloudflare.com` (Turnstile) and `static.cloudflareinsights.com` (analytics).

---

## 9. $0-forever audit

Rule: the domain renewal is the only cost. The Cloudflare Free plan does not need a payment method for any item marked ✅.

| Capability | Service used | Plan / cost | Free-tier headroom | Status |
|---|---|---|---|---|
| Hosting HTML/CSS/JS/images | Workers **Static Assets** | Workers Free, $0 | Asset requests **free and unlimited**. 20,000 files / version. 25 MiB / file | ✅ |
| Root language redirect + `/api/rfq` | Worker script (`run_worker_first: ["/", "/api/*"]`) | Workers Free, $0 | **100,000 invocations/day**, 10 ms CPU. Only `/` and form posts count | ✅ (at 429 risk only beyond ~100k home-page hits a day. If ever hit, swap `/` for a static page with a JS `navigator.languages` redirect plus `<noscript>` links) |
| CI/CD from Git | Workers Builds | Free, $0 | 3,000 build-min/month, 1 concurrent | ✅ (or deploy from a laptop or GitHub Actions free minutes with `wrangler deploy`) |
| Custom domain apex + TLS | Workers Custom Domains | Free, $0 | 100 / zone | ✅ |
| www → apex | Single Redirect rule | Free, $0 | **10 rules** on Free | ✅ |
| `info@` → Gmail | Email Routing | Free, $0 | Unlimited routing. 200 rules. 200 destinations | ✅ |
| RFQ form → owner inbox | `send_email` binding to a **verified destination** | Free on **all** plans | Doesn't count toward any quota | ✅ |
| Spam protection | Turnstile | Free, $0 | 20 widgets, unlimited challenges | ✅ |
| Analytics | Cloudflare Web Analytics | Free, $0 | 10 sites soft limit, 6-month retention | ✅ |
| Lead backup (optional) | Workers KV | Free, $0 | 1,000 writes/day, 1 GB | ✅ |
| Fonts | Self-hosted Fontsource (OFL-1.1) + system CJK | $0 | ~5–7 files | ✅ |
| Image optimisation | `astro:assets` (Sharp at build time) | $0 | Counts toward the 20k-file budget, so use 3–4 widths per image | ✅ (do **not** use Cloudflare Images or Polish, which are paid) |
| Auto-reply email to the *customer* | Cloudflare Email Sending | **⚠ PAID** (Workers Paid, beta) | — | ❌ Excluded. Use the thank-you page and a human reply instead. Free alternative if ever required: Resend free tier (no card, 100/day) |
| Sending *as* `info@` from Gmail | Needs SMTP | Email Service SMTP is **⚠ PAID**. Google Workspace is **⚠ PAID** | — | ❌ Excluded. The owner replies from Gmail. Optional free path: Resend SMTP (free tier) for Gmail "Send mail as" |
| Faster delivery inside mainland China | China Network | **⚠ PAID** (Enterprise add-on) | — | ❌ Excluded. Keep zh pages lightweight instead |
| Server-side rendering at scale | Workers Paid ($5/mo) | **⚠ PAID** | — | ❌ Not needed. The site is fully static |
