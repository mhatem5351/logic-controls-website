/**
 * Logic Controls — Cloudflare Worker in front of the static Astro build.
 *
 * Only two paths run this code (see `run_worker_first` in wrangler.jsonc), everything else
 * is served straight from static assets for free:
 *   /          → 302 to the visitor's language (cookie → Accept-Language → English)
 *   /api/rfq   → quote/contact form: size + type guard, honeypot, validation (src/lib/rfq-rules.ts, shared with the
 *                form), Turnstile, then one email to the owner's verified inbox (send_email binding) with the
 *                visitor's drawings/photos attached (≤ 3 files, ≤ 4 MB in total).
 *
 * Response contract for /api/rfq (unchanged for old cached pages):
 *   Accept: application/json → 200 { ok: true, ref } | 4xx/5xx { ok: false, error }
 *   otherwise (no-JS form post) → 303 → /{locale}/contact/thanks/?ref=… | /{locale}/contact/?error=<code>#rfq-error-<code>
 *   error codes: invalid · attachments · verification · send
 *
 * Free plan budget (10 ms CPU): multipart parsing is native, file bytes are handed to the email binding as
 * ArrayBuffers (no base64 in JS), and the only JS work per file is a 64-byte signature check.
 */
import {
  RFQ_FIELDS,
  RFQ_FILES,
  RFQ_MAX_BODY,
  checkFiles,
  fileExt,
  intlPhone,
  isRfqLocale,
  isUrgent,
  normalizeRfq,
  rfqProblems,
  rfqReference,
  safeFilename,
  sniffOk,
  type RfqData,
  type RfqLocale,
} from "../src/lib/rfq-rules";
import { optionLabel } from "./labels";

interface Env {
  ASSETS: Fetcher;
  RFQ_MAIL: SendEmail;
  OWNER_EMAIL: string;
  MAIL_FROM: string;
  TURNSTILE_SECRET?: string;
  /** Hostnames the Turnstile token may be issued for. Comma separated. */
  ALLOWED_HOSTNAMES: string;
}

type Locale = RfqLocale;
type ErrorCode = "invalid" | "attachments" | "verification" | "send";

/** Headers the static assets get from public/_headers; the Worker's own responses need them too. */
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};

/* ------------------------------------------------------------------ "/" → /{locale}/ */

function negotiateLocale(req: Request): Locale {
  const cookie = /(?:^|;\s*)lang=([a-z]{2})\b/.exec(req.headers.get("Cookie") ?? "")?.[1];
  if (isRfqLocale(cookie)) return cookie;
  const header = (req.headers.get("Accept-Language") ?? "")
    .split(",")
    .map((part, i) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { lang: tag.toLowerCase().split("-")[0], q: q ? Number(q.slice(2)) || 0 : 1, i };
    })
    // RFC 9110 §12.5.4: q=0 means "not acceptable" (a malformed q-value counts as 0 too).
    .filter((x) => x.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i)
    .map((x) => x.lang)
    .find(isRfqLocale);
  return header ?? "en";
}

function redirectToLocale(req: Request): Response {
  const url = new URL(req.url);
  return new Response(null, {
    status: 302,
    headers: {
      ...SECURITY_HEADERS,
      Location: `/${negotiateLocale(req)}/${url.search}`,
      "Cache-Control": "private, no-store",
      Vary: "Accept-Language, Cookie",
    },
  });
}

/* ------------------------------------------------------------------ RFQ form */

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function wantsJson(req: Request) {
  return (req.headers.get("Accept") ?? "").includes("application/json");
}

/** The form's language from the page that posted it, for errors raised before the body is read. */
function refererLocale(req: Request): Locale {
  try {
    const seg = new URL(req.headers.get("Referer") ?? "").pathname.split("/")[1];
    return isRfqLocale(seg) ? seg : "en";
  } catch {
    return "en";
  }
}

function reply(req: Request, locale: Locale, status: number, result: { ref: string } | { error: ErrorCode }): Response {
  const headers = { ...SECURITY_HEADERS, "Cache-Control": "no-store" };
  if (wantsJson(req)) {
    return Response.json("ref" in result ? { ok: true, ref: result.ref } : { ok: false, error: result.error }, { status, headers });
  }
  // No-JS round trip: the error hash targets a <noscript> alert on the form (shown with :target, no script needed).
  const target =
    "ref" in result
      ? `/${locale}/contact/thanks/?ref=${result.ref}`
      : `/${locale}/contact/?error=${result.error}#rfq-error-${result.error}`;
  return new Response(null, { status: 303, headers: { ...headers, Location: target } });
}

async function verifyTurnstile(env: Env, token: string, ip: string | null): Promise<boolean> {
  if (!env.TURNSTILE_SECRET) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip ?? undefined }),
      // A hung siteverify must not hang the visitor: fail closed after 5 s.
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success: boolean; hostname?: string };
    const allowed = env.ALLOWED_HOSTNAMES.split(",").map((h) => h.trim());
    return data.success && (!data.hostname || allowed.includes(data.hostname));
  } catch {
    return false;
  }
}

/** Reads a body without a Content-Length, giving up past `max` bytes. */
async function readCapped(body: ReadableStream<Uint8Array>, max: number): Promise<Uint8Array | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      // Stop reading; the runtime discards the rest of the body with the request.
      reader.releaseLock();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** Content-Type and size guard, then the parsed form. */
