/**
 * Logic Controls — Cloudflare Worker in front of the static Astro build.
 *
 * Only two paths run this code (see `run_worker_first` in wrangler.jsonc), everything else
 * is served straight from static assets for free:
 *   /          → 302 to the visitor's language (cookie → Accept-Language → English)
 *   /api/rfq   → quote/contact form: honeypot + Turnstile + email to the owner's verified inbox
 */

interface SendEmailBinding {
  send(message: {
    from: string | { email: string; name?: string };
    to: string | string[];
    subject: string;
    text?: string;
    html?: string;
    replyTo?: string | { email: string; name?: string };
  }): Promise<unknown>;
}

interface Env {
  ASSETS: Fetcher;
  RFQ_MAIL: SendEmailBinding;
  OWNER_EMAIL: string;
  MAIL_FROM: string;
  TURNSTILE_SECRET?: string;
  /** Hostnames the Turnstile token may be issued for. Comma separated. */
  ALLOWED_HOSTNAMES: string;
}

const LOCALES = ["en", "ar", "zh", "tr"] as const;
type Locale = (typeof LOCALES)[number];

const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);

function negotiateLocale(req: Request): Locale {
  const cookie = /(?:^|;\s*)lang=(en|ar|zh|tr)\b/.exec(req.headers.get("Cookie") ?? "")?.[1];
  if (isLocale(cookie)) return cookie;
  const header = (req.headers.get("Accept-Language") ?? "")
    .split(",")
    .map((part, i) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { lang: tag.toLowerCase().split("-")[0], q: q ? Number(q.slice(2)) || 0 : 1, i };
    })
    .sort((a, b) => b.q - a.q || a.i - b.i)
    .map((x) => x.lang)
    .find(isLocale);
  return header ?? "en";
}

function redirectToLocale(req: Request): Response {
  const url = new URL(req.url);
  return new Response(null, {
    status: 302,
    headers: {
      Location: `/${negotiateLocale(req)}/${url.search}`,
      "Cache-Control": "private, no-store",
      Vary: "Accept-Language, Cookie",
    },
  });
}

/* ------------------------------------------------------------------ RFQ form */

const FIELDS = [
  ["name", "Name"],
  ["company", "Company"],
  ["phone", "Phone / WhatsApp"],
  ["email", "Email"],
  ["country", "Country"],
  ["location", "Factory location"],
  ["service", "Service"],
  ["industry", "Industry"],
  ["timeline", "Timeline"],
  ["message", "Project details"],
  ["page", "Sent from page"],
] as const;

const MAX_LEN: Record<string, number> = { message: 5000 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function wantsJson(req: Request) {
  return (req.headers.get("Accept") ?? "").includes("application/json");
}

function reply(req: Request, locale: Locale, ok: boolean, status: number, error?: string): Response {
  if (wantsJson(req)) {
    return Response.json(ok ? { ok } : { ok, error }, { status, headers: { "Cache-Control": "no-store" } });
  }
  const target = ok ? `/${locale}/contact/thanks/` : `/${locale}/contact/?error=${encodeURIComponent(error ?? "unknown")}#quote`;
  return new Response(null, { status: 303, headers: { Location: target, "Cache-Control": "no-store" } });
}

async function verifyTurnstile(env: Env, token: string, ip: string | null): Promise<boolean> {
  if (!env.TURNSTILE_SECRET) return false;
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip ?? undefined }),
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { success: boolean; hostname?: string };
  const allowed = env.ALLOWED_HOSTNAMES.split(",").map((h) => h.trim());
  return data.success && (!data.hostname || allowed.includes(data.hostname));
}

async function handleRfq(req: Request, env: Env): Promise<Response> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return reply(req, "en", false, 400, "invalid");
  }
  const locale: Locale = isLocale(form.get("locale")) ? (form.get("locale") as Locale) : "en";

  // Honeypot: real people never fill this hidden field. Pretend success so bots learn nothing.
  if (String(form.get("company_website") ?? "").trim()) return reply(req, locale, true, 200);

  const data: Record<string, string> = {};
  for (const [key] of FIELDS) {
    data[key] = String(form.get(key) ?? "").trim().slice(0, MAX_LEN[key] ?? 300);
  }
  if (!data.name || !data.phone || !data.message || (data.email && !EMAIL_RE.test(data.email))) {
    return reply(req, locale, false, 422, "invalid");
  }

  const token = String(form.get("cf-turnstile-response") ?? "");
  if (!token || !(await verifyTurnstile(env, token, req.headers.get("CF-Connecting-IP")))) {
    return reply(req, locale, false, 403, "verification");
  }

  const rows = FIELDS.filter(([key]) => data[key]).map(([key, label]) => [label, data[key]!] as const);
  const subject = `[Website ${locale.toUpperCase()}] ${data.service || "Inquiry"} — ${data.company || data.name}`;
  const text = rows.map(([label, value]) => `${label}: ${value}`).join("\n") + `\n\nLanguage: ${locale}`;
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;color:#111">
<h2 style="margin:0 0 12px;color:#0b3a8c">New website inquiry (${locale.toUpperCase()})</h2>
<table cellpadding="6" style="border-collapse:collapse">${rows
    .map(
      ([label, value]) =>
        `<tr><td style="vertical-align:top;color:#555;white-space:nowrap"><b>${label}</b></td><td style="white-space:pre-wrap" dir="auto">${escapeHtml(value)}</td></tr>`,
    )
    .join("")}</table>
${data.phone ? `<p><a href="https://wa.me/${data.phone.replace(/\D/g, "")}">Reply on WhatsApp</a></p>` : ""}
</div>`;

  try {
    await env.RFQ_MAIL.send({
      from: { email: env.MAIL_FROM, name: "Logic Controls Website" },
      to: env.OWNER_EMAIL,
      subject,
      text,
      html,
      ...(data.email ? { replyTo: { email: data.email, name: data.name } } : {}),
    });
  } catch (err) {
    console.error("RFQ email failed", err);
    return reply(req, locale, false, 502, "send");
  }
  return reply(req, locale, true, 200);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/" && (req.method === "GET" || req.method === "HEAD")) return redirectToLocale(req);
    if (url.pathname === "/api/rfq") {
      if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
      return handleRfq(req, env);
    }
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
