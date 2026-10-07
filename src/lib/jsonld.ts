/**
 * Structured data (schema.org JSON-LD): the ONE place that builds it. Pages compose nodes with graph(…) and pass the
 * result to <BaseLayout jsonLd>; <Breadcrumbs> uses breadcrumbList().
 *
 * One company entity: a single ProfessionalService node (a subtype of Organization) with @id …/#organization, emitted
 * in full on home, about and contact; every other page refers to it with orgRef(). The founder is a Person
 * (…/#founder), in full on /about/ (AboutPage.mainEntity). Facts come from src/data/site.ts and the messages, never
 * typed in here. Entity nodes (#organization, #founder) are identical on every page and in every locale (English
 * values, the Arabic name as alternateName): search engines merge nodes by @id and keep one value, so per-locale
 * variants would only compete (CS2-07). Localised text lives on the page nodes (WebPage, Service, Article). Not claimed until the client approves / provides it:
 * the Arabic brand spelling (CS-20), the founder's LinkedIn (sameAs), a street address and geo point (CS-05).
 *
 * Every text value goes through cleanText(): JSON-LD gets the words, never the display controls html()/plain() add
 * (NBSP, WORD JOINER, LRI…PDI, soft hyphens, U+200B).
 */
import { existsSync, openSync, readSync, closeSync, fstatSync } from "node:fs";
import { LOCALES, LOCALE_META, getMessages, localePath, type Locale } from "~/i18n";
import { SITE } from "~/data/site";
import { SERVICE_SLUGS } from "~/data/services";
import { ZONES } from "~/data/zones";
import type { ProjectData } from "~/data/projects";
import { cleanText, techLabel } from "~/lib/text";
import { ogCard, ogDefault } from "~/lib/og";
import { pageDates } from "../../scripts/content-dates.mjs";

export type JsonLdNode = Record<string, unknown>;

export const ORG_ID = `${SITE.url}/#organization`;
export const WEBSITE_ID = `${SITE.url}/#website`;
export const FOUNDER_ID = `${SITE.url}/#founder`;
/** schema.org type of the company node (ProfessionalService ⊂ LocalBusiness ⊂ Organization). Same everywhere. */
const ORG_TYPE = "ProfessionalService";

export const absUrl = (path: string) => new URL(path, SITE.url).href;
const pageUrl = (locale: Locale, path = "") => absUrl(localePath(locale, path));
const lang = (locale: Locale) => LOCALE_META[locale].htmlLang;
const txt = (s: string | undefined) => (s ? cleanText(s) : undefined);
/** Drop undefined / empty values so optional facts are simply absent (never null or ""). */
const compact = <T extends JsonLdNode>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0))) as T;

/** Wrap nodes into one JSON-LD document. Falsy entries are skipped. */
export function graph(...nodes: Array<JsonLdNode | undefined | false | null>): JsonLdNode {
  return { "@context": "https://schema.org", "@graph": nodes.filter((n): n is JsonLdNode => !!n) };
}

/* ------------------------------------------------------------------ the company */

const LOGO = { "@type": "ImageObject", "@id": `${SITE.url}/#logo`, url: absUrl("/logo-512.png"), width: 512, height: 512, caption: SITE.name };

/** Reference to the company: @id plus the name / url / logo Google needs where the full node is not on the page. */
export const orgRef = () => ({ "@type": ORG_TYPE, "@id": ORG_ID, name: SITE.name, url: `${SITE.url}/`, logo: LOGO });

const address = () => ({
  "@type": "PostalAddress",
  addressLocality: SITE.address.locality,
  addressRegion: SITE.address.region,
  addressCountry: SITE.address.country,
});
const egypt = (locale: Locale) => ({ "@type": "Country", name: txt((getMessages(locale).common.locations as Record<string, string>).egypt) ?? "Egypt" });
/** Locale of the entity nodes (#organization, #founder): one set of values everywhere. */
const ENTITY_LOCALE: Locale = "en";

/**
 * The single company node (CS-07): ProfessionalService + founder + services offered + areas served. The same values on
 * every page and in every locale (CS2-07); `locale` is accepted for call-site compatibility only.
 */
