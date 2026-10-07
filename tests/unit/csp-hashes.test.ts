/**
 * integrations/csp-inline-hashes.mjs (CODE2-01): the per-page CSP <meta> lists exactly the page's inline scripts, and
 * the build fails closed instead of shipping a page whose boot script the browser would refuse.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { completePage, inlineScriptHashes, parsePolicy } from "../../integrations/csp-inline-hashes.mjs";

const sha = (body: string) => `'sha256-${createHash("sha256").update(body).digest("base64")}'`;
const META = (script: string) => `<meta http-equiv="content-security-policy" content="default-src 'self'; ${script}; style-src 'self' 'unsafe-inline'">`;
const page = (head: string, body = "") => `<!doctype html><html><head><meta charset="utf-8"><title>t</title>${head}</head><body>${body}</body></html>`;

describe("csp-inline-hashes", () => {
  it("hashes executable inline scripts only (not src scripts, JSON-LD or empty ones)", () => {
    const html = page(
      "",
      `<script>boot()</script><script type="module">mod()</script><script src="/a.js"></script><script type="application/ld+json">{"a":1}</script><script></script>`,
    );
    expect([...inlineScriptHashes(html)].sort()).toEqual([sha("boot()"), sha("mod()")].sort());
  });

  it("rewrites script-src with the page's own hashes and moves the meta right after <meta charset>", () => {
    const html = page(`<link rel="stylesheet" href="/s.css">${META("script-src 'self' 'sha256-stale='")}`, "<script>boot()</script>");
    const out = completePage(html, "x.html") ?? "";
    expect(out).toMatch(/<meta charset="utf-8"><meta http-equiv="content-security-policy"/);
    const policy = parsePolicy(/content="([^"]*)"/.exec(out.slice(out.indexOf("content-security-policy")))![1]!);
    expect(policy.get("script-src")).toEqual(["'self'", sha("boot()")]);
    expect(policy.get("style-src")).toEqual(["'self'", "'unsafe-inline'"]);
  });

  it("also handles script-src as the last directive (no trailing semicolon)", () => {
    const html = page(`<meta http-equiv="content-security-policy" content="default-src 'self'; script-src 'self'">`, "<script>x()</script>");
    expect(completePage(html, "x.html")).toContain(`script-src 'self' ${sha("x()")};`);
  });

  it("fails closed", () => {
    expect(() => completePage(page("", "<script>boot()</script>"), "no-meta.html")).toThrow(/no CSP <meta>/);
    expect(() => completePage(page(META("script-src 'self'") + META("script-src 'self'"), "<script>x()</script>"), "two.html")).toThrow(/2 CSP <meta>/);
    expect(() => completePage(page(META("img-src 'self'"), "<script>x()</script>"), "none.html")).toThrow(/no script-src/);
    expect(() => completePage(page(META("script-src 'self' 'unsafe-inline'"), "<script>x()</script>"), "ui.html")).toThrow(/unsafe-inline/);
  });

  it("a page with neither a meta nor inline scripts is left alone", () => {
    expect(completePage(page("", '<script src="/a.js"></script>'), "plain.html")).toBeNull();
  });
});
