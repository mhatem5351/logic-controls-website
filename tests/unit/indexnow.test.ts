/**
 * scripts/indexnow.mjs (CS3-06): only URLs whose sitemap <lastmod> changed since the last accepted submission are sent,
 * plus new and removed ones; without a record (or with --all) every URL is.
 */
import { describe, expect, it } from "vitest";
import { serializeState, sitemapDates, toSubmit } from "../../scripts/indexnow.mjs";

const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://logic-controls.com/en/</loc><lastmod>2026-10-07T10:09:37+03:00</lastmod></url>
<url><loc>https://logic-controls.com/ar/about/</loc><lastmod>2026-10-06T15:10:10+03:00</lastmod><xhtml:link rel="alternate" hreflang="en" href="https://logic-controls.com/en/about/"/></url>
<url><loc>https://logic-controls.com/en/privacy/</loc></url></urlset>`;

describe("indexnow", () => {
  it("reads every <loc> with its <lastmod> as a path map", () => {
    expect(sitemapDates([SITEMAP])).toEqual({
      "/en/": "2026-10-07T10:09:37+03:00",
      "/ar/about/": "2026-10-06T15:10:10+03:00",
      "/en/privacy/": "",
    });
  });

  it("submits new, re-dated and removed paths only", () => {
    const current = { "/en/": "b", "/ar/about/": "a", "/en/new/": "a" };
    const submitted = { "/en/": "a", "/ar/about/": "a", "/en/gone/": "a" };
    expect(toSubmit(current, submitted)).toEqual({
      paths: ["/en/", "/en/gone/", "/en/new/"],
      added: ["/en/new/"],
      changed: ["/en/"],
      removed: ["/en/gone/"],
      full: false,
    });
    expect(toSubmit(current, { ...current }).paths).toEqual([]);
  });

  it("no record of a submission, or --all: every sitemap path", () => {
    const current = { "/en/": "b", "/ar/": "a" };
    expect(toSubmit(current, undefined)).toMatchObject({ paths: ["/ar/", "/en/"], full: true });
    expect(toSubmit(current, { ...current }, { all: true })).toMatchObject({ paths: ["/ar/", "/en/"], full: true });
  });

  it("records the state with sorted paths, 2-space indent and a trailing newline", () => {
    expect(serializeState({ "/en/": "b", "/ar/": "a" })).toBe('{\n  "/ar/": "a",\n  "/en/": "b"\n}\n');
  });
});