export function organization(_locale?: Locale): JsonLdNode {
  const locale = ENTITY_LOCALE;
  const t = getMessages(locale);
  const zones = t.common.zones.items as Record<string, { name: string }>;
  const services = t.services.items as Record<string, { title: string; navTitle?: string }>;
  const f = founderCopy(locale);
  return compact({
    "@type": ORG_TYPE,
    "@id": ORG_ID,
    name: SITE.name,
    alternateName: ["Logic Controls Egypt"],
    url: `${SITE.url}/`,
    logo: LOGO,
    image: absUrl(ogDefault(ENTITY_LOCALE).url),
    description: txt(t.seo.organizationDescription),
    email: SITE.email,
    telephone: SITE.phone.tel,
    address: address(),
    areaServed: [egypt(locale), ...ZONES.map((z) => ({ "@type": "Place", name: txt(zones[z.slug]?.name) })).filter((p) => p.name)],
    founder: f ? { "@type": "Person", "@id": FOUNDER_ID, name: f.name } : undefined,
    knowsAbout: SERVICE_SLUGS.map((s) => txt(services[s]?.title)).filter(Boolean),
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: txt(t.ui.nav.services),
      itemListElement: SERVICE_SLUGS.filter((s) => services[s]).map((s) => ({
        "@type": "Offer",
        itemOffered: { "@type": "Service", "@id": `${pageUrl(locale, `services/${s}`)}#service`, name: txt(services[s]!.title) },
      })),
    },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "sales",
      telephone: SITE.phone.tel,
      email: SITE.email,
      areaServed: "EG",
      availableLanguage: ["ar", "en"],
    },
    sameAs: [SITE.facebook],
  });
}

/** The site (home page only). */
export function website(): JsonLdNode {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: `${SITE.url}/`,
    name: SITE.name,
    alternateName: ["Logic Controls Egypt"],
    inLanguage: LOCALES.map(lang),
    publisher: { "@id": ORG_ID },
  };
}

/* ------------------------------------------------------------------ the founder */

interface FounderCopy {
  name: string;
  role?: string;
}
const founderCopy = (locale: Locale) => {
  const f = (getMessages(locale).about as { founder?: FounderCopy }).founder;
  return f?.name ? { name: cleanText(f.name), role: txt(f.role) } : undefined;
};

/**
 * Founder Person (CS-07), for AboutPage.mainEntity. Facts from about.founder (name, role) and the founder bio
 * (B.Sc., Helwan University). One node in every locale (CS2-07): the Latin name, the Arabic spelling as alternateName,
 * the English role, the English about page as url. No LinkedIn sameAs (its dates and employer names are not cleared
 * for the site).
 */
export async function founder(_locale?: Locale): Promise<JsonLdNode | undefined> {
  const locale = ENTITY_LOCALE;
  const f = founderCopy(locale);
  if (!f) return undefined;
  const other = founderCopy("ar")?.name;
  // lazy: keeps this module importable outside Astro (unit tests import catalog.ts, which re-exports orgRef)
  const [{ getImage }, { default: photoSrc }] = await Promise.all([import("astro:assets"), import("~/assets/people/founder.jpg")]);
  const photo = await getImage({ src: photoSrc, width: 600, format: "jpg", quality: 80 });
  return compact({
    "@type": "Person",
    "@id": FOUNDER_ID,
    name: f.name,
    alternateName: other && other !== f.name ? other : undefined,
    jobTitle: f.role,
    image: absUrl(photo.src),
    url: `${pageUrl(locale, "about")}#founder`,
    worksFor: { "@id": ORG_ID },
    alumniOf: { "@type": "CollegeOrUniversity", name: "Helwan University", sameAs: "https://en.wikipedia.org/wiki/Helwan_University" },
    knowsAbout: ["PLC programming", "HMI", "SCADA", "GMP environments"],
  });
}

/* ------------------------------------------------------------------ pages */

type PageType = "WebPage" | "AboutPage" | "ContactPage" | "CollectionPage";

