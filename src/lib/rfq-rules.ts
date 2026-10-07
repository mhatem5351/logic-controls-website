/**
 * The quote-request (RFQ) contract, shared by the form's client script (src/scripts/rfq-form.ts) and the Worker
 * (worker/index.ts → POST /api/rfq), so both sides apply the same limits and the same validation.
 * Plain TypeScript: no Astro, DOM or Workers imports (it runs in the browser, in workerd and in Vitest).
 *
 * Contract (multipart/form-data or x-www-form-urlencoded):
 *   name, company, phone, email, reply (preferred channel: whatsapp | phone | email), country, location, service,
 *   industry, timeline, message, page, locale, consent=yes,
 *   files (0–3 attachments, multipart only), honeypot lc_hp, cf-turnstile-response,
 *   name.dir / company.dir / message.dir (the browser's `dirname`: "ltr" | "rtl"),
 *   dropped (names of the files the visitor left out after a timed-out upload: "Send without the files").
 * A request needs a name, a phone OR an email (zh visitors may give only an email), the contact detail its preferred
 * reply channel needs (email → an email address; phone call / WhatsApp → a phone number), consent, and a Turnstile
 * token.
 */

import { isLocale, type Locale } from "../i18n/config";

/** The site's locales (src/i18n/config.ts, plain data: safe to bundle into the Worker). */
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
export type ReplyChannel = (typeof REPLY_CHANNELS)[number];
/** The contact detail each reply channel needs. */
export const REPLY_NEEDS: Record<ReplyChannel, "phone" | "email"> = { whatsapp: "phone", phone: "phone", email: "email" };

/** The timeline choice that means "a machine is stopped": flagged [URGENT] in the subject, triggers the call-now panel. */
export const URGENT_TIMELINE = "urgent";
/** Services where a stopped machine is the usual reason to write: the form offers the call-now panel right away. */
export const URGENT_SERVICES: readonly string[] = ["maintenance-support"];

/**
 * local@domain.tld, deliberately loose (any language, plus addressing, punycode and Unicode domains) but never with
 * whitespace or the characters that change the meaning of an address header: <>()[]\,;:" — "a@b.com, c@d.com",
 * "a@b.com>" or "a@b.com;bcc" would otherwise reach the email's Reply-To (and could make the send fail).
 */
export const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
/** After toLatinDigits() and stripping separators: optional + or 00, then 8–15 digits. */
export const PHONE_RE = /^(\+|00)?\d{8,15}$/;

/* ------------------------------------------------------------------ attachments */

export const RFQ_FILES = {
  /** Form field name (multiple). */
  field: "files",
  maxCount: 3,
  /** Total raw bytes of all files. The email binding allows 25 MiB to a verified address; this keeps uploads quick on
   *  mobile data and the Worker's multipart parsing far inside the Free plan's 10 ms CPU. Large photos are reduced in
   *  the browser before they count against it (src/scripts/rfq-form.ts → IMAGE_MAX_SIDE). */
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
  /** Text field: the files the visitor left out because the upload was too slow ("Send without the files",
   *  DEV3-01), comma separated; the owner's email names them. One line, at most `droppedMax` characters. */
  dropped: "dropped",
  droppedMax: 300,
} as const;
export const RFQ_FILES_ACCEPT = Object.keys(RFQ_FILES.types)
  .map((e) => `.${e}`)
  .join(",");
/** Request body cap (bytes): attachments + generous room for the text fields and multipart framing. */
export const RFQ_MAX_BODY = RFQ_FILES.maxTotal + 64 * 1024;
/** How many leading bytes sniffOk() looks at (a PDF header may sit anywhere in the first 1024 bytes). */
export const SNIFF_BYTES = 1024;

export type FileProblem = "count" | "size" | "type";
export const fileExt = (name: string) => /\.([a-z0-9]{1,5})$/i.exec(name)?.[1]?.toLowerCase() ?? "";
const acceptedExt = (name: string) => Object.hasOwn(RFQ_FILES.types, fileExt(name));

