/**
 * worker/index.ts — "/" locale redirect and the /api/rfq form handler.
 *
 * Runs the real module in Node and calls its fetch() with a mocked env (ASSETS, RFQ_MAIL.send spy) and a mocked global
 * fetch for Turnstile's siteverify. @cloudflare/vitest-pool-workers is not used: its current release (0.22) needs
 * vitest ^4.1 and pins its own wrangler (4.124), while this repo runs vitest 5 and wrangler 4.147. The Worker only
 * uses web-standard APIs (Request, Response, FormData, fetch), which Node provides, so nothing is lost for these
 * cases; the real workerd runtime is exercised end to end by the Playwright suite (wrangler dev).
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";
import { REF_RE, RFQ_FILES, RFQ_MAX_BODY } from "../../src/lib/rfq-rules";

const ORIGIN = "https://logic-controls.com";
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type Attachment = { disposition: string; filename: string; type: string; content: ArrayBuffer };
type Mail = {
  from: { email: string; name?: string };
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: { email: string; name?: string };
  attachments?: Attachment[];
};

function makeEnv(over: Record<string, unknown> = {}) {
  const send = vi.fn(async (_m: Mail) => ({ messageId: "test" }));
  const assets = vi.fn(async (_req: Request) => new Response("asset", { status: 200 }));
  const env = {
    ASSETS: { fetch: assets },
    RFQ_MAIL: { send },
    OWNER_EMAIL: "owner@example.com",
    MAIL_FROM: "website@logic-controls.com",
    TURNSTILE_SECRET: "test-secret",
    ALLOWED_HOSTNAMES: "logic-controls.com, www.logic-controls.com",
    ...over,
  };
  return { env, send, assets };
}

/** Mocked siteverify: answers with `body` (or an HTTP error status). Records calls. */
function mockSiteverify(body: Record<string, unknown> = { success: true, hostname: "logic-controls.com" }, status = 200) {
  const fn = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    status === 200 ? Response.json(body) : new Response("error", { status }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

const call = (req: Request, env: ReturnType<typeof makeEnv>["env"]) => worker.fetch(req, env as never, {} as never);

function get(path: string, headers: Record<string, string> = {}, method = "GET") {
  return new Request(ORIGIN + path, { method, headers });
}

function rfq(fields: Record<string, string>, { json = true, headers = {} as Record<string, string>, files = [] as File[] } = {}) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  for (const f of files) body.append(RFQ_FILES.field, f);
  return new Request(`${ORIGIN}/api/rfq`, {
    method: "POST",
    body,
    headers: { ...(json ? { Accept: "application/json" } : { Accept: "text/html" }), ...headers },
  });
}

/**
 * What a browser sends: the serialized multipart body WITH its Content-Length. (Node's new Request({ body: FormData })
 * streams without one, so rfq() always takes the Worker's capped-read path.)
 */
async function rfqWithLength(fields: Record<string, string>, files: File[] = [], length?: string) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  for (const f of files) form.append(RFQ_FILES.field, f);
  const serialized = new Response(form);
  const body = new Uint8Array(await serialized.arrayBuffer());
  return new Request(`${ORIGIN}/api/rfq`, {
    method: "POST",
    body,
    headers: { "Content-Type": serialized.headers.get("Content-Type")!, "Content-Length": length ?? String(body.byteLength), Accept: "application/json" },
  });
}

const VALID = {
  name: "Ahmed Ali",
  company: "Nile Foods",
  phone: "+20 100 000 0000",
  email: "ahmed@example.com",
  service: "process-control",
  industry: "food-beverage",
  message: "Pasteurizer upgrade",
  locale: "ar",
  consent: "yes",
  "cf-turnstile-response": "token-123",
};

/** A file whose first bytes are `head` (a real signature or not), padded to `size` bytes. */
function file(name: string, head: string | number[], size = 1024, type = "application/octet-stream") {
  const bytes = new Uint8Array(size);
  bytes.set(typeof head === "string" ? [...head].map((c) => c.charCodeAt(0)) : head);
  return new File([bytes], name, { type });
}
const PDF = (name = "drawing.pdf", size = 2048) => file(name, "%PDF-1.7\n", size, "application/pdf");
const PNG = (name = "panel.png", size = 2048) => file(name, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], size, "image/png");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ "/" locale negotiation */

