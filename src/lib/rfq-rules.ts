/**
 * The quote-request (RFQ) contract, shared by the form's client script (src/scripts/rfq-form.ts) and the Worker
 * (worker/index.ts → POST /api/rfq), so both sides apply the same limits and the same validation.
 * Plain TypeScript: no Astro, DOM or Workers imports (it runs in the browser, in workerd and in Vitest).
 *
 * Contract (multipart/form-data or x-www-form-urlencoded):
 *   name, company, phone, email, reply (preferred channel: whatsapp | phone | email), country, location, service,
 *   industry, timeline, message, page, locale, consent=yes,
 *   files (0–3 attachments, multipart only), honeypot lc_hp, cf-turnstile-response,
 *   name.dir / company.dir / message.dir (the browser's `dirname`: "ltr" | "rtl").
 * A request needs a name, a phone OR an email (zh visitors may give only an email), an email when the visitor asks for
 * replies by email, consent, and a Turnstile token.
 */

import { LOCALES, isLocale, type Locale } from "../i18n/config";

/** The site's locales (src/i18n/config.ts, plain data: safe to bundle into the Worker). */
export const RFQ_LOCALES = LOCALES;
export type RfqLocale = Locale;
export const isRfqLocale = isLocale;

/** Fields in the order the owner reads them in the email, with their English labels. */
export const RFQ_FIELDS = [
  ["name", "Name"],
  ["company", "Company"],
  ["phone", "Phone / WhatsApp"],
  ["email", "Email"],
  ["reply", "Preferred reply"],
  ["service", "Service"],
  ["timeline", "Timeline"],
  ["industry", "Industry"],
  ["location", "Factory location"],
  ["country", "Country"],
  ["message", "Project details"],
  ["page", "Sent from page"],
] as const;
export type RfqField = (typeof RFQ_FIELDS)[number][0];
export type RfqData = Record<RfqField, string>;

/** Maximum lengths (characters). The form uses the same numbers for maxlength and its counter. */
export const RFQ_MAX: Record<RfqField, number> = {
  name: 120,
  company: 160,
  phone: 40,
  email: 160,
  reply: 20,
  service: 60,
  timeline: 60,
  industry: 60,
  location: 60,
  country: 80,
  message: 2000,
  page: 300,
};
export const RFQ_NAME_MIN = 2;

/** "How should we reply?" choices (zh offers phone and email only: WhatsApp is blocked in mainland China). */
export const REPLY_CHANNELS = ["whatsapp", "phone", "email"] as const;

/** The timeline choice that means "a machine is stopped": flagged [URGENT] in the subject, triggers the call-now panel. */
export const URGENT_TIMELINE = "urgent";
/** Services where a stopped machine is the usual reason to write: the form offers the call-now panel right away. */
export const URGENT_SERVICES: readonly string[] = ["maintenance-support"];

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** After toLatinDigits() and stripping separators: optional + or 00, then 8–15 digits. */
export const PHONE_RE = /^(\+|00)?\d{8,15}$/;

/* ------------------------------------------------------------------ attachments */

export const RFQ_FILES = {
  /** Form field name (multiple). */
  field: "files",
  maxCount: 3,
  /** Total raw bytes of all files. The email binding allows 25 MiB to a verified address; this keeps uploads quick on
   *  mobile data and the Worker's multipart parsing far inside the Free plan's 10 ms CPU. */
  maxTotal: 4 * 1024 * 1024,
  /** Lower-case extensions → MIME type used for the attachment. */
  types: {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    zip: "application/zip",
    dwg: "application/octet-stream",
    dxf: "application/octet-stream",
  } as Record<string, string>,
} as const;
export const RFQ_FILES_ACCEPT = Object.keys(RFQ_FILES.types)
  .map((e) => `.${e}`)
  .join(",");
/** Request body cap (bytes): attachments + generous room for the text fields and multipart framing. */
export const RFQ_MAX_BODY = RFQ_FILES.maxTotal + 64 * 1024;

export type FileProblem = "count" | "size" | "type";
export const fileExt = (name: string) => /\.([a-z0-9]{1,5})$/i.exec(name)?.[1]?.toLowerCase() ?? "";

/** Checks a selection of files ({ name, size }) against the limits; null when fine. Empty files are ignored. */
export function checkFiles(files: readonly { name: string; size: number }[]): FileProblem | null {
  const real = files.filter((f) => f.size > 0);
  if (real.some((f) => !(fileExt(f.name) in RFQ_FILES.types))) return "type";
  if (real.length > RFQ_FILES.maxCount) return "count";
  if (real.reduce((n, f) => n + f.size, 0) > RFQ_FILES.maxTotal) return "size";
  return null;
}