/** Names of the files whose extension the form does not accept (empty files are ignored). */
export const badTypeNames = (files: readonly { name: string; size: number }[]) => files.filter((f) => f.size > 0 && !acceptedExt(f.name)).map((f) => f.name);

/** Checks a selection of files ({ name, size }) against the limits; null when fine. Empty files are ignored. */
export function checkFiles(files: readonly { name: string; size: number }[]): FileProblem | null {
  const real = files.filter((f) => f.size > 0);
  if (badTypeNames(real).length) return "type";
  if (real.length > RFQ_FILES.maxCount) return "count";
  if (real.reduce((n, f) => n + f.size, 0) > RFQ_FILES.maxTotal) return "size";
  return null;
}

/**
 * Does the file start with the signature its extension promises? (A renamed .exe is not a PDF.) `head` is the file's
 * first bytes (up to SNIFF_BYTES); the checks are lenient where real files are:
 *   pdf  "%PDF-" anywhere in the first 1024 bytes (the PDF spec's tolerance: BOMs, blank lines, mail headers)
 *   dxf  text DXF ("0 / SECTION" or a "999" comment first, optional UTF-8 BOM and indentation) or binary DXF
 *        ("AutoCAD Binary DXF\r\n\x1a\0")
 *   dwg  "AC" + a version digit ("AC1015", "AC1032", "AC2.10" …)
 *   zip  local file header, empty archive or spanned-archive marker
 */