describe("GET / → 302 to the visitor's language", () => {
  const target = async (headers: Record<string, string>, path = "/") => {
    const res = await call(get(path, headers), makeEnv().env);
    expect(res.status).toBe(302);
    return res.headers.get("Location");
  };

  it.each([
    [{}, "/en/"],
    [{ "Accept-Language": "ar" }, "/ar/"],
    [{ "Accept-Language": "ar-EG,ar;q=0.9,en;q=0.8" }, "/ar/"],
    [{ "Accept-Language": "zh-CN,zh;q=0.9" }, "/zh/"],
    [{ "Accept-Language": "zh-TW" }, "/zh/"],
    [{ "Accept-Language": "zh-Hant-HK" }, "/zh/"],
    [{ "Accept-Language": "tr-TR,tr;q=0.9" }, "/tr/"],
    [{ "Accept-Language": "EN-us" }, "/en/"],
    [{ "Accept-Language": "fr-FR,de;q=0.8" }, "/en/"],
    [{ "Accept-Language": "*" }, "/en/"],
    [{ "Accept-Language": "" }, "/en/"],
    [{ "Accept-Language": ";;;,,q=" }, "/en/"],
  ])("%j → %s", async (headers, expected) => {
    expect(await target(headers)).toBe(expected);
  });

  it("q-values decide, not order", async () => {
    expect(await target({ "Accept-Language": "en;q=0.5, tr;q=0.9, ar;q=0.7" })).toBe("/tr/");
    expect(await target({ "Accept-Language": "en;q=0.1, ar" })).toBe("/ar/");
  });

  it("equal q-values keep the header order", async () => {
    expect(await target({ "Accept-Language": "tr;q=0.8, ar;q=0.8" })).toBe("/tr/");
  });

  it("unsupported languages are skipped in favour of the next supported one", async () => {
    expect(await target({ "Accept-Language": "fr, de;q=0.9, ar;q=0.3" })).toBe("/ar/");
  });

  it("a malformed q-value counts as 0", async () => {
    expect(await target({ "Accept-Language": "ar;q=abc, tr;q=0.1" })).toBe("/tr/");
  });

  // RFC 9110 §12.5.4: q=0 means "not acceptable": never pick it, even when nothing else matches.
  it("q=0 marks a language as not acceptable", async () => {
    expect(await target({ "Accept-Language": "ar;q=0, fr" })).toBe("/en/");
    expect(await target({ "Accept-Language": "ar;q=0.0, tr;q=0.2" })).toBe("/tr/");
    expect(await target({ "Accept-Language": "zh;q=0.000" })).toBe("/en/");
  });

  it("the lang cookie wins over Accept-Language", async () => {
    expect(await target({ Cookie: "lang=tr", "Accept-Language": "ar" })).toBe("/tr/");
    expect(await target({ Cookie: "theme=dark; lang=zh; x=1", "Accept-Language": "en" })).toBe("/zh/");
  });

  it("an unknown or look-alike cookie is ignored", async () => {
    expect(await target({ Cookie: "lang=fr", "Accept-Language": "ar" })).toBe("/ar/");
    expect(await target({ Cookie: "xlang=tr", "Accept-Language": "ar" })).toBe("/ar/");
    expect(await target({ Cookie: "lang=english", "Accept-Language": "ar" })).toBe("/ar/");
  });

  it("keeps the query string (campaign parameters survive the redirect)", async () => {
    expect(await target({ "Accept-Language": "ar" }, "/?utm_source=x&b=1")).toBe("/ar/?utm_source=x&b=1");
  });

  it("is private, uncached and varies on the inputs", async () => {
    const res = await call(get("/"), makeEnv().env);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("Vary")).toBe("Accept-Language, Cookie");
  });

  it("carries the site's security headers (the Worker's responses bypass public/_headers)", async () => {
    const res = await call(get("/"), makeEnv().env);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("Strict-Transport-Security")).toContain("max-age=31536000");
  });

  it("HEAD / redirects too; other methods and paths go to static assets untouched", async () => {
    const head = await call(get("/", { "Accept-Language": "tr" }, "HEAD"), makeEnv().env);
    expect(head.status).toBe(302);
    expect(head.headers.get("Location")).toBe("/tr/");

    const { env, assets } = makeEnv();
    const post = get("/", {}, "POST");
    expect((await call(post, env)).status).toBe(200);
    const page = get("/en/services/");
    await call(page, env);
    expect(assets).toHaveBeenCalledTimes(2);
    expect(assets.mock.calls[0]![0]).toBe(post);
    expect(assets.mock.calls[1]![0]).toBe(page);
  });
});

/* ------------------------------------------------------------------ /api/rfq */