async function readForm(req: Request): Promise<FormData | ErrorCode> {
  const type = req.headers.get("Content-Type") ?? "";
  if (!/^(multipart\/form-data|application\/x-www-form-urlencoded)\b/i.test(type)) return "invalid";
  const length = req.headers.get("Content-Length");
  if (length !== null && !(Number(length) <= RFQ_MAX_BODY)) return "attachments";
  try {
    if (length === null && req.body) {
      const body = await readCapped(req.body, RFQ_MAX_BODY);
      if (!body) return "attachments";
      return await new Response(body, { headers: { "Content-Type": type } }).formData();
    }
    return await req.formData();
  } catch {
    return "invalid";
  }
}

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Select values → English labels (unknown values are shown as sent; they are already one line and capped). */
const SELECTS = new Set(["service", "industry", "timeline", "location", "reply"]);
const shown = (data: RfqData, key: keyof RfqData) => (SELECTS.has(key) ? (optionLabel(key, data[key]) ?? data[key]) : data[key]);

async function handleRfq(req: Request, env: Env): Promise<Response> {
  const form = await readForm(req);
  if (typeof form === "string") return reply(req, refererLocale(req), form === "attachments" ? 413 : 400, { error: form });
  const posted = form.get("locale");
  const locale: Locale = isRfqLocale(posted) ? posted : refererLocale(req);

  // Honeypot: real people never fill this hidden field. Pretend success so bots learn nothing.
  if (String(form.get("lc_hp") ?? "").trim()) return reply(req, locale, 200, { ref: rfqReference() });

  const data = normalizeRfq((k) => form.get(k));
  if (rfqProblems(data, form.get("consent")).length) return reply(req, locale, 422, { error: "invalid" });

  // Attachments (optional): count / total size / extension first (cheap, no bytes read).
  const files = form.getAll(RFQ_FILES.field).filter((f): f is File => typeof f !== "string" && f.size > 0);
  if (checkFiles(files)) return reply(req, locale, 422, { error: "attachments" });

  const token = String(form.get("cf-turnstile-response") ?? "");
  if (!token || !(await verifyTurnstile(env, token, req.headers.get("CF-Connecting-IP")))) {
    return reply(req, locale, 403, { error: "verification" });
  }

  const attachments: { disposition: "attachment"; filename: string; type: string; content: ArrayBuffer }[] = [];
  for (const file of files) {
    const ext = fileExt(file.name);
    const content = await file.arrayBuffer();
    if (!sniffOk(ext, new Uint8Array(content, 0, Math.min(64, content.byteLength)))) return reply(req, locale, 422, { error: "attachments" });
    attachments.push({ disposition: "attachment", filename: safeFilename(file.name), type: RFQ_FILES.types[ext]!, content });
  }

  // Step 2 (details) is optional: fall back to the selections so the email is never empty.
  if (!data.message) data.message = ["service", "industry", "timeline"].map((k) => (data[k as keyof RfqData] ? shown(data, k as keyof RfqData) : "")).filter(Boolean).join(" · ") || "(no details provided)";

  const ref = rfqReference();
  const urgent = isUrgent(data);
  const wa = data.phone ? intlPhone(data.phone) : null;
  const dirOf = (key: string) => {
    const d = form.get(`${key}.dir`);
    return d === "rtl" || d === "ltr" ? d : "auto";
  };

  const rows: [label: string, value: string, key: string][] = RFQ_FIELDS.filter(([key]) => data[key]).map(([key, label]) => [label, shown(data, key), key]);
  if (attachments.length) rows.push(["Attachments", files.map((f, i) => `${attachments[i]!.filename} (${kb(f.size)})`).join(", "), "files"]);
  rows.push(["Consent", "Yes (privacy notice accepted on the form)", "consent"], ["Reference", ref, "ref"]);

  const service = data.service ? shown(data, "service") : "Inquiry";
  const subject = `${urgent ? "[URGENT] " : ""}[Website ${locale.toUpperCase()}] ${service} — ${data.company || data.name} · ${ref}`.slice(0, 200);
  const actions = wa ? `\n\nReply on WhatsApp: https://wa.me/${wa}\nCall: +${wa}` : "";
  const text =
    (urgent ? "URGENT: a machine is stopped.\n\n" : "") +
    rows.map(([label, value]) => `${label}: ${value}`).join("\n") +
    actions +
    `\n\nLanguage: ${locale}`;
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;color:#111">
${urgent ? `<p style="margin:0 0 12px;padding:8px 12px;border-left:4px solid #b42318;background:#fdf3f2;color:#b42318;font-weight:700">URGENT: a machine is stopped</p>` : ""}
<h2 style="margin:0 0 12px;color:#0b3a8c">New website inquiry (${locale.toUpperCase()}) · ${ref}</h2>
${wa ? `<p style="margin:0 0 12px"><a href="https://wa.me/${wa}">Reply on WhatsApp</a> &nbsp;·&nbsp; <a href="tel:+${wa}">Call +${wa}</a></p>` : ""}
<table cellpadding="6" style="border-collapse:collapse">${rows
    .map(
      ([label, value, key]) =>
        `<tr><td style="vertical-align:top;color:#555;white-space:nowrap"><b>${label}</b></td><td style="white-space:pre-wrap" dir="${dirOf(key)}">${escapeHtml(value)}</td></tr>`,
    )
    .join("")}</table>
</div>`;

  try {
    await env.RFQ_MAIL.send({
      from: { email: env.MAIL_FROM, name: "Logic Controls Website" },
      to: env.OWNER_EMAIL,
      subject,
      text,
      html,
      ...(data.email ? { replyTo: { email: data.email, name: data.name } } : {}),
      ...(attachments.length ? { attachments } : {}),
    });
  } catch (err) {
    console.error("RFQ email failed", err);
    return reply(req, locale, 502, { error: "send" });
  }
  return reply(req, locale, 200, { ref });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/" && (req.method === "GET" || req.method === "HEAD")) return redirectToLocale(req);
    if (url.pathname === "/api/rfq") {
      if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: { ...SECURITY_HEADERS, Allow: "POST" } });
      return handleRfq(req, env);
    }
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