/** "Title | Logic Controls" → "Title": a page node is named by its own title, never with the site-name suffix. */
const withoutBrand = (name: string) => name.replace(new RegExp(`\\s*[|｜]\\s*${SITE.name}\\s*$`), "").trim() || name;

/** A page node: always inLanguage + isPartOf the site; `mainEntity` / `about` link it to what the page is about. */
export function webPage(
  locale: Locale,
  o: { type?: PageType; path: string; name: string; description?: string; mainEntity?: JsonLdNode; about?: JsonLdNode | JsonLdNode[] },
): JsonLdNode {
  const url = pageUrl(locale, o.path);
  return compact({
    "@type": o.type ?? "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: txt(withoutBrand(o.name)),
    description: txt(o.description),
    inLanguage: lang(locale),
    isPartOf: { "@id": WEBSITE_ID },
    about: o.about,
    mainEntity: o.mainEntity,
  });
}

/** An ordered list of links (services / industries / case studies index). */
export function itemList(name: string, items: Array<{ name: string; url: string }>): JsonLdNode {
  return {
    "@type": "ItemList",
    name: txt(name),
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: txt(it.name), url: it.url })),
  };
}

/** A service the company provides (services/<slug>, foreign-manufacturers). */
export function service(
  locale: Locale,
  o: { path: string; name: string; serviceType?: string; description?: string; audience?: string; subjectOf?: string[] },
): JsonLdNode {
  const url = pageUrl(locale, o.path);
  return compact({
    "@type": "Service",
    "@id": `${url}#service`,
    name: txt(o.name),
    serviceType: txt(o.serviceType ?? o.name),
    description: txt(o.description),
    url,
    provider: orgRef(),
    areaServed: egypt(locale),
    audience: o.audience ? { "@type": "BusinessAudience", audienceType: txt(o.audience) } : undefined,
    availableChannel: { "@type": "ServiceChannel", serviceUrl: pageUrl(locale, "contact"), servicePhone: SITE.phone.tel },
    /* Case studies that show the service (their Article @ids on the project pages). */
    subjectOf: o.subjectOf?.map((id) => ({ "@id": id })),
  });
}

/** @id of a case study's Article node (projects/<slug>), for subjectOf / mentions links. */
export const caseStudyId = (locale: Locale, slug: string) => `${pageUrl(locale, `projects/${slug}`)}#case-study`;

/** BreadcrumbList for <Breadcrumbs>: names are the visible labels without display controls. */
export function breadcrumbList(locale: Locale, trail: Array<{ label: string; path?: string }>): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((c, i) =>
      compact({ "@type": "ListItem", position: i + 1, name: cleanText(c.label), item: c.path !== undefined ? pageUrl(locale, c.path) : undefined }),
    ),
  };
}

/* ------------------------------------------------------------------ case studies */

/** Duration of an MP4 (moov/mvhd) as ISO 8601 ("PT1M5S"), read at build time; undefined if unreadable. */
function mp4Duration(publicPath: string): string | undefined {
  const file = `public${publicPath}`;
  if (!existsSync(file)) return undefined;
  const fd = openSync(file, "r");
  try {
    const size = fstatSync(fd).size;
    const read = (pos: number, len: number) => {
      const b = Buffer.alloc(len);
      readSync(fd, b, 0, len, pos);
      return b;
    };
    // walk boxes: top level → moov → mvhd
    const find = (start: number, end: number, type: string): [number, number] | undefined => {
      for (let pos = start; pos + 8 <= end; ) {
        const h = read(pos, 16);
        let len = h.readUInt32BE(0);
        const hdr = len === 1 ? 16 : 8;
        if (len === 1) len = Number(h.readBigUInt64BE(8));
        if (len === 0) len = end - pos;
        if (len < 8) return undefined;
        if (h.toString("latin1", 4, 8) === type) return [pos + hdr, pos + len];
        pos += len;
      }
      return undefined;
    };
    const moov = find(0, size, "moov");
    const mvhd = moov && find(moov[0], moov[1], "mvhd");
    if (!mvhd) return undefined;
    const b = read(mvhd[0], 32);
    const v1 = b[0] === 1;
    const timescale = v1 ? b.readUInt32BE(20) : b.readUInt32BE(12);
    const units = v1 ? Number(b.readBigUInt64BE(24)) : b.readUInt32BE(16);
    if (!timescale) return undefined;
    const s = Math.max(1, Math.round(units / timescale));
    return `PT${Math.floor(s / 60) ? `${Math.floor(s / 60)}M` : ""}${s % 60}S`;
  } catch {
    return undefined;
  } finally {
    closeSync(fd);
  }
}