describe("/api/rfq", () => {
  let verify: ReturnType<typeof mockSiteverify>;
  beforeEach(() => {
    verify = mockSiteverify();
  });

  it("405 with Allow: POST on GET (and any non-POST method)", async () => {
    for (const method of ["GET", "PUT", "DELETE"]) {
      const res = await call(get("/api/rfq", {}, method), makeEnv().env);
      expect(res.status, method).toBe(405);
      expect(res.headers.get("Allow")).toBe("POST");
    }
  });

  describe("request guard (before the body is parsed)", () => {
    it("400 invalid when the body is not form data", async () => {
      for (const type of ["application/json", "text/plain"]) {
        const req = new Request(`${ORIGIN}/api/rfq`, { method: "POST", body: "{}", headers: { "Content-Type": type, Accept: "application/json" } });
        const res = await call(req, makeEnv().env);
        expect(res.status, type).toBe(400);
        expect(await res.json()).toEqual({ ok: false, error: "invalid" });
      }
    });

    it("413 attachments when Content-Length is over the cap; the no-JS redirect keeps the form's language (Referer)", async () => {
      const { env, send } = makeEnv();
      const big = String(RFQ_MAX_BODY + 1);
      const json = await call(
        new Request(`${ORIGIN}/api/rfq`, { method: "POST", body: "x", headers: { "Content-Type": "multipart/form-data; boundary=x", "Content-Length": big, Accept: "application/json" } }),
        env,
      );
      expect(json.status).toBe(413);
      expect(await json.json()).toEqual({ ok: false, error: "attachments" });
      const form = await call(
        new Request(`${ORIGIN}/api/rfq`, {
          method: "POST",
          body: "x",
          headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": big, Referer: `${ORIGIN}/tr/contact/` },
        }),
        env,
      );
      expect(form.status).toBe(303);
      expect(form.headers.get("Location")).toBe("/tr/contact/?error=attachments#rfq-error-attachments");
      expect(send).not.toHaveBeenCalled();
      expect(verify).not.toHaveBeenCalled();
    });

    it("a browser's body with a Content-Length is parsed natively (req.formData), files included", async () => {
      const { env, send } = makeEnv();
      const native = vi.spyOn(Request.prototype, "formData");
      const req = await rfqWithLength(VALID, [PDF("drawing.pdf"), PNG()]);
      expect(Number(req.headers.get("Content-Length"))).toBeGreaterThan(4096);
      const res = await call(req, env);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, ref: expect.stringMatching(REF_RE) });
      expect(native).toHaveBeenCalledTimes(1); // not the capped stream read
      const mail = send.mock.calls[0]![0];
      expect(mail.attachments!.map((a) => [a.filename, a.content.byteLength])).toEqual([
        ["drawing.pdf", 2048],
        ["panel.png", 2048],
      ]);
      expect(mail.replyTo).toEqual({ email: "ahmed@example.com", name: "Ahmed Ali" });
    });

    it("413 when the Content-Length is not a number (never parsed)", async () => {
      const { env, send } = makeEnv();
      const res = await call(await rfqWithLength(VALID, [], "12abc"), env);
      expect(res.status).toBe(413);
      expect(await res.json()).toEqual({ ok: false, error: "attachments" });
      expect(send).not.toHaveBeenCalled();
    });

    it("413 when a body without Content-Length streams past the cap", async () => {
      const res = await call(rfq(VALID, { files: [PDF("huge.pdf", RFQ_MAX_BODY + 10)] }), makeEnv().env);
      expect(res.status).toBe(413);
      expect(await res.json()).toEqual({ ok: false, error: "attachments" });
    });
  });

  describe("honeypot", () => {
    it("pretends success (JSON, with a reference) and sends nothing", async () => {
      const { env, send } = makeEnv();
      const res = await call(rfq({ ...VALID, lc_hp: "http://spam.example" }), env);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; ref: string };
      expect(body.ok).toBe(true);
      expect(body.ref).toMatch(REF_RE);
      expect(send).not.toHaveBeenCalled();
      expect(verify).not.toHaveBeenCalled();
    });
    it("pretends success (form post → 303 to the thanks page of the form's language)", async () => {
      const { env, send } = makeEnv();
      const res = await call(rfq({ ...VALID, locale: "zh", lc_hp: "x" }, { json: false }), env);
      expect(res.status).toBe(303);
      expect(res.headers.get("Location")).toMatch(/^\/zh\/contact\/thanks\/\?ref=LC-[0-9A-Z]{5}$/);
      expect(send).not.toHaveBeenCalled();
    });
    it("a whitespace-only honeypot is not a bot", async () => {
      const { env, send } = makeEnv();
      await call(rfq({ ...VALID, lc_hp: "   " }), env);
      expect(send).toHaveBeenCalledOnce();
    });
  });

  describe("validation → 422 invalid", () => {
    it.each([
      ["name missing", { name: "" }],
      ["name only spaces", { name: "   " }],
      ["name of one letter", { name: "A" }],
      ["neither phone nor email", { phone: "", email: "" }],
      ["phone malformed", { phone: "12" }],
      ["phone with letters", { phone: "call me +20 100" }],
      ["email malformed", { email: "not-an-email" }],
      ["email without TLD", { email: "a@b" }],
      // CODE2-20: an address that would change the Reply-To header is a field error, not a failed send
      ["email with a second address", { email: "ahmed@example.com, other@example.com" }],
      ["email with a header bracket", { email: "ahmed@example.com>" }],
      ["email with ';bcc'", { email: "ahmed@example.com;bcc" }],
      ["email with angle brackets in the local part", { email: "a<b>@example.com" }],
      ["consent missing", { consent: "" }],
      ["consent not 'yes'", { consent: "on" }],
    ])("%s", async (_, over) => {
      const { env, send } = makeEnv();
      const res = await call(rfq({ ...VALID, ...over }), env);
      expect(res.status).toBe(422);
      expect(await res.json()).toEqual({ ok: false, error: "invalid" });
      expect(send).not.toHaveBeenCalled();
      expect(verify).not.toHaveBeenCalled();
    });

    it("form post: 303 back to the localized form, the hash targets the no-JS alert", async () => {
      const res = await call(rfq({ ...VALID, name: "" }, { json: false }), makeEnv().env);
      expect(res.status).toBe(303);
      expect(res.headers.get("Location")).toBe("/ar/contact/?error=invalid#rfq-error-invalid");
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    });

    it("phone OR email: email only (zh visitors) is enough, and then there is no WhatsApp link", async () => {
      const { env, send } = makeEnv();
      const res = await call(rfq({ ...VALID, phone: "", locale: "zh" }), env);
      expect(res.status).toBe(200);
      const mail = send.mock.calls[0]![0];
      expect(mail.replyTo).toEqual({ email: "ahmed@example.com", name: "Ahmed Ali" });
      expect(mail.html).not.toContain("wa.me");
      expect(mail.text).not.toContain("Phone / WhatsApp");
    });

    it("phone only: email is optional (no Reply-To)", async () => {
      const { env, send } = makeEnv();
      const res = await call(rfq({ ...VALID, email: "" }), env);
      expect(res.status).toBe(200);
      expect(send.mock.calls[0]![0].replyTo).toBeUndefined();
    });

    it("an unknown locale falls back to the Referer's language, then English", async () => {
      const res = await call(rfq({ ...VALID, name: "", locale: "fr" }, { json: false }), makeEnv().env);
      expect(res.headers.get("Location")).toBe("/en/contact/?error=invalid#rfq-error-invalid");
      const ref = await call(rfq({ ...VALID, name: "", locale: "fr" }, { json: false, headers: { Referer: `${ORIGIN}/ar/contact/` } }), makeEnv().env);
      expect(ref.headers.get("Location")).toBe("/ar/contact/?error=invalid#rfq-error-invalid");
    });
  });

  describe("Turnstile → 403 verification", () => {
    const expect403 = async (env: ReturnType<typeof makeEnv>["env"], fields = VALID) => {
      const res = await call(rfq(fields), env);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ ok: false, error: "verification" });
    };

    it("no token: rejected without calling siteverify", async () => {
      const { env, send } = makeEnv();
      await expect403(env, { ...VALID, "cf-turnstile-response": "" });
      expect(verify).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    });

    it("siteverify says success: false", async () => {
      mockSiteverify({ success: false, "error-codes": ["invalid-input-response"] });
      const { env, send } = makeEnv();
      await expect403(env);
      expect(send).not.toHaveBeenCalled();
    });

    it("token issued for another hostname", async () => {
      mockSiteverify({ success: true, hostname: "evil.example" });
      await expect403(makeEnv().env);
    });

    it("siteverify HTTP error", async () => {
      mockSiteverify({}, 500);
      await expect403(makeEnv().env);
    });

    it("siteverify unreachable or timed out (the call carries an abort signal): fails closed, no throw", async () => {
      const fn = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => {
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      });
      vi.stubGlobal("fetch", fn);
      await expect403(makeEnv().env);
      expect(fn).toHaveBeenCalledOnce();
    });

    it("no TURNSTILE_SECRET configured: fails closed", async () => {
      const { env } = makeEnv({ TURNSTILE_SECRET: undefined });
      await expect403(env);
      expect(verify).not.toHaveBeenCalled();
    });

    it("form post: 303 back with ?error=verification", async () => {
      mockSiteverify({ success: false });
      const res = await call(rfq({ ...VALID, locale: "tr" }, { json: false }), makeEnv().env);
      expect(res.status).toBe(303);
      expect(res.headers.get("Location")).toBe("/tr/contact/?error=verification#rfq-error-verification");
    });

    it("sends secret, token and the visitor IP to siteverify", async () => {
      await call(rfq(VALID, { headers: { "CF-Connecting-IP": "203.0.113.7" } }), makeEnv().env);
      expect(verify).toHaveBeenCalledOnce();
      const [url, init] = verify.mock.calls[0]!;
      expect(String(url)).toBe(SITEVERIFY);
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({ secret: "test-secret", response: "token-123", remoteip: "203.0.113.7" });
    });

    it("accepts a token without hostname (test keys) and the www hostname", async () => {
      mockSiteverify({ success: true });
      expect((await call(rfq(VALID), makeEnv().env)).status).toBe(200);
      mockSiteverify({ success: true, hostname: "www.logic-controls.com" });
      expect((await call(rfq(VALID), makeEnv().env)).status).toBe(200);
    });
  });

  describe("success", () => {
    it("JSON: 200 {ok:true, ref}, no-store", async () => {
      const res = await call(rfq(VALID), makeEnv().env);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; ref: string };
      expect(body).toEqual({ ok: true, ref: expect.stringMatching(REF_RE) });
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    });

    it("form post (no JS): 303 to the localized thanks page with the reference", async () => {
      const { env, send } = makeEnv();
      const res = await call(rfq(VALID, { json: false }), env);
      expect(res.status).toBe(303);
      const loc = res.headers.get("Location")!;
      expect(loc).toMatch(/^\/ar\/contact\/thanks\/\?ref=LC-[0-9A-Z]{5}$/);
      expect(send.mock.calls[0]![0].subject).toContain(loc.split("ref=")[1]);
    });

    it("emails the owner: labelled subject with the reference, sender, reply-to, text and HTML with every filled field", async () => {
      const { env, send } = makeEnv();
      const res = await call(rfq({ ...VALID, location: "obour", timeline: "1-3-months", country: "Egypt", page: "/ar/services/" }), env);
      const { ref } = (await res.json()) as { ref: string };
      expect(send).toHaveBeenCalledOnce();
      const mail = send.mock.calls[0]![0];
      expect(mail.to).toBe("owner@example.com");
      expect(mail.from).toEqual({ email: "website@logic-controls.com", name: "Logic Controls Website" });
      expect(mail.replyTo).toEqual({ email: "ahmed@example.com", name: "Ahmed Ali" });
      expect(mail.subject).toBe(`[Website AR] Process control (temperature, CIP, batching) — Nile Foods · ${ref}`);
      expect(mail.text).toBe(
        [
          "Name: Ahmed Ali",
          "Company: Nile Foods",
          "Phone / WhatsApp: +20 100 000 0000",
          "Email: ahmed@example.com",
          "Service: Process control (temperature, CIP, batching)",
          "Timeline: In 1 to 3 months",
          "Industry: Food, beverage and dairy",
          "Factory location: Obour City",
          "Country: Egypt",
          "Project details: Pasteurizer upgrade",
          "Sent from page: /ar/services/",
          "Consent: Yes (privacy notice accepted on the form)",
          `Reference: ${ref}`,
          "",
          "Reply on WhatsApp: https://wa.me/201000000000",
          "Call: +201000000000",
        ].join("\n") + "\n\nLanguage: ar",
      );
      expect(mail.html).toContain(`New website inquiry (AR) · ${ref}`);
      expect(mail.html).toContain('<a href="https://wa.me/201000000000">Reply on WhatsApp</a>');
      expect(mail.html).toContain('<a href="tel:+201000000000">');
      expect(mail.html).toContain('dir="auto">Nile Foods</td>');
      expect(mail.attachments).toBeUndefined();
    });

    it("subject falls back to Inquiry / the person's name", async () => {
      const { env, send } = makeEnv();
      await call(rfq({ ...VALID, service: "", company: "", locale: "en" }), env);
      expect(send.mock.calls[0]![0].subject).toMatch(/^\[Website EN\] Inquiry — Ahmed Ali · LC-[0-9A-Z]{5}$/);
    });

    it("an unknown select value is shown as sent (one line, capped), never as HTML", async () => {
      const { env, send } = makeEnv();
      await call(rfq({ ...VALID, service: "<b>x</b>", industry: "made-up" }), env);
      const mail = send.mock.calls[0]![0];
      expect(mail.subject).toContain("] <b>x</b> — ");
      expect(mail.text).toContain("Industry: made-up");
      expect(mail.html).toContain("&lt;b&gt;x&lt;/b&gt;");
    });

    it("urgent ('a machine is stopped'): [URGENT] subject prefix, first line of the text, banner in the HTML", async () => {
      const { env, send } = makeEnv();
      await call(rfq({ ...VALID, timeline: "urgent", service: "maintenance-support" }), env);
      const mail = send.mock.calls[0]![0];
      expect(mail.subject).toMatch(/^\[URGENT\] \[Website AR\] Troubleshooting or maintenance — Nile Foods · LC-/);
      expect(mail.text.startsWith("URGENT: a machine is stopped.\n\n")).toBe(true);
      expect(mail.text).toContain("Timeline: Urgent: a machine is stopped");
      expect(mail.html).toContain("URGENT: a machine is stopped</p>");
      // not urgent → no flag
      await call(rfq({ ...VALID, timeline: "planning" }), env);
      expect(send.mock.calls[1]![0].subject.startsWith("[Website AR]")).toBe(true);
    });

    it("escapes HTML in every field of the HTML email", async () => {
      const { env, send } = makeEnv();
      const evil = `<script>alert("x")</script> & 'q'`;
      await call(rfq({ ...VALID, name: evil, company: `<img src=x onerror=alert(1)>`, message: evil }), env);
      const { html, text } = send.mock.calls[0]![0];
      expect(html).not.toContain("<script>");
      expect(html).not.toContain("<img");
      expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;q&#39;");
      expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
      expect(text).toContain(`Name: ${evil}`); // the text part stays verbatim (it is plain text)
    });

    it("strips CR/LF and other control characters from header-bound fields (subject, Reply-To name)", async () => {
      const { env, send } = makeEnv();
      const CR = String.fromCharCode(13), LF = String.fromCharCode(10), NUL = String.fromCharCode(0), LS = String.fromCharCode(0x2028);
      await call(
        rfq({ ...VALID, name: `Ahmed${CR}${LF}Bcc: x@evil.example`, company: `Nile${LF}Subject: hi${NUL}${LS}Foods`, service: `process-control${CR}${LF}X: y` }),
        env,
      );
      const mail = send.mock.calls[0]![0];
      for (const s of [mail.subject, mail.replyTo!.name!]) {
        expect([...s].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 0x2028)).toBe(false);
      }
      expect(mail.replyTo!.name).toBe("Ahmed Bcc: x@evil.example");
      expect(mail.subject).toContain("Nile Subject: hi Foods");
      expect(mail.text).toContain("Name: Ahmed Bcc: x@evil.example\n");
    });

    it("strips bidi override characters (they could reverse what the owner reads in the subject)", async () => {
      const { env, send } = makeEnv();
      const RLO = String.fromCharCode(0x202e), PDI = String.fromCharCode(0x2069);
      await call(rfq({ ...VALID, company: `${RLO}gpj.exe${PDI} Foods` }), env);
      expect(send.mock.calls[0]![0].subject).toContain("— gpj.exe Foods ·");
    });

    it("the description keeps its line breaks (and only those)", async () => {
      const { env, send } = makeEnv();
      const CR = String.fromCharCode(13), BEL = String.fromCharCode(7);
      await call(rfq({ ...VALID, message: `Line 1${CR}\nLine 2${BEL}\n\n\n\nLine 3` }), env);
      expect(send.mock.calls[0]![0].text).toContain("Project details: Line 1\nLine 2\n\nLine 3\n");
    });

    it("message falls back to the selected labels, then to a placeholder, when step 2 was skipped", async () => {
      const { env, send } = makeEnv();
      await call(rfq({ ...VALID, message: "", timeline: "urgent" }), env);
      expect(send.mock.calls[0]![0].text).toContain("Project details: Process control (temperature, CIP, batching) · Food, beverage and dairy · Urgent: a machine is stopped");
      await call(rfq({ ...VALID, message: "  ", service: "", industry: "" }), env);
      expect(send.mock.calls[1]![0].text).toContain("Project details: (no details provided)");
    });

    it("trims fields and caps their length to the form's limits (message 2000, name 120, company 160)", async () => {
      const { env, send } = makeEnv();
      await call(rfq({ ...VALID, name: `  ${"n".repeat(400)}  `, company: "c".repeat(400), message: "m".repeat(6000) }), env);
      const { text } = send.mock.calls[0]![0];
      expect(text).toContain(`Name: ${"n".repeat(120)}\n`);
      expect(text).toContain(`Company: ${"c".repeat(160)}\n`);
      expect(text).toContain(`Project details: ${"m".repeat(2000)}\n`);
    });

    it("ignores fields outside the contract (no header or HTML injection through extra fields)", async () => {
      const { env, send } = makeEnv();
      await call(rfq({ ...VALID, bcc: "x@evil.example", "<b>": "x" }), env);
      const mail = send.mock.calls[0]![0];
      expect(Object.keys(mail).sort()).toEqual(["from", "html", "replyTo", "subject", "text", "to"]);
      expect(mail.text).not.toContain("evil");
    });

    it("uses the browser's dirname values for the HTML cells (RTL descriptions stay RTL)", async () => {
      const { env, send } = makeEnv();
      await call(rfq({ ...VALID, "message.dir": "rtl", "company.dir": "ltr", "name.dir": "bogus" }), env);
      const { html } = send.mock.calls[0]![0];
      expect(html).toContain('dir="rtl">Pasteurizer upgrade</td>');
      expect(html).toContain('dir="ltr">Nile Foods</td>');
      expect(html).toContain('dir="auto">Ahmed Ali</td>');
    });
  });

  describe("phone → WhatsApp / call links (UX2-02: never a link that dials a stranger)", () => {
    it.each([
      ["01001234567", "ar", {}, "201001234567"], // Egyptian mobile, local format
      ["010 0123 4567", "en", {}, "201001234567"],
      ["1001234567", "ar", {}, "201001234567"], // the leading 0 dropped (was wa.me/1001234567 = +1)
      ["٠١٠٠١٢٣٤٥٦٧", "ar", {}, "201001234567"], // Arabic-Indic digits
      ["0020 100 123 4567", "zh", {}, "201001234567"],
      ["+20 (100) 123-4567", "tr", {}, "201001234567"],
      ["+90 532 123 45 67", "en", {}, "905321234567"], // international numbers are kept
      ["+86 138 0013 8000", "en", {}, "8613800138000"],
      ["0532 123 45 67", "tr", {}, "905321234567"], // Turkish mobile on the Turkish form
      ["138 0013 8000", "zh", {}, "8613800138000"], // Chinese mobile on the Chinese form
      ["0532 123 45 67", "en", { country: "Turkey" }, "905321234567"], // the country field decides
      ["010 1234 5678", "zh", { location: "ain-sokhna" }, "201012345678"], // an Egyptian plant location decides
    ])("%s (%s, %j) → wa.me/%s", async (phone, locale, extra, wa) => {
      const { env, send } = makeEnv();
      await call(rfq({ ...VALID, phone, locale, ...extra }), env);
      const { html, text } = send.mock.calls[0]![0];
      expect(html).toContain(`<a href="https://wa.me/${wa}">Reply on WhatsApp</a>`);
      expect(html).toContain(`<a href="tel:+${wa}">`);
      expect(text).toContain(`Reply on WhatsApp: https://wa.me/${wa}`);
      expect(text).not.toContain("No recognisable country code");
    });

    it.each([
      ["0532 123 45 67", "en", {}], // was wa.me/05321234567 (invalid) + "Call: +05321234567"
      ["138 0013 8000", "en", {}], // was wa.me/13800138000 = a North American number
      ["010 1234 5678", "zh", {}], // Egyptian mobile or Beijing landline
      ["0501234567", "ar", {}], // a Gulf mobile in local format
      ["01001234567", "en", { country: "Germany" }],
      ["+05321234567", "en", {}],
    ])("%s (%s, %j) → no link, the number as typed and a 'check the country code' note", async (phone, locale, extra) => {
      const { env, send } = makeEnv();
      const res = await call(rfq({ ...VALID, phone, locale, ...extra }), env);
      expect(res.status).toBe(200);
      const { html, text } = send.mock.calls[0]![0];
      expect(html).not.toContain("wa.me");
      expect(html).not.toContain('href="tel:');
      expect(text).not.toContain("wa.me");
      expect(text).toContain(`Phone ${phone}: No recognisable country code: check the number before calling or messaging (no WhatsApp / call link).`);
      expect(html).toContain("No recognisable country code");
    });
  });

  describe("attachments", () => {
    it("forwards up to 3 files as email attachments (binary, safe names, MIME type from the extension)", async () => {
      const { env, send } = makeEnv();
      const res = await call(rfq(VALID, { files: [PDF("../../etc/I-O list.pdf"), PNG("panel.PNG"), file("layout.dwg", "AC1032", 4096)] }), env);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, ref: expect.stringMatching(REF_RE) }); // nothing skipped: no key
      const { attachments, text } = send.mock.calls[0]![0];
      expect(attachments!.map((a) => [a.filename, a.type, a.disposition, a.content.byteLength])).toEqual([
        ["I-O list.pdf", "application/pdf", "attachment", 2048],
        ["panel.PNG", "image/png", "attachment", 2048],
        ["layout.dwg", "application/octet-stream", "attachment", 4096],
      ]);
      expect(new Uint8Array(attachments![0]!.content).subarray(0, 4)).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
      expect(text).toContain("Attachments: I-O list.pdf (2 KB), panel.PNG (2 KB), layout.dwg (4 KB)");
    });

    it("accepts real CAD and PDF files the old check rejected (binary DXF, DXF with a BOM, PDF with leading bytes)", async () => {
      const real = (fixtureName: string, name: string) => {
        const head = new Uint8Array(readFileSync(new URL(`./fixtures/rfq/${fixtureName}.head`, import.meta.url)));
        return file(name, [...head], 4096);
      };
      const { env, send } = makeEnv();
      const res = await call(rfq(VALID, { files: [real("r2018-binary.dxf", "binary.dxf"), real("r2018-ascii-bom.dxf", "bom.dxf"), real("pdf-leading-crlf.pdf", "drawing.pdf")] }), env);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, ref: expect.stringMatching(REF_RE) });
      expect(send.mock.calls[0]![0].attachments!.map((a) => a.filename)).toEqual(["binary.dxf", "bom.dxf", "drawing.pdf"]);
    });

    it("an empty file input (nothing chosen) is not an attachment", async () => {
      const { env, send } = makeEnv();
      await call(rfq(VALID, { files: [new File([], "", { type: "application/octet-stream" })] }), env);
      expect(send.mock.calls[0]![0].attachments).toBeUndefined();
    });

    it("control characters in a filename never reach the email", async () => {
      const { env, send } = makeEnv();
      await call(rfq(VALID, { files: [PDF(`a${String.fromCharCode(13, 10)}b.pdf`)] }), env);
      expect(send.mock.calls[0]![0].attachments![0]!.filename).toBe("a b.pdf");
    });

    it.each([
      ["more than 3 files", () => [PDF("1.pdf"), PDF("2.pdf"), PDF("3.pdf"), PDF("4.pdf")], { problem: "count" }],
      ["over 4 MB in total (but under the body cap)", () => [PDF("1.pdf", 2 * 1024 * 1024), PDF("2.pdf", 2 * 1024 * 1024 + 10)], { problem: "size" }],
      ["a type the form does not accept", () => [PDF("ok.pdf"), file("setup.exe", "MZ")], { problem: "type", files: ["setup.exe"] }],
      // the type comes first (the answer names the files to remove), even when the count or the size is wrong too
      [
        "4 files, one of a type the form does not accept",
        () => [PDF("1.pdf"), PDF("2.pdf"), PDF("3.pdf"), file("setup.exe", "MZ")],
        { problem: "type", files: ["setup.exe"] },
      ],
      [
        "over 4 MB and a type the form does not accept",
        () => [PDF("1.pdf", 2 * 1024 * 1024), PDF("2.pdf", 2 * 1024 * 1024 + 10), file("notes.docx", "PK")],
        { problem: "type", files: ["notes.docx"] },
      ],
      ["no extension", () => [file("drawing", "%PDF")], { problem: "type", files: ["drawing"] }],
    ])("422 attachments: %s (checked before Turnstile; the answer says which problem and which files)", async (_, files, detail) => {
      const { env, send } = makeEnv();
      const res = await call(rfq(VALID, { files: files() }), env);
      expect(res.status).toBe(422);
      expect(await res.json()).toEqual({ ok: false, error: "attachments", ...detail });
      expect(verify).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    });

    it("a file whose content does not match its extension is left out and named (the request is still sent; UX2-05)", async () => {
      const { env, send } = makeEnv();
      const res = await call(rfq(VALID, { files: [file("quote.pdf", "MZ"), PNG()] }), env);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, ref: expect.stringMatching(REF_RE), skipped: ["quote.pdf"] });
      const mail = send.mock.calls[0]![0];
      expect(mail.attachments!.map((a) => a.filename)).toEqual(["panel.png"]);
      expect(mail.text).toContain("Attachments: panel.png (2 KB)");
      expect(mail.text).toContain("Not attached: quote.pdf (the content does not match the file type; ask the sender to email it)");
    });

    it("no-JS: a skipped file → 303 to the thanks page with &skipped=n", async () => {
      const res = await call(rfq({ ...VALID, locale: "tr" }, { json: false, files: [file("a.dxf", [0, 1, 2, 3]), file("b.pdf", "nope")] }), makeEnv().env);
      expect(res.status).toBe(303);
      expect(res.headers.get("Location")).toMatch(/^\/tr\/contact\/thanks\/\?ref=LC-[0-9A-Z]{5}&skipped=2$/);
    });

    it("no-JS form post: 303 back with ?error=attachments", async () => {
      const res = await call(rfq({ ...VALID, locale: "zh" }, { json: false, files: [file("a.exe", "MZ")] }), makeEnv().env);
      expect(res.headers.get("Location")).toBe("/zh/contact/?error=attachments#rfq-error-attachments");
    });
  });

  describe("urgency (UX2-06)", () => {
    it("troubleshooting without a timeline ('Skip and send now') → [URGENT?] and a 'call first' banner", async () => {
      const { env, send } = makeEnv();
      await call(rfq({ ...VALID, service: "maintenance-support", timeline: "" }), env);
      const mail = send.mock.calls[0]![0];
      expect(mail.subject).toMatch(/^\[URGENT\?\] \[Website AR\] Troubleshooting or maintenance — Nile Foods · LC-/);
      expect(mail.text.startsWith("POSSIBLY URGENT: troubleshooting request sent without a timeline. Call first.\n\n")).toBe(true);
      expect(mail.html).toContain("POSSIBLY URGENT");
    });
    it("troubleshooting with a non-urgent timeline is not flagged", async () => {
      const { env, send } = makeEnv();
      await call(rfq({ ...VALID, service: "maintenance-support", timeline: "planning" }), env);
      expect(send.mock.calls[0]![0].subject.startsWith("[Website AR]")).toBe(true);
    });
  });

  it("502 send when the email binding throws", async () => {
    const { env, send } = makeEnv();
    send.mockRejectedValueOnce(new Error("destination not verified"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call(rfq(VALID), env);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: "send" });
    expect(spy).toHaveBeenCalled();
    const form = await call(rfq(VALID, { json: false }), (() => {
      const e = makeEnv();
      e.send.mockRejectedValueOnce(new Error("x"));
      return e.env;
    })());
    expect(form.headers.get("Location")).toBe("/ar/contact/?error=send#rfq-error-send");
  });
});