/** Does the file start with the signature its extension promises? (A renamed .exe is not a PDF.) */
export function sniffOk(ext: string, head: Uint8Array): boolean {
  const starts = (...sig: number[]) => sig.every((b, i) => head[i] === b);
  const ascii = (s: string, at = 0) => [...s].every((c, i) => head[at + i] === c.charCodeAt(0));
  switch (ext) {
    case "pdf":
      return ascii("%PDF");
    case "png":
      return starts(0x89, 0x50, 0x4e, 0x47);
    case "jpg":
    case "jpeg":
      return starts(0xff, 0xd8, 0xff);
    case "webp":
      return ascii("RIFF") && ascii("WEBP", 8);
    case "zip":
      return starts(0x50, 0x4b, 0x03, 0x04) || starts(0x50, 0x4b, 0x05, 0x06);
    case "dwg": // "AC1015", "AC1032", …
      return ascii("AC") && head[2] !== undefined && head[2] >= 0x30 && head[2] <= 0x39;
    case "dxf": // text DXF (group codes and values); binary DXF starts with "AutoCAD Binary DXF"
      return head.length > 0 && [...head.subarray(0, 64)].every((b) => b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127));
    default:
      return false;
  }
}

/** A safe attachment filename: no path, no control/bidi characters, at most 100 characters, extension kept. */
export function safeFilename(name: string): string {
  const base = oneLine(name.split(/[\\/]/).pop() ?? "").replace(/["<>:|?*]/g, "_");
  const ext = /\.[a-z0-9]{1,5}$/i.exec(base)?.[0] ?? "";
  const stem = base.slice(0, base.length - ext.length).slice(0, 90) || "file";
  return stem + ext;
}

/* ------------------------------------------------------------------ text */

/** Arabic-Indic (٠-٩) and Extended Arabic-Indic (۰-۹) digits → ASCII. */
export const toLatinDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

/** C0/C1 controls, line/paragraph separators and bidi embedding/override/isolate controls. */
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]+/g;

/** For anything that can reach a header (subject, Reply-To name) or a table cell: one line, no control characters. */
export const oneLine = (s: string) => s.replace(CONTROL_RE, " ").replace(/\s{2,}/g, " ").trim();

/** Multi-line text (the description): keeps line breaks and tabs, drops other controls, at most 2 blank lines. */
export const multiLine = (s: string) =>
  s
    .replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/* ------------------------------------------------------------------ phone */

/** What the visitor typed, reduced to "+"/"00" and digits (Arabic digits converted, spaces/dashes/dots/brackets gone). */
export const compactPhone = (s: string) => toLatinDigits(s).replace(/[\s().\-–—/]/g, "");
export const isValidPhone = (s: string) => PHONE_RE.test(compactPhone(s));
export const isValidEmail = (s: string) => EMAIL_RE.test(s.trim());

/**
 * International digits for wa.me / tel: links, or null if the number is not usable.
 *   +20 100 123 4567 / 0020 100 123 4567 → 201001234567
 *   01001234567 (Egyptian mobile, local format: 010/011/012/015 + 8 digits) → 201001234567
 *   anything else that already looks international is kept as typed (digits only).
 */
export function intlPhone(raw: string): string | null {
  const c = compactPhone(raw);
  if (!PHONE_RE.test(c)) return null;
  if (c.startsWith("+")) return c.slice(1);
  if (c.startsWith("00")) return c.slice(2);
  if (/^01[0125]\d{8}$/.test(c)) return `20${c.slice(1)}`;
  return c;
}

/* ------------------------------------------------------------------ whole request */

export type RfqProblem = "name" | "contact" | "phone" | "email" | "reply" | "consent";

/** Normalises the raw form values (one line / multi line, capped lengths). Unknown keys are ignored. */
export function normalizeRfq(get: (key: string) => unknown): RfqData {
  const data = {} as RfqData;
  for (const [key] of RFQ_FIELDS) {
    const raw = get(key);
    const s = typeof raw === "string" ? raw : "";
    data[key] = (key === "message" ? multiLine(s) : oneLine(s)).slice(0, RFQ_MAX[key]).trim();
  }
  if (!(REPLY_CHANNELS as readonly string[]).includes(data.reply)) data.reply = "";
  return data;
}

/** Server-side checks (the form runs the same ones field by field). Empty array = valid. */
export function rfqProblems(data: RfqData, consent: unknown): RfqProblem[] {
  const out: RfqProblem[] = [];
  if (data.name.length < RFQ_NAME_MIN) out.push("name");
  if (!data.phone && !data.email) out.push("contact");
  if (data.phone && !isValidPhone(data.phone)) out.push("phone");
  if (data.email && !isValidEmail(data.email)) out.push("email");
  if (data.reply === "email" && !data.email) out.push("reply");
  if (consent !== "yes") out.push("consent");
  return out;
}

export const isUrgent = (data: Pick<RfqData, "timeline">) => data.timeline === URGENT_TIMELINE;

/** Short reference for the visitor and the owner, e.g. "LC-7K3F9" (Crockford base32, no I/L/O/U). */
export function rfqReference(random: Uint8Array = crypto.getRandomValues(new Uint8Array(5))): string {
  const A = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  return `LC-${[...random.subarray(0, 5)].map((b) => A[b % 32]).join("")}`;
}
export const REF_RE = /^LC-[0-9A-HJKMNP-TV-Z]{5}$/;
