/**
 * Logic Controls — Cloudflare Worker in front of the static Astro build.
 *
 * Only these paths run this code (see `run_worker_first` in wrangler.jsonc), everything else is served straight from
 * static assets for free:
 *   /          → 302 to the visitor's language (cookie → Accept-Language → English)
 *   /api/rfq   → quote/contact form: size + type guard, honeypot, validation (src/lib/rfq-rules.ts, shared with the
 *                form), Turnstile, then one email to the owner's verified inbox (send_email binding) with the
 *                visitor's drawings/photos attached (≤ 3 files, ≤ 4 MB in total).
 *   /api/evt   → one anonymous click count (WhatsApp / call / email / quote; src/scripts/analytics.ts) written to
 *                Workers Analytics Engine (binding CLICKS; free on Workers Free: 100,000 data points a day). No
 *                cookies, no IP, no identifier: kind, placement, locale and path only.
 *
 * Response contract for /api/rfq (old cached pages keep working: new fields are additions):
 *   Accept: application/json → 200 { ok: true, ref, skipped? } | 4xx/5xx { ok: false, error, problem?, files? }
 *     skipped: names of attachments whose content did not match their extension. They are left out of the email
 *              (which lists them) instead of failing the whole request after the visitor passed Turnstile.
 *     422 attachments: problem "count" | "size" | "type", files = the names with a type we do not accept.
 *   otherwise (no-JS form post) → 303 → /{locale}/contact/thanks/?ref=…[&skipped=n] | /{locale}/contact/?error=<code>#rfq-error-<code>
 *   error codes: invalid · attachments · verification · send
 *
 * Free plan budget (10 ms CPU): multipart parsing is native, file bytes are handed to the email binding as
 * ArrayBuffers (no base64 in JS), and the only JS work per file is a signature check on its first 1 KB.
 */
import {
  RFQ_FIELDS,
  RFQ_FILES,
  RFQ_MAX_BODY,
  EVT_MAX_BODY,
  SNIFF_BYTES,
  badTypeNames,
  checkFiles,
  fileExt,
  intlPhone,
  isRfqLocale,
  normalizeRfq,
  parseEvt,
  rfqProblems,
  rfqReference,
  safeFilename,
  sniffOk,
  urgencyOf,
  type FileProblem,
  type RfqData,
  type RfqLocale,
} from "../src/lib/rfq-rules";
import { optionLabel } from "./labels";

interface Env {
  ASSETS: Fetcher;
  RFQ_MAIL: SendEmail;
  /** Workers Analytics Engine dataset for click counts (optional: without it /api/evt just answers 204). */
  CLICKS?: AnalyticsEngineDataset;
  OWNER_EMAIL: string;
  MAIL_FROM: string;
  TURNSTILE_SECRET?: string;
  /** Hostnames the Turnstile token may be issued for. Comma separated. */
  ALLOWED_HOSTNAMES: string;
}

type Locale = RfqLocale;
type ErrorCode = "invalid" | "attachments" | "verification" | "send";
type Result = { ref: string; skipped?: string[] } | { error: ErrorCode; problem?: FileProblem; files?: string[] };

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

