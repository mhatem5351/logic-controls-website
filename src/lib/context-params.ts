/**
 * The page-context query parameters: one list for the language switcher (which carries them over to the other
 * language: src/components/LanguageSwitcher.astro) and for the scripts that read them. Dependency free, so it can be
 * imported by any client script.
 *
 * A parameter added to a reader belongs here too, or a language switch silently drops it (CODE2-21).
 */

/** The quote form preselects <select name="…"> from ?name=… (src/scripts/rfq-form.ts). */
export const FORM_PRESELECT = ["service", "industry", "location", "timeline"] as const;
/** What the quote form is about: ?project=<case-study slug>, ?intent=reference (src/scripts/rfq-form.ts). */
export const FORM_CONTEXT = ["project", "intent"] as const;
/** The project browser's filters (src/components/sections/catalog/ProjectBrowser.astro, an inline script). */
export const PROJECT_FILTERS = ["industry", "service", "platform"] as const;
/** The thanks page: the request number and how many files could not be attached (contact/thanks/index.astro). */
export const THANKS_PARAMS = ["ref", "skipped"] as const;

/** Every context parameter (campaign tags utm_* are kept as well: isContextParam). */
export const CONTEXT_PARAMS: readonly string[] = [
  ...new Set<string>([...FORM_PRESELECT, ...FORM_CONTEXT, ...PROJECT_FILTERS, ...THANKS_PARAMS]),
];

/** Is this query parameter part of the page context (kept across a language switch)? */
export const isContextParam = (key: string): boolean => CONTEXT_PARAMS.includes(key) || /^utm_[a-z]+$/.test(key);

/** The context part of a query string ("?service=x&utm_source=y", or "" when there is none). */
export function contextQuery(search: string): string {
  const kept = new URLSearchParams();
  new URLSearchParams(search).forEach((value, key) => isContextParam(key) && kept.append(key, value));
  const qs = kept.toString();
  return qs ? `?${qs}` : "";
}