export function sniffOk(ext: string, head: Uint8Array): boolean {
  const starts = (...sig: number[]) => sig.every((b, i) => head[i] === b);
  const ascii = (s: string, at = 0) => [...s].every((c, i) => head[at + i] === c.charCodeAt(0));
  switch (ext) {
    case "pdf":
      return indexOfAscii(head, "%PDF-", SNIFF_BYTES) >= 0;
    case "png":
      return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case "jpg":
    case "jpeg":
      return starts(0xff, 0xd8, 0xff);
    case "webp":
      return ascii("RIFF") && ascii("WEBP", 8);
    case "zip":
      return starts(0x50, 0x4b, 0x03, 0x04) || starts(0x50, 0x4b, 0x05, 0x06) || starts(0x50, 0x4b, 0x07, 0x08);
    case "dwg":
      return ascii("AC") && head[2] !== undefined && head[2] >= 0x30 && head[2] <= 0x39;
    case "dxf": {
      if (ascii("AutoCAD Binary DXF")) return true;
      const at = starts(0xef, 0xbb, 0xbf) ? 3 : 0;
      const text = head.subarray(at, at + 64);
      // text DXF: printable ASCII, tabs and line breaks only at the start (a binary file has NULs and control bytes)
      if (!text.length || text.some((b) => b === 127 || (b < 32 && b !== 9 && b !== 10 && b !== 13))) return false;
      return /^\s*(?:0\r?\n\s*SECTION\b|999\r?\n)/.test(String.fromCharCode(...text));
    }
    default:
      return false;
  }
}
function indexOfAscii(head: Uint8Array, s: string, within: number): number {
  const first = s.charCodeAt(0);
  const end = Math.min(head.length, within) - s.length;
  outer: for (let i = 0; i <= end; i++) {
    if (head[i] !== first) continue;
    for (let j = 1; j < s.length; j++) if (head[i + j] !== s.charCodeAt(j)) continue outer;
    return i;
  }
  return -1;
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

/** Countries whose local number formats the form can complete with a country code (the site's three markets). */
export type PhoneCountry = "EG" | "TR" | "CN";
/** What the request says about where the visitor is: the country field, the plant location, the page language. */
export interface PhoneContext {
  locale?: string;
  /** Free text "Country" field (any language). */
  country?: string;
  /** "Plant location" select: an Egyptian zone slug, "otherEgypt" or "outsideEgypt". */
  location?: string;
}

const DIAL: Record<PhoneCountry, string> = { EG: "20", TR: "90", CN: "86" };
/**
 * National formats → the national significant number (what follows the country code).
 *   EG mobile 010/011/012/015 + 8 digits (also typed without the 0), landline 0 + 9 digits (02 Cairo, 03 Alexandria …)
 *   TR mobile 05xx xxx xx xx (also without the 0), landline 0 + area 2xx–4xx + 7 digits
 *   CN mobile 1[3-9] + 9 digits, landline 0 + area code + 7–8 digits (010 Beijing, 021 Shanghai …)
 */
const NATIONAL: Record<PhoneCountry, { mobile: RegExp[]; other: RegExp[] }> = {
  EG: { mobile: [/^0(1[0125]\d{8})$/, /^(1[0125]\d{8})$/], other: [/^0([2-9]\d{8})$/] },
  TR: { mobile: [/^0?(5\d{9})$/], other: [/^0?([2-4]\d{9})$/] },
  CN: { mobile: [/^(1[3-9]\d{9})$/], other: [/^0([1-9]\d{8,10})$/] },
};
/** Typed with the country code but without "+"/"00" ("201001234567"): specific enough to accept anywhere. */
const BARE_INTL = [/^20(1[0125]\d{8})$/, /^90(5\d{9})$/, /^86(1[3-9]\d{9})$/];

/** Country names as visitors write them (accents folded, lower case): whole words, plus CJK names anywhere. */
interface CountryWords {
  words: string[];
  cjk: string[];
}
const COUNTRY_WORDS: Record<PhoneCountry, CountryWords> = {
  EG: { words: ["egypt", "egyptian", "misir", "mısır", "eg", "egy", "مصر"], cjk: ["埃及"] },
  TR: { words: ["turkey", "turkiye", "turkei", "tr", "tur", "تركيا"], cjk: ["土耳其"] },
  CN: { words: ["china", "chinese", "prc", "cin", "cn", "chn", "الصين"], cjk: ["中国", "中國", "中华人民共和国"] },
};
const fold = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
/** Does the text name this country (one of its words, accents folded; or a CJK name anywhere)? */
const names = (text: string, c: CountryWords) => {
  const words = new Set(fold(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  return c.words.some((w) => words.has(fold(w))) || c.cjk.some((w) => text.includes(w));
};

/** The country the free-text country field names, "other" for any other non-empty text, null when empty. */
export function countryOf(text: string | undefined): PhoneCountry | "other" | null {
  const s = (text ?? "").trim();
  if (!s) return null;
  const hits = (Object.keys(COUNTRY_WORDS) as PhoneCountry[]).filter((c) => names(s, COUNTRY_WORDS[c]));
  return hits.length === 1 ? hits[0]! : "other";
}

/**
 * International digits for wa.me / tel: links, or null when the number is not usable or its country cannot be told
 * (the owner then gets the number as typed and a "check the country code" note, never a link that dials a stranger).
 *   "+…" / "00…"                         → as typed (a country code never starts with 0)
 *   "201001234567", "905321234567", …    → as typed (full Egyptian / Turkish / Chinese number without the +)
 *   local format, country known          → country code + national number (country field, else an Egyptian plant
 *                                           location; a field naming another country disables local guessing)
 *   local format, only the page language → mobile formats that cannot be read two ways: Egyptian mobiles on en/ar/tr,
 *                                           Turkish mobiles on tr, Chinese mobiles on zh. Everything else → null
 *                                           (e.g. 010 1234 5678 on zh: an Egyptian mobile or a Beijing landline).
 */
export function intlPhone(raw: string, ctx: PhoneContext = {}): string | null {
  const c = compactPhone(raw);
  if (!PHONE_RE.test(c)) return null;
  const international = c.startsWith("+") ? c.slice(1) : c.startsWith("00") ? c.slice(2) : null;
  if (international !== null) return /^[1-9]\d{6,14}$/.test(international) ? international : null;
  for (const re of BARE_INTL) if (re.test(c)) return c;

  const named = countryOf(ctx.country);
  const loc = (ctx.location ?? "").trim();
  const known: PhoneCountry | "other" | null = named ?? (loc && loc !== "outsideEgypt" && /^[a-zA-Z0-9-]{2,40}$/.test(loc) ? "EG" : null);
  if (known === "other") return null;
  const match = (country: PhoneCountry, kinds: ("mobile" | "other")[]) => {
    for (const kind of kinds)
      for (const re of NATIONAL[country][kind]) {
        const m = re.exec(c);
        if (m) return DIAL[country] + m[1]!;
      }
    return null;
  };
  if (known) return match(known, ["mobile", "other"]);
  switch (ctx.locale) {
    case "zh":
      return match("CN", ["mobile"]);
    case "tr":
      return match("TR", ["mobile"]) ?? match("EG", ["mobile"]);
    default: // en, ar, or unknown: the site's Egyptian visitors
      return match("EG", ["mobile"]);
  }
}

/** Mobile formats a visitor types without the country code, by the country their connection comes from, with the
 *  country's names as visitors write them (a typed country must be this one for a guess, PSC4-05). */
const NETWORK_MOBILE: Record<string, { dial: string; mobile: RegExp[]; names: CountryWords }> = {
  ...Object.fromEntries(
    (Object.keys(DIAL) as PhoneCountry[]).map((c) => [c, { dial: DIAL[c], mobile: NATIONAL[c].mobile, names: COUNTRY_WORDS[c] }]),
  ),
  // 05x xxx xxxx
  SA: { dial: "966", mobile: [/^0?(5\d{8})$/], names: { words: ["saudi", "ksa", "السعودية", "السعوديه"], cjk: ["沙特"] } },
  // 050 / 052 / 054 / 055 / 056 / 058 + 7 digits
  AE: {
    dial: "971",
    mobile: [/^0?(5[024568]\d{7})$/],
    names: { words: ["uae", "emirates", "dubai", "sharjah", "ajman", "الإمارات", "دبي", "الشارقة"], cjk: ["阿联酋", "迪拜"] },
  },
};
/** "SA", "AE"…: a real ISO country, not Cloudflare's "XX" (unknown) or "T1" (Tor). */
export const isNetworkCountry = (cc: unknown): cc is string => typeof cc === "string" && /^[A-Z]{2}$/.test(cc) && cc !== "XX";

/**
 * UX3-03: a GUESS for the owner, never applied silently. When intlPhone() cannot tell the country, a local mobile
 * number that matches the format of the country the visitor's connection comes from (the Worker's
 * request.cf.country) may be from there: the owner's email offers it labelled "guessed from the network: confirm".
 * Null when that country is unknown, not covered, or the number is not one of its mobile formats — and when the
 * visitor's own answer in the country field names something else (PSC4-05: "Saudi Arabia" typed on a UAE network
 * must not become a link to +971: Saudi 050 / 054 / 055 / 056 / 058 mobiles are also UAE formats). Their answer wins:
 * no guess against it.
 */
export function networkPhone(raw: string, network: string | null | undefined, typedCountry?: string): string | null {
  const c = compactPhone(raw);
  const country = isNetworkCountry(network) ? NETWORK_MOBILE[network] : undefined;
  if (!country || !PHONE_RE.test(c) || /^(\+|00)/.test(c)) return null;
  const typed = (typedCountry ?? "").trim();
  if (typed && !names(typed, country.names)) return null;
  for (const re of country.mobile) {
    const m = re.exec(c);
    if (m) return country.dial + m[1]!;
  }
  return null;
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
  if (data.reply && !data[REPLY_NEEDS[data.reply as ReplyChannel]]) out.push("reply");
  if (consent !== "yes") out.push("consent");
  return out;
}

/**
 * How urgent the request is for the owner's inbox:
 *   "urgent"  the visitor said a machine is stopped (timeline "urgent", or the "a machine is stopped now" switch)
 *   "likely"  troubleshooting / maintenance sent without any timeline (typically "Skip and send now"): flagged so it
 *             is read first, but labelled as not confirmed
 */
export type Urgency = "urgent" | "likely" | "";
export function urgencyOf(data: Pick<RfqData, "timeline" | "service">): Urgency {
  if (data.timeline === URGENT_TIMELINE) return "urgent";
  if (!data.timeline && URGENT_SERVICES.includes(data.service)) return "likely";
  return "";
}

/* ------------------------------------------------------------------ hand-over: form → thanks page, links */

/**
 * sessionStorage keys (same tab only):
 *   draft  what the visitor typed or chose, kept across a language switch (src/scripts/rfq-draft.ts); cleared on success
 *   sent   the form's summary of a sent request (RfqSent in src/scripts/rfq-form.ts); read once, then deleted by the
 *          thanks page (it holds the visitor's name and company)
 *   last   the last request number and its urgency, no personal data: the thanks page falls back to it when ?ref= is
 *          missing (a language switch from a page that did not keep it, a link without it), so the number stays
 */
export const RFQ_SESSION = { draft: "lcRfqDraft", sent: "lcRfqSent", last: "lcRfqLast" } as const;

/** A link slot as it appears in a URL the server built: hrefSlot("text") → "%7Btext%7D" (whatsappLink("{text}")). */
export const hrefSlot = (key: string) => encodeURIComponent(`{${key}}`);

/**
 * Fills a link template the server rendered with the site's own builders (whatsappLink("{text}"),
 * mailtoLink(subject) + "&body=" + hrefSlot("text") …): each slot becomes the percent-encoded value, so the browser
 * never rebuilds wa.me / mailto: URLs itself (CODE2-09). In mailto: links, line breaks become CRLF (RFC 6068).
 * A slot without a value is left as it is.
 */
export function fillHref(template: string, values: Readonly<Record<string, string | undefined>>): string {
  const mailto = /^mailto:/i.test(template);
  return template.replace(/%7B(\w+)%7D/gi, (slot, key: string) => {
    const v = values[key];
    return v === undefined ? slot : encodeURIComponent(mailto ? v.replace(/\r?\n/g, "\r\n") : v);
  });
}

/** Short reference for the visitor and the owner, e.g. "LC-7K3F9" (Crockford base32, no I/L/O/U). */
export function rfqReference(random: Uint8Array = crypto.getRandomValues(new Uint8Array(5))): string {
  const A = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  return `LC-${[...random.subarray(0, 5)].map((b) => A[b % 32]).join("")}`;
}
export const REF_RE = /^LC-[0-9A-HJKMNP-TV-Z]{5}$/;

/* ------------------------------------------------------------------ click counts (POST /api/evt) */

/** What a counted click was: a channel or the quote form (no personal data, ever). */
export const EVT_KINDS = ["whatsapp", "call", "email", "copy-email", "quote", "form-sent"] as const;
/** Where on the page it was (the analytics script derives it from the clicked element's container). */
export const EVT_PLACES = ["header", "drawer", "hero", "band", "fab", "footer", "form", "contact", "thanks", "body"] as const;
export type EvtKind = (typeof EVT_KINDS)[number];
export type EvtPlace = (typeof EVT_PLACES)[number];
export interface Evt {
  kind: EvtKind;
  place: EvtPlace;
  locale: Locale;
  /** Path without query or hash, e.g. /ar/services/control-panels/ */
  path: string;
}
export const EVT_MAX_BODY = 512;

/** Validates a click event posted by src/scripts/analytics.ts; null when anything is off (never echoed back). */
export function parseEvt(raw: unknown): Evt | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const kind = o.k, place = o.p, locale = o.l, path = o.u;
  if (!(EVT_KINDS as readonly unknown[]).includes(kind) || !(EVT_PLACES as readonly unknown[]).includes(place) || !isLocale(locale)) return null;
  if (typeof path !== "string" || path.length > 120 || !/^\/(?:[a-z]{2}\/)?(?:[a-z0-9-]+\/)*$/.test(path)) return null;
  return { kind: kind as EvtKind, place: place as EvtPlace, locale, path };
}
