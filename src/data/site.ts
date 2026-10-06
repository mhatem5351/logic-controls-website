/**
 * Language-neutral company facts. Keep these identical everywhere (NAP consistency for local SEO).
 * Translatable wording lives in src/i18n/messages/*.json.
 */
export const SITE = {
  name: "Logic Controls",
  url: "https://logic-controls.com",
  email: "info@logic-controls.com",
  salesEmail: "sales@logic-controls.com",
  phone: { display: "+20 110 319 7233", local: "011 0319 7233", tel: "+201103197233" },
  whatsapp: "201103197233",
  facebook: "https://www.facebook.com/profile.php?id=61585359185472",
  address: {
    locality: "6th of October City",
    region: "Giza",
    country: "EG",
  },
  geo: { lat: 29.9285, lng: 30.9188 },
  experienceYears: 4,
  projectsCount: 50,
  /** Public keys (safe to ship): Cloudflare Turnstile site key + Web Analytics beacon token. */
  turnstileSiteKey: "0x4AAAAAAFPM3y4LCAOP7pVT",
  webAnalyticsToken: "8a235c8b7d2f4e5ebcb2a0cf6fab5f61",
  /** Platforms the team programs and integrates. Not a partnership claim. */
  brands: ["Siemens", "Schneider Electric", "Delta", "LS Electric", "Wecon"],
} as const;

export function whatsappLink(message?: string) {
  const base = `https://wa.me/${SITE.whatsapp}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
