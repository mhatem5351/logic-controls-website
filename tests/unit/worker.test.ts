/**
 * worker/index.ts — "/" locale redirect and the /api/rfq form handler.
 *
 * Runs the real module in Node and calls its fetch() with a mocked env (ASSETS, RFQ_MAIL.send spy) and a mocked global
 * fetch for Turnstile's siteverify. @cloudflare/vitest-pool-workers is not used: its current release (0.22) needs
 * vitest ^4.1 and pins its own wrangler (4.124), while this repo runs vitest 5 and wrangler 4.147. The Worker only
 * uses web-standard APIs (Request, Response, FormData, fetch), which Node provides, so nothing is lost for these
 * cases; the real workerd runtime is exercised end to end by the Playwright suite (wrangler dev).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";

const ORIGIN = "https://logic-controls.com";
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type Mail = { from: { email: string; name?: string }; to: string; subject: string; text: string; html: string; replyTo?: { email: string; name?: string } };

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

function rfq(fields: Record<string, string>, { json = true, headers = {} as Record<string, string> } = {}) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return new Request(`${ORIGIN}/api/rfq`, {
    method: "POST",
    body,
    headers: { ...(json ? { Accept: "application/json" } : { Accept: "text/html" }), ...headers },
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
  "cf-turnstile-response": "token-123",
};

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

  // RFC 9110 §12.5.4: q=0 means "not acceptable". Browsers never send it for a language they list, so this is
  // theoretical: the Worker still picks a q=0 language when nothing else matches (it should fall back to English).
  it.fails("KNOWN ISSUE: q=0 marks a language as not acceptable", async () => {
    expect(await target({ "Accept-Language": "ar;q=0, fr" })).toBe("/en/");
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

  it("400 invalid when the body is not form data", async () => {
    const req = new Request(`${ORIGIN}/api/rfq`, { method: "POST", body: "{}", headers: { "Content-Type": "application/json", Accept: "application/json" } });
    const res = await call(req, makeEnv().env);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "invalid" });
  });

  describe("honeypot", () => {
    it("pretends success (JSON) and sends nothing", async () => {
      const { env, send } = makeEnv();
      const res = await call(rfq({ ...VALID, company_website: "http://spam.example" }), env);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect(send).not.toHaveBeenCalled();
      expect(verify).not.toHaveBeenCalled();
    });
    it("pretends success (form post → 303 to the thanks page of the form's language)", async () => {
      const { env, send } = makeEnv();
      const res = await call(rfq({ ...VALID, locale: "zh", company_website: "x" }, { json: false }), env);
      expect(res.status).toBe(303);
      expect(res.headers.get("Location")).toBe("/zh/contact/thanks/");
      expect(send).not.toHaveBeenCalled();
    });
    it("a whitespace-only honeypot is not a bot", async () => {
      const { env, send } = makeEnv();
      await call(rfq({ ...VALID, company_website: "   " }), env);
      expect(send).toHaveBeenCalledOnce();
    });
  });

  describe("validation → 422 invalid", () => {
    it.each([
      ["name missing", { name: "" }],
      ["name only spaces", { name: "   " }],
      ["phone missing", { phone: "" }],
      ["email malformed", { email: "not-an-email" }],
      ["email without TLD", { email: "a@b" }],
    ])("%s", async (_, over) => {
      const { env, send } = makeEnv();
      const res = await call(rfq({ ...VALID, ...over }), env);
      expect(res.status).toBe(422);
      expect(await res.json()).toEqual({ ok: false, error: "invalid" });
      expect(send).not.toHaveBeenCalled();
      expect(verify).not.toHaveBeenCalled();
    });

    it("form post: 303 back to the localized form with ?error=invalid#quote", async () => {
      const res = await call(rfq({ ...VALID, name: "" }, { json: false }), makeEnv().env);
      expect(res.status).toBe(303);
      expect(res.headers.get("Location")).toBe("/ar/contact/?error=invalid#quote");
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    });

    it("email is optional", async () => {
      const { env, send } = makeEnv();
      const res = await call(rfq({ ...VALID, email: "" }), env);
      expect(res.status).toBe(200);
      expect(send.mock.calls[0]![0].replyTo).toBeUndefined();
    });

    it("an unknown locale falls back to English", async () => {
      const res = await call(rfq({ ...VALID, name: "", locale: "fr" }, { json: false }), makeEnv().env);
      expect(res.headers.get("Location")).toBe("/en/contact/?error=invalid#quote");
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

    it("no TURNSTILE_SECRET configured: fails closed", async () => {
      const { env } = makeEnv({ TURNSTILE_SECRET: undefined });
      await expect403(env);
      expect(verify).not.toHaveBeenCalled();
    });

    it("form post: 303 back with ?error=verification", async () => {
      mockSiteverify({ success: false });
      const res = await call(rfq({ ...VALID, locale: "tr" }, { json: false }), makeEnv().env);
      expect(res.status).toBe(303);
      expect(res.headers.get("Location")).toBe("/tr/contact/?error=verification#quote");
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
    it("JSON: 200 {ok:true}, no-store", async () => {
      const res = await call(rfq(VALID), makeEnv().env);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    });

    it("form post (no JS): 303 to the localized thanks page", async () => {
      const res = await call(rfq(VALID, { json: false }), makeEnv().env);
      expect(res.status).toBe(303);
      expect(res.headers.get("Location")).toBe("/ar/contact/thanks/");
    });

    it("emails the owner: subject, sender, reply-to, text and HTML with every filled field", async () => {
      const { env, send } = makeEnv();
      await call(rfq({ ...VALID, location: "obour", timeline: "1-3m", country: "Egypt", page: "/ar/services/" }), env);
      expect(send).toHaveBeenCalledOnce();
      const mail = send.mock.calls[0]![0];
      expect(mail.to).toBe("owner@example.com");
      expect(mail.from).toEqual({ email: "website@logic-controls.com", name: "Logic Controls Website" });
      expect(mail.replyTo).toEqual({ email: "ahmed@example.com", name: "Ahmed Ali" });
      expect(mail.subject).toBe("[Website AR] process-control — Nile Foods");
      expect(mail.text).toBe(
        [
          "Name: Ahmed Ali",
          "Company: Nile Foods",
          "Phone / WhatsApp: +20 100 000 0000",
          "Email: ahmed@example.com",
          "Country: Egypt",
          "Factory location: obour",
          "Service: process-control",
          "Industry: food-beverage",
          "Timeline: 1-3m",
          "Project details: Pasteurizer upgrade",
          "Sent from page: /ar/services/",
        ].join("\n") + "\n\nLanguage: ar",
      );
      expect(mail.html).toContain("New website inquiry (AR)");
      expect(mail.html).toContain('<a href="https://wa.me/201000000000">Reply on WhatsApp</a>');
      expect(mail.html).toContain('dir="auto">Nile Foods</td>');
    });

    it("subject falls back to Inquiry / the person's name", async () => {
      const { env, send } = makeEnv();
      await call(rfq({ ...VALID, service: "", company: "", locale: "en" }), env);
      expect(send.mock.calls[0]![0].subject).toBe("[Website EN] Inquiry — Ahmed Ali");
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

    it("message falls back to service · industry, then to a placeholder, when step 2 was skipped", async () => {
      const { env, send } = makeEnv();
      await call(rfq({ ...VALID, message: "" }), env);
      expect(send.mock.calls[0]![0].text).toContain("Project details: process-control · food-beverage");
      await call(rfq({ ...VALID, message: "  ", service: "", industry: "" }), env);
      expect(send.mock.calls[1]![0].text).toContain("Project details: (no details provided)");
    });

    it("trims fields and caps their length (message 5000, others 300)", async () => {
      const { env, send } = makeEnv();
      await call(rfq({ ...VALID, name: `  ${"n".repeat(400)}  `, message: "m".repeat(6000) }), env);
      const { text } = send.mock.calls[0]![0];
      expect(text).toContain(`Name: ${"n".repeat(300)}\n`);
      expect(text).toContain(`Project details: ${"m".repeat(5000)}\n`);
      expect(text).not.toContain("n".repeat(301));
    });

    it("ignores fields outside the contract (no header or HTML injection through extra fields)", async () => {
      const { env, send } = makeEnv();
      await call(rfq({ ...VALID, bcc: "x@evil.example", "<b>": "x" }), env);
      const mail = send.mock.calls[0]![0];
      expect(Object.keys(mail).sort()).toEqual(["from", "html", "replyTo", "subject", "text", "to"]);
      expect(mail.text).not.toContain("evil");
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
    expect(form.headers.get("Location")).toBe("/ar/contact/?error=send#quote");
  });
});