describe("/api/rfq preferred reply channel", () => {
  beforeEach(() => {
    mockSiteverify();
  });

  it("is shown with its English label, right after the email", async () => {
    const { env, send } = makeEnv();
    await call(rfq({ ...VALID, reply: "whatsapp" }), env);
    expect(send.mock.calls[0]![0].text).toContain("Email: ahmed@example.com\nPreferred reply: WhatsApp\n");
  });

  it("'email' needs an email address (422 invalid)", async () => {
    const { env, send } = makeEnv();
    const res = await call(rfq({ ...VALID, email: "", reply: "email" }), env);
    expect(res.status).toBe(422);
    expect(send).not.toHaveBeenCalled();
  });

  it.each(["phone", "whatsapp"])("'%s' needs a phone number (422 invalid)", async (reply) => {
    const { env, send } = makeEnv();
    const res = await call(rfq({ ...VALID, phone: "", locale: "zh", reply }), env);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ ok: false, error: "invalid" });
    expect(send).not.toHaveBeenCalled();
  });

  it("an unknown value is ignored", async () => {
    const { env, send } = makeEnv();
    const res = await call(rfq({ ...VALID, reply: "fax" }), env);
    expect(res.status).toBe(200);
    expect(send.mock.calls[0]![0].text).not.toContain("Preferred reply");
  });
});