interface CaseStudyCopy {
  title: string;
  cardTitle: string;
  summary: string;
  seoDescription: string;
}

/**
 * A bare date ("2026-09-15", the Facebook post day of a clip) as midnight in Cairo with its UTC offset, which schema.org
 * DateTime consumers expect ("2026-09-15T00:00:00+03:00"); full timestamps pass through unchanged.
 */
function withCairoOffset(date: string | undefined): string | undefined {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const noonUtc = new Date(`${date}T12:00:00Z`);
  const name = new Intl.DateTimeFormat("en", { timeZone: "Africa/Cairo", timeZoneName: "longOffset" }).formatToParts(noonUtc).find((p) => p.type === "timeZoneName")?.value;
  const offset = /GMT([+-]\d{2}:\d{2})/.exec(name ?? "")?.[1] ?? "+02:00";
  return `${date}T00:00:00${offset}`;
}

/**
 * Case study (CS-08): Article with publication dates of the page's own content (datePublished = when its copy first
 * existed, dateModified = when its copy, data record or photos last changed: src/data/content-dates.json, maintained by
 * scripts/content-dates.mjs — CS2-04), the project year as temporalCoverage (not a publication claim), localized
 * industries (about) and technologies (keywords), the brands as mentions, the generated 1200×630 card + the cover
 * photo as images, and the film as VideoObject.
 */
export function article(
  locale: Locale,
  o: {
    path: string;
    project: ProjectData;
    copy: CaseStudyCopy;
    coverUrl: string;
    industries: Array<{ name: string; path: string }>;
    location?: string;
    section?: string;
    videoTitle?: string;
  },
): JsonLdNode {
  const { project: p, copy: c } = o;
  const url = pageUrl(locale, o.path);
  const card = ogCard(locale, o.path);
  // dates of this page's own content (copy + data record + photos): scripts/content-dates.mjs, src/data/content-dates.json
  const { published, modified } = pageDates(url);
  const tech = p.technologies.join(" | ").toLowerCase();
  const video = p.video;
  return compact({
    "@type": "Article",
    "@id": `${url}#case-study`,
    headline: txt(c.title.length > 110 ? c.cardTitle : c.title),
    name: txt(c.cardTitle),
    description: txt(c.seoDescription),
    articleSection: txt(o.section),
    inLanguage: lang(locale),
    url,
    mainEntityOfPage: { "@id": `${url}#webpage`, "@type": "WebPage", url },
    isPartOf: { "@id": WEBSITE_ID },
    image: [card ? absUrl(card.url) : undefined, o.coverUrl].filter(Boolean),
    datePublished: published,
    dateModified: modified && published && Date.parse(modified) < Date.parse(published) ? published : modified,
    temporalCoverage: String(p.year),
    author: orgRef(),
    publisher: orgRef(),
    about: o.industries.map((i) => ({ "@type": "Thing", name: txt(i.name), url: pageUrl(locale, i.path) })),
    mentions: SITE.brands.filter((b) => tech.includes(b.toLowerCase())).map((b) => ({ "@type": "Brand", name: b })),
    keywords: p.technologies.map((t) => txt(techLabel(locale, t))).join(", "),
    contentLocation: o.location ? { "@type": "Place", name: txt(o.location) } : undefined,
    video: video
      ? compact({
          "@type": "VideoObject",
          name: txt(o.videoTitle ?? c.cardTitle),
          description: txt(c.summary),
          thumbnailUrl: absUrl(video.poster),
          contentUrl: absUrl(video.src),
          uploadDate: withCairoOffset(video.uploadDate),
          duration: mp4Duration(video.src),
          // no inLanguage: the clips have no speech (projects.ts video notes), so they are in no language
        })
      : undefined,
  });
}
