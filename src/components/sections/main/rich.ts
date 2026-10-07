/**
 * @deprecated Re-exports of the text engine for older imports. Import from "~/lib/text" instead (one module, one
 * argument order: html(locale, text)). Kept so existing imports keep working; see src/lib/text.ts for the rules and
 * the set:html contract (toHtml / SafeHtml).
 */
export { esc, ltr, html, plain, rich, emphasize, colon } from "~/lib/text";
