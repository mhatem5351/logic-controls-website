/**
 * Plain-text → safe HTML helpers for the main pages.
 *
 * Message strings are plain text (CONTENT.md). Components that render with `set:html` (Hero, SectionHeading,
 * CtaBand title, FAQ answers) must receive escaped HTML. The rules (Arabic <bdi> isolation of Latin runs, Chinese
 * word-aware line breaking, codes/brand names that never wrap) live in src/lib/text.ts, shared with the catalog
 * pages and the Card / Chips / FAQ components; this module keeps the (locale, text) call style of the main pages.
 */
export { esc, ltr, html, plain, rich, emphasize, num, colon, zhWords } from "~/lib/text";
