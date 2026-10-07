/**
 * External link policy for link tokens in copy (`{link:ext:https://…|label}`, src/lib/text.ts).
 * One list, read by the text engine at render time (a token to any other host stays visible text, never a link) and by
 * scripts/check-i18n.mjs at build time (a message linking anywhere else fails the check).
 * Add a host only for an official, authoritative source (a government body, a standards organisation).
 * Plain .mjs (no imports) so the Node build scripts and the TypeScript engine can share it.
 */

/** Hosts copy may link to (https only, opened in a new tab). @type {readonly string[]} */
export const EXTERNAL_HOSTS = Object.freeze(["www.gafi.gov.eg", "gafi.gov.eg", "sczone.eg", "www.sczone.eg"]);