/* ------------------------------------------------------------------ /api/evt (click counts, UX2-18) */

describe("/api/evt → Workers Analytics Engine", () => {
  const evt = (body: unknown, headers: Record<string, string> = {}, method = "POST") =>
    new Request(`${ORIGIN}/api/evt`, {
      method,
      body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
      headers: { "Content-Type": "text/plain;charset=UTF-8", Origin: ORIGIN, ...headers },
    });
  const withClicks = () => {
    const writeDataPoint = vi.fn();
    const e = makeEnv({ CLICKS: { writeDataPoint } });
    return { ...e, writeDataPoint };
  };
  const OK = { k: "whatsapp", p: "hero", l: "ar", u: "/ar/services/control-panels/" };

  it("writes one data point (kind, place, locale, path; no IP, no identifier) and answers 204 no-store", async () => {
    const { env, writeDataPoint } = withClicks();
    const res = await call(evt(OK), env);
    expect(res.status).toBe(204);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Set-Cookie")).toBeNull();
    expect(writeDataPoint).toHaveBeenCalledOnce();
    expect(writeDataPoint).toHaveBeenCalledWith({ blobs: ["whatsapp", "hero", "ar", "/ar/services/control-panels/"], doubles: [1], indexes: ["whatsapp"] });
  });

  it.each([
    ["malformed JSON", "{oops", {}],
    ["an unknown kind", JSON.stringify({ ...OK, k: "purchase" }), {}],
    ["a path with a query string", JSON.stringify({ ...OK, u: "/ar/contact/?email=a@b.c" }), {}],
    ["an oversized body", JSON.stringify({ ...OK, pad: "x".repeat(600) }), {}],
    ["another site's origin", JSON.stringify(OK), { Origin: "https://evil.example" }],
    ["a cross-site fetch", JSON.stringify(OK), { "Sec-Fetch-Site": "cross-site" }],
  ])("is not counted: %s (still 204, nothing echoed)", async (_, body, headers) => {
    const { env, writeDataPoint } = withClicks();
    const res = await call(evt(body, headers), env);
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(writeDataPoint).not.toHaveBeenCalled();
  });

  it("works without the binding (local dev / not configured) and never reaches the static assets", async () => {
    const { env, assets } = makeEnv();
    expect((await call(evt(OK), env)).status).toBe(204);
    expect(assets).not.toHaveBeenCalled();
  });

  it("405 for anything but POST", async () => {
    const res = await call(evt(null, {}, "GET"), withClicks().env);
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST");
  });

  it("a failing write is logged, never surfaced", async () => {
    const writeDataPoint = vi.fn(() => {
      throw new Error("quota");
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call(evt(OK), makeEnv({ CLICKS: { writeDataPoint } }).env);
    expect(res.status).toBe(204);
    expect(spy).toHaveBeenCalled();
  });
});