function reply(req: Request, locale: Locale, status: number, result: Result): Response {
  const headers = { ...SECURITY_HEADERS, "Cache-Control": "no-store" };
  if (wantsJson(req)) {
    const body =
      "ref" in result
        ? { ok: true, ref: result.ref, ...(result.skipped?.length ? { skipped: result.skipped } : {}) }
        : { ok: false, error: result.error, ...(result.problem ? { problem: result.problem } : {}), ...(result.files?.length ? { files: result.files } : {}) };
    return Response.json(body, { status, headers });
  }
  // No-JS round trip: the error hash targets a <noscript> alert on the form (shown with :target, no script needed).
  const target =
    "ref" in result
      ? `/${locale}/contact/thanks/?ref=${result.ref}${result.skipped?.length ? `&skipped=${result.skipped.length}` : ""}`
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

const BANNERS = {
  urgent: { text: "URGENT: a machine is stopped.", color: "#b42318", bg: "#fdf3f2" },
  likely: { text: "POSSIBLY URGENT: troubleshooting request sent without a timeline. Call first.", color: "#93370d", bg: "#fffaeb" },
} as const;

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
  const problem = checkFiles(files);
  if (problem) return reply(req, locale, 422, { error: "attachments", problem, files: problem === "type" ? badTypeNames(files) : undefined });

  const token = String(form.get("cf-turnstile-response") ?? "");
  if (!token || !(await verifyTurnstile(env, token, req.headers.get("CF-Connecting-IP")))) {
    return reply(req, locale, 403, { error: "verification" });
  }

  // Content check: a file whose bytes don't match its extension is left out (and named in the email and the reply),
  // never a reason to lose a request the visitor has already completed.
  const attachments: { disposition: "attachment"; filename: string; type: string; content: ArrayBuffer }[] = [];
  const attachedSizes: number[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    const ext = fileExt(file.name);
    const content = await file.arrayBuffer();
    const name = safeFilename(file.name);
    if (!sniffOk(ext, new Uint8Array(content, 0, Math.min(SNIFF_BYTES, content.byteLength)))) {
      skipped.push(name);
      continue;
    }
    attachments.push({ disposition: "attachment", filename: name, type: RFQ_FILES.types[ext]!, content });
    attachedSizes.push(file.size);
  }

  // Step 2 (details) is optional: fall back to the selections so the email is never empty.
  if (!data.message) data.message = ["service", "industry", "timeline"].map((k) => (data[k as keyof RfqData] ? shown(data, k as keyof RfqData) : "")).filter(Boolean).join(" · ") || "(no details provided)";

  const ref = rfqReference();
  const urgency = urgencyOf(data);
  const banner = urgency ? BANNERS[urgency] : null;
  const wa = data.phone ? intlPhone(data.phone, { locale, country: data.country, location: data.location }) : null;
  const dirOf = (key: string) => {
    const d = form.get(`${key}.dir`);
    return d === "rtl" || d === "ltr" ? d : "auto";
  };

  const rows: [label: string, value: string, key: string][] = RFQ_FIELDS.filter(([key]) => data[key]).map(([key, label]) => [label, shown(data, key), key]);
  if (attachments.length) rows.push(["Attachments", attachments.map((a, i) => `${a.filename} (${kb(attachedSizes[i]!)})`).join(", "), "files"]);
  if (skipped.length) rows.push(["Not attached", `${skipped.join(", ")} (the content does not match the file type; ask the sender to email it)`, "skipped"]);
  rows.push(["Consent", "Yes (privacy notice accepted on the form)", "consent"], ["Reference", ref, "ref"]);

  const service = data.service ? shown(data, "service") : "Inquiry";
  const flag = urgency === "urgent" ? "[URGENT] " : urgency === "likely" ? "[URGENT?] " : "";
  const subject = `${flag}[Website ${locale.toUpperCase()}] ${service} — ${data.company || data.name} · ${ref}`.slice(0, 200);
  const noCode = "No recognisable country code: check the number before calling or messaging (no WhatsApp / call link).";
  const actions = wa ? `\n\nReply on WhatsApp: https://wa.me/${wa}\nCall: +${wa}` : data.phone ? `\n\nPhone ${data.phone}: ${noCode}` : "";
  const text =
    (banner ? `${banner.text}\n\n` : "") +
    rows.map(([label, value]) => `${label}: ${value}`).join("\n") +
    actions +
    `\n\nLanguage: ${locale}`;
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;color:#111">
${banner ? `<p style="margin:0 0 12px;padding:8px 12px;border-left:4px solid ${banner.color};background:${banner.bg};color:${banner.color};font-weight:700">${banner.text.replace(/\.$/, "")}</p>` : ""}
<h2 style="margin:0 0 12px;color:#0b3a8c">New website inquiry (${locale.toUpperCase()}) · ${ref}</h2>
${
  wa
    ? `<p style="margin:0 0 12px"><a href="https://wa.me/${wa}">Reply on WhatsApp</a> &nbsp;·&nbsp; <a href="tel:+${wa}">Call +${wa}</a></p>`
    : data.phone
      ? `<p style="margin:0 0 12px;color:#93370d"><b>Phone ${escapeHtml(data.phone)}:</b> ${noCode}</p>`
      : ""
}
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
  return reply(req, locale, 200, { ref, skipped });
}

/* ------------------------------------------------------------------ click counts */

const NO_CONTENT = () => new Response(null, { status: 204, headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" } });

/**
 * One anonymous click → one Analytics Engine data point: blobs [kind, place, locale, path], double [1], index kind.
 * Answers 204 whatever happens (a beacon cannot read the answer): malformed, oversized or cross-site posts are simply
 * not counted. Each call counts against the Worker's 100,000 requests a day, so the client sends at most a handful
 * per page view (src/scripts/analytics.ts).
 */
async function handleEvt(req: Request, env: Env): Promise<Response> {
  const origin = req.headers.get("Origin");
  if (origin && new URL(req.url).origin !== origin) return NO_CONTENT();
  if (req.headers.get("Sec-Fetch-Site") === "cross-site") return NO_CONTENT();
  if (Number(req.headers.get("Content-Length") ?? 0) > EVT_MAX_BODY) return NO_CONTENT();
  let raw: unknown;
  try {
    const body = await req.text();
    if (body.length > EVT_MAX_BODY) return NO_CONTENT();
    raw = JSON.parse(body);
  } catch {
    return NO_CONTENT();
  }
  const evt = parseEvt(raw);
  if (evt && env.CLICKS) {
    try {
      env.CLICKS.writeDataPoint({ blobs: [evt.kind, evt.place, evt.locale, evt.path], doubles: [1], indexes: [evt.kind] });
    } catch (err) {
      console.error("click count failed", err);
    }
  }
  return NO_CONTENT();
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/" && (req.method === "GET" || req.method === "HEAD")) return redirectToLocale(req);
    if (url.pathname === "/api/rfq") {
      if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: { ...SECURITY_HEADERS, Allow: "POST" } });
      return handleRfq(req, env);
    }
    if (url.pathname === "/api/evt") {
      if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: { ...SECURITY_HEADERS, Allow: "POST" } });
      return handleEvt(req, env);
    }
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
