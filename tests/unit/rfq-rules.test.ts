/**
 * src/lib/rfq-rules.ts — the quote-form contract shared by the form script (browser) and the Worker.
 * The Worker's use of it is covered end to end in worker.test.ts; these pin the rules themselves.
 *
 * Signature fixtures (tests/unit/fixtures/rfq/*.head) are the first 1024 bytes of real files — all the Worker sniffs:
 * DXF written by ezdxf 1.4.4 (R12 and R2018 ASCII, R2018 binary, the ASCII file with a UTF-8 BOM as Windows tools
 * save it), PDFs from Chromium (Skia) and macOS Quartz (cupsfilter), the Chromium PDF behind CRLFs / a BOM / mail
 * headers, JPEG / PNG / WebP from sharp (libvips) and a ZIP from Python's zipfile.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getMessages, LOCALES } from "~/i18n";
import {
  EVT_KINDS,
  EVT_PLACES,
  REPLY_NEEDS,
  RFQ_FILES,
  RFQ_FILES_ACCEPT,
  RFQ_MAX,
  REF_RE,
  RFQ_SESSION,
  badTypeNames,
  checkFiles,
  compactPhone,
  countryOf,
  fillHref,
  hrefSlot,
  intlPhone,
  isNetworkCountry,
  isValidEmail,
  isValidPhone,
  multiLine,
  networkPhone,
  normalizeRfq,
  oneLine,
  parseEvt,
  rfqProblems,
  rfqReference,
  safeFilename,
  sniffOk,
  toLatinDigits,
  urgencyOf,
} from "~/lib/rfq-rules";

const ch = (...codes: number[]) => String.fromCharCode(...codes);
const bytes = (...b: (number | string)[]) => new Uint8Array(b.flatMap((x) => (typeof x === "string" ? [...x].map((c) => c.charCodeAt(0)) : [x])));
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`./fixtures/rfq/${name}.head`, import.meta.url)));

describe("text", () => {
  it("oneLine: control, line-separator and bidi-override characters become one space", () => {
    expect(oneLine(`a${ch(13, 10)}b${ch(0)}c${ch(0x2028)}d${ch(0x202e)}e${ch(0x2066)}f  g\t`)).toBe("a b c d e f g");
    expect(oneLine("  Nile Foods  ")).toBe("Nile Foods");
  });
  it("multiLine keeps line breaks (CRLF → LF), drops other controls, at most one blank line", () => {
    expect(multiLine(`one${ch(13, 10)}two${ch(7)}${ch(10, 10, 10, 10)}three  ${ch(10)}`)).toBe("one\ntwo\n\nthree");
  });
  it("toLatinDigits converts Arabic-Indic and Extended Arabic-Indic digits", () => {
    expect(toLatinDigits("٠١٢٣٤٥٦٧٨٩ ۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789 0123456789");
  });
});

describe("phone", () => {
  it.each([
    ["+20 100 123 4567", true],
    ["0020-100-123-4567", true],
    ["(010) 0123.4567", true],
    ["٠١٠٠١٢٣٤٥٦٧", true],
    ["1234567", false],
    ["+20 100 123 4567 ext 5", false],
    ["", false],
  ])("isValidPhone(%j) → %s", (v, ok) => expect(isValidPhone(v)).toBe(ok));

  it("compactPhone keeps only + / digits", () => expect(compactPhone(" +20 (100) 123-45.67 ")).toBe("+201001234567"));

  it.each([
    ["Egypt", "EG"],
    ["Arab Republic of Egypt", "EG"],
    ["Cairo, Egypt", "EG"],
    ["مصر", "EG"],
    ["埃及", "EG"],
    ["Mısır", "EG"],
    ["MISIR", "EG"],
    ["Türkiye", "TR"],
    ["TÜRKİYE", "TR"],
    ["Turkey", "TR"],
    ["تركيا", "TR"],
    ["土耳其", "TR"],
    ["China", "CN"],
    ["中国广东", "CN"],
    ["P.R. China", "CN"],
    ["Çin", "CN"],
    ["الصين", "CN"],
    ["Saudi Arabia", "other"],
    ["Deutschland", "other"],
    ["Egypt / China", "other"], // two countries: cannot tell which number format
    ["", null],
    ["   ", null],
  ] as const)("countryOf(%j) → %j", (text, out) => expect(countryOf(text)).toBe(out));

  // UX2-02: the owner's one-tap WhatsApp / call links. Never a guess that dials a stranger: null = "check the number".
  it.each([
    // typed with + or 00: kept (a country code never starts with 0)
    ["+20 100 123 4567", {}, "201001234567"],
    ["0020 100 123 4567", {}, "201001234567"],
    ["+90 532 123 45 67", {}, "905321234567"],
    ["+86 138 0013 8000", {}, "8613800138000"],
    ["+966 50 123 4567", { locale: "ar" }, "966501234567"],
    ["+05321234567", {}, null], // "+0…" is not a country code
    ["0005321234567", {}, null],
    // full international number without the + (specific enough everywhere)
    ["201001234567", { locale: "zh" }, "201001234567"],
    ["905321234567", { locale: "en" }, "905321234567"],
    ["8613800138000", { locale: "ar" }, "8613800138000"],
    // Egyptian mobiles: local format, also without the leading 0 (the r2 '+1' bug), in Arabic digits
    ["01001234567", {}, "201001234567"],
    ["010 0123 4567", { locale: "ar" }, "201001234567"],
    ["٠١٠٠١٢٣٤٥٦٧", { locale: "ar" }, "201001234567"],
    ["01101234567", { locale: "en" }, "201101234567"],
    ["01201234567", { locale: "tr" }, "201201234567"],
    ["01501234567", { locale: "en" }, "201501234567"],
    ["1001234567", { locale: "ar" }, "201001234567"],
    ["1001234567", { locale: "en" }, "201001234567"],
    ["01301234567", { locale: "en" }, null], // 013 is not an Egyptian mobile prefix
    // Turkish mobile on a Turkish page (the r2 J3 persona), with or without the trunk 0
    ["0532 123 45 67", { locale: "tr" }, "905321234567"],
    ["532 123 45 67", { locale: "tr" }, "905321234567"],
    ["0532 123 45 67", { locale: "en" }, null], // English page, no country: Turkish? Turkmen? → check
    ["0532 123 45 67", { locale: "en", country: "Türkiye" }, "905321234567"],
    ["0212 123 45 67", { locale: "tr", country: "Turkey" }, "902121234567"], // Istanbul landline, country given
    ["0212 123 45 67", { locale: "tr" }, null], // landlines only with the country stated
    // Chinese mobile on a Chinese page; a Beijing landline only with the country
    ["138 0013 8000", { locale: "zh" }, "8613800138000"],
    ["138 0013 8000", { locale: "en" }, null], // was wa.me/13800138000 = a North American number
    ["010 1234 5678", { locale: "zh" }, null], // Egyptian mobile or Beijing landline: cannot tell
    ["010 1234 5678", { locale: "zh", country: "中国" }, "861012345678"],
    ["010 1234 5678", { locale: "zh", country: "埃及" }, "201012345678"],
    ["010 1234 5678", { locale: "zh", location: "obour" }, "201012345678"], // an Egyptian plant location
    ["1012345678", { locale: "zh" }, null], // 10-digit: Egyptian mobile without 0, or Beijing without 0
    // Gulf / other numbers in local format: never guessed (0501234567 used to become wa.me/0501234567)
    ["0501234567", { locale: "ar" }, null],
    ["0501234567", { locale: "en", country: "Saudi Arabia" }, null],
    ["01001234567", { locale: "en", country: "Germany" }, null], // a stated non-Egyptian country disables EG guessing
    ["01001234567", { locale: "en", location: "outsideEgypt" }, "201001234567"], // location says only "abroad"
    ["02 2345 6789", { locale: "en", location: "6th-of-october" }, "20223456789"], // Cairo landline, plant in Egypt
    ["02 2345 6789", { locale: "en" }, null],
    ["abc", {}, null],
  ] as const)("intlPhone(%j, %j) → %j", (raw, ctx, out) => expect(intlPhone(raw, ctx)).toBe(out));

  // UX3-03: a guess from the visitor's network country (request.cf.country), offered to the owner as such
  it.each([
    ["0501234567", "SA", "966501234567"],
    ["050 123 4567", "SA", "966501234567"],
    ["501234567", "SA", "966501234567"], // without the trunk 0
    ["٠٥٠١٢٣٤٥٦٧", "SA", "966501234567"], // Arabic-Indic digits
    ["055 123 4567", "AE", "971551234567"],
    ["0531234567", "AE", null], // 053 is not a UAE mobile prefix
    ["0532 123 45 67", "TR", "905321234567"],
    ["01001234567", "EG", "201001234567"],
    ["138 0013 8000", "CN", "8613800138000"],
    ["02 2345 6789", "EG", null], // mobiles only: a landline could be anywhere in the country's numbering
    ["0501234567", "DE", null], // no known format for that country
    ["0501234567", "XX", null], // Cloudflare: unknown
    ["0501234567", "T1", null], // Cloudflare: Tor
    ["0501234567", undefined, null],
    ["+966501234567", "SA", null], // already international: intlPhone() handles it, no guess
    ["00966501234567", "SA", null],
    ["12", "SA", null],
  ] as const)("networkPhone(%j, %j) → %j", (raw, cc, out) => expect(networkPhone(raw, cc)).toBe(out));

  // PSC4-05: never a guess against the country the visitor typed (Saudi 05x mobiles are UAE formats too)
  it.each([
    ["0501234567", "AE", "Saudi Arabia", null],
    ["0501234567", "SA", "Germany", null],
    ["0501234567", "SA", "Riyadh", null], // not a country name we know: their answer is not the network's
    ["0501234567", "SA", "Saudi Arabia", "966501234567"],
    ["0501234567", "SA", "KSA", "966501234567"],
    ["0501234567", "SA", "المملكة العربية السعودية", "966501234567"],
    ["055 123 4567", "AE", "UAE", "971551234567"],
    ["055 123 4567", "AE", "Dubai, United Arab Emirates", "971551234567"],
    ["055 123 4567", "AE", "الإمارات", "971551234567"],
    ["0532 123 45 67", "TR", "Türkiye", "905321234567"],
    ["0501234567", "SA", "  ", "966501234567"], // empty: the network may guess
  ] as const)("networkPhone(%j, %j, typed %j) → %j", (raw, cc, typed, out) => expect(networkPhone(raw, cc, typed)).toBe(out));

  it("isNetworkCountry: ISO codes only", () => {
    expect(["SA", "EG", "DE"].every(isNetworkCountry)).toBe(true);
    expect([undefined, "", "XX", "T1", "sa", "SAU", 1].some(isNetworkCountry)).toBe(false);
  });
});

describe("email", () => {
  it.each([
    ["ahmed@example.com", true],
    ["a.b+c@sub.example.co", true],
    ["  ahmed@example.com  ", true], // trimmed
    ["eng.team@plant2.eg.example.com.eg", true], // deep subdomain
    ["o'brien@example.ie", true],
    ["first_last-1@example-mail.com", true],
    ["li@xn--fiqs8s.xn--55qx5d", true], // punycode (IDN in ASCII)
    ["a@b", false],
    ["a b@example.com", false],
    ["@example.com", false],
    ["ahmed@", false],
    // CODE2-20: characters that change the meaning of an address header never reach the Reply-To
    ["a@b.com,", false],
    ["a@b.com, c@d.com", false],
    ["a@b.com>", false],
    ["a@b.com;bcc", false],
    ["a@b.com;bcc=x@evil.example", false],
    ["a<b>@c.com", false],
    ['"a"@b.com', false],
    ["a(comment)@b.com", false],
    ["a@[127.0.0.1]", false],
    ["a\\b@c.com", false],
    ["a@b:25.com", false],
    ["a@b.c\tom", false],
  ])("isValidEmail(%j) → %s", (v, ok) => expect(isValidEmail(v)).toBe(ok));
});

describe("whole request", () => {
  const get = (o: Record<string, string>) => (k: string) => o[k] ?? null;

  it("normalizeRfq caps every field at the form's maxlength and ignores unknown keys", () => {
    const d = normalizeRfq(get({ name: "n".repeat(500), message: "m".repeat(5000), bcc: "x@evil.example" }));
    expect(d.name).toHaveLength(RFQ_MAX.name);
    expect(d.message).toHaveLength(RFQ_MAX.message);
    expect(Object.keys(d)).not.toContain("bcc");
    expect(d.email).toBe("");
  });

  it("rfqProblems: name, phone OR email, valid formats, consent", () => {
    const ok = normalizeRfq(get({ name: "Ahmed", phone: "01001234567" }));
    expect(rfqProblems(ok, "yes")).toEqual([]);
    expect(rfqProblems(normalizeRfq(get({ name: "Li Wei", email: "li@example.cn" })), "yes")).toEqual([]);
    expect(rfqProblems(normalizeRfq(get({ name: "A" })), "no")).toEqual(["name", "contact", "consent"]);
    expect(rfqProblems(normalizeRfq(get({ name: "Ahmed", phone: "12", email: "x@y" })), "yes")).toEqual(["phone", "email"]);
    expect(normalizeRfq(get({ reply: "telegram" })).reply).toBe("");
    expect(normalizeRfq(get({ reply: "phone" })).reply).toBe("phone");
  });

  // UX2-07: the preferred reply channel needs its contact detail
  it.each([
    [{ reply: "email", phone: "01001234567" }, ["reply"]],
    [{ reply: "email", email: "a@example.com" }, []],
    [{ reply: "phone", email: "li@example.cn" }, ["reply"]], // zh: 电话 chosen, no number
    [{ reply: "whatsapp", email: "a@example.com" }, ["reply"]],
    [{ reply: "phone", phone: "+86 138 0013 8000" }, []],
    [{ reply: "whatsapp", phone: "01001234567" }, []],
    [{ reply: "", email: "a@example.com" }, []],
  ] as const)("reply %j → %j", (fields, out) => {
    expect(rfqProblems(normalizeRfq(get({ name: "Ahmed", ...fields })), "yes")).toEqual(out);
  });
  it("REPLY_NEEDS maps every channel", () => expect(REPLY_NEEDS).toEqual({ whatsapp: "phone", phone: "phone", email: "email" }));

  // UX2-06: "Skip and send now" troubleshooting requests (no timeline) are flagged as possibly urgent
  it.each([
    [{ timeline: "urgent", service: "control-panels" }, "urgent"],
    [{ timeline: "urgent", service: "maintenance-support" }, "urgent"],
    [{ timeline: "", service: "maintenance-support" }, "likely"],
    [{ timeline: "within-1-month", service: "maintenance-support" }, ""], // the visitor gave a timeline: trust it
    [{ timeline: "", service: "control-panels" }, ""],
  ] as const)("urgencyOf(%j) → %j", (d, out) => expect(urgencyOf(d)).toBe(out));

  it("rfqReference: LC- + 5 Crockford base32 characters", () => {
    expect(rfqReference(new Uint8Array([0, 1, 31, 32, 255]))).toBe("LC-01Z0Z");
    for (let i = 0; i < 50; i++) expect(rfqReference()).toMatch(REF_RE);
    expect(REF_RE.test("LC-ILOU0")).toBe(false);
  });
});

describe("attachments", () => {
  const f = (name: string, size = 1000) => ({ name, size });
  it("accept list matches the allowed extensions", () => {
    expect(RFQ_FILES_ACCEPT).toBe(".pdf,.jpg,.jpeg,.png,.webp,.zip,.dwg,.dxf");
  });
  it.each([
    [[], null],
    [[f("a.pdf"), f("b.JPG"), f("c.dwg")], null],
    [[f("a.pdf"), f("b.pdf"), f("c.pdf"), f("d.pdf")], "count"],
    [[f("a.pdf", RFQ_FILES.maxTotal), f("b.pdf", 1)], "size"],
    [[f("a.pdf", RFQ_FILES.maxTotal)], null],
    [[f("setup.exe")], "type"],
    [[f("noext")], "type"],
    [[f("constructor")], "type"], // no prototype keys as extensions
    [[f("a.constructor")], "type"],
    [[f("a.__proto__")], "type"],
    [[f("a.toString")], "type"],
    [[f("", 0)], null], // an empty file input
    // a wrong type is reported first, whatever else is wrong (the answer then names the files to remove)
    [[f("a.pdf"), f("b.pdf"), f("c.pdf"), f("setup.exe")], "type"],
    [[f("a.pdf", RFQ_FILES.maxTotal), f("notes.docx")], "type"],
    [[f("a.pdf"), f("b.pdf"), f("c.pdf"), f("d.pdf", RFQ_FILES.maxTotal)], "count"], // then the count, then the size
  ] as const)("checkFiles(%j) → %s", (files, out) => expect(checkFiles(files)).toBe(out));

  it("the generic attachment error states the real limits in every locale (CS2-14)", () => {
    for (const l of ["en", "ar", "zh", "tr"]) {
      const text: string = JSON.parse(readFileSync(new URL(`../../src/i18n/messages/${l}/contact.json`, import.meta.url), "utf8")).errors.attachments;
      expect(text, l).toMatch(new RegExp(`(^|\\D)${RFQ_FILES.maxCount}(\\D|$)`));
      expect(text, l).toContain(`${RFQ_FILES.maxTotal / 1024 / 1024} MB`);
    }
  });

  it("badTypeNames names the files to remove (A11Y2-05 / UX2-05)", () => {
    expect(badTypeNames([f("drawing.pdf"), f("setup.exe"), f("notes.docx"), f("empty.exe", 0)])).toEqual(["setup.exe", "notes.docx"]);
  });

  it.each([
    ["pdf", bytes("%PDF-1.7"), true],
    ["pdf", bytes("MZ", 0x90, 0), false],
    ["pdf", bytes(" ".repeat(1019), "%PDF-"), true], // header ending at byte 1024
    ["pdf", bytes(" ".repeat(1020), "%PDF-"), false], // beyond the first 1024 bytes
    ["png", bytes(0x89, "PNG", 13, 10, 0x1a, 10), true],
    ["png", bytes(0x89, "PNG"), false], // truncated signature
    ["jpg", bytes(0xff, 0xd8, 0xff, 0xe0), true],
    ["jpeg", bytes(0xff, 0xd8, 0xff, 0xe1), true],
    ["webp", bytes("RIFF", 0, 0, 0, 0, "WEBP"), true],
    ["webp", bytes("RIFF", 0, 0, 0, 0, "WAVE"), false],
    ["zip", bytes("PK", 3, 4), true],
    ["zip", bytes("PK", 5, 6), true], // empty archive (end of central directory first)
    ["zip", bytes("PK", 7, 8), true], // spanned archive
    ["zip", bytes("PK", 1, 2), false],
    ["png", bytes(0xff, 0xd8, 0xff, 0xe0), false],
    ["jpg", bytes(0x89, "PNG", 13, 10, 0x1a, 10), false],
    ["jpg", bytes(0xff, 0xd8), false],
    ["dwg", bytes("AC1032"), true],
    ["dwg", bytes("AC2.10"), true],
    ["dwg", bytes("ACAD"), false],
    ["dxf", bytes("  0\r\nSECTION\r\n"), true],
    ["dxf", bytes("999\nCreated by a CAD tool\n  0\nSECTION\n"), true],
    ["dxf", bytes(0xef, 0xbb, 0xbf, "  0\nSECTION\n"), true], // optional UTF-8 BOM (Windows tools)
    ["dxf", bytes(0xef, 0xbb, 0xbf, "<svg xmlns=\"http://www.w3.org/2000/svg\">"), false], // a BOM alone is not enough
    ["dxf", bytes("<!doctype html><html>"), false], // printable text that is not DXF (renamed .html / .svg)
    ["dxf", bytes("AutoCAD Binary DXF\r\n", 0x1a, 0), true],
    ["dxf", bytes(0, 1, 2), false],
    ["dxf", bytes("hello world, not a drawing"), false],
    ["dxf", bytes("MZ", 0x90, 0, 3, 0), false],
    ["exe", bytes("MZ"), false],
  ] as const)("sniffOk(%s, …) → %s", (ext, head, ok) => expect(sniffOk(ext, head)).toBe(ok));

  it.each([
    ["dxf", "r12-ascii.dxf"],
    ["dxf", "r2018-ascii.dxf"],
    ["dxf", "r2018-ascii-bom.dxf"],
    ["dxf", "r2018-binary.dxf"],
    ["pdf", "chromium.pdf"],
    ["pdf", "quartz.pdf"],
    ["pdf", "pdf-leading-crlf.pdf"],
    ["pdf", "pdf-utf8-bom.pdf"],
    ["pdf", "pdf-mail-header.pdf"],
    ["jpg", "photo.jpg"],
    ["png", "panel.png"],
    ["webp", "screen.webp"],
    ["zip", "drawings.zip"],
  ])("real %s file %s passes the signature check", (ext, name) => expect(sniffOk(ext, fixture(name))).toBe(true));

  it("…and a real file renamed to the wrong extension does not", () => {
    expect(sniffOk("pdf", fixture("r12-ascii.dxf"))).toBe(false);
    expect(sniffOk("dxf", fixture("chromium.pdf"))).toBe(false);
    expect(sniffOk("png", fixture("photo.jpg"))).toBe(false);
  });

  it("safeFilename drops the path and control characters, keeps the extension's case, caps the length", () => {
    expect(safeFilename("C:\\fakepath\\I-O list.PDF")).toBe("I-O list.PDF");
    expect(safeFilename(`../../a${ch(13, 10)}b.pdf`)).toBe("a b.pdf");
    expect(safeFilename(`${"x".repeat(200)}.dwg`)).toBe(`${"x".repeat(90)}.dwg`);
    expect(safeFilename('a"<b>|c?.png')).toBe("a__b__c_.png");
    expect(safeFilename(".pdf")).toBe("file.pdf");
  });
});

describe("click counts (parseEvt)", () => {
  const ok = { k: "whatsapp", p: "hero", l: "ar", u: "/ar/services/control-panels/" };
  it("accepts a well-formed event", () => {
    expect(parseEvt(ok)).toEqual({ kind: "whatsapp", place: "hero", locale: "ar", path: "/ar/services/control-panels/" });
    for (const k of EVT_KINDS) expect(parseEvt({ ...ok, k })?.kind).toBe(k);
    for (const p of EVT_PLACES) expect(parseEvt({ ...ok, p })?.place).toBe(p);
    expect(parseEvt({ ...ok, u: "/" })?.path).toBe("/");
  });
  it.each([
    ["unknown kind", { ...ok, k: "purchase" }],
    ["unknown place", { ...ok, p: "<script>" }],
    ["unknown locale", { ...ok, l: "fr" }],
    ["query string", { ...ok, u: "/ar/contact/?name=Ahmed" }],
    ["hash", { ...ok, u: "/ar/contact/#quote" }],
    ["email-like path", { ...ok, u: "/ar/a@b.com/" }],
    ["absolute URL", { ...ok, u: "https://evil.example/" }],
    ["too long", { ...ok, u: `/ar/${"a".repeat(200)}/` }],
    ["upper case", { ...ok, u: "/AR/Contact/" }],
    ["not an object", "whatsapp"],
    ["null", null],
  ])("rejects %s", (_, raw) => expect(parseEvt(raw)).toBeNull());
});

describe("hand-over links (fillHref)", () => {
  const wa = `https://wa.me/201103197233?text=${hrefSlot("text")}`;
  it("hrefSlot is the percent-encoded {name} a server-built URL carries", () => {
    expect(hrefSlot("ref")).toBe("%7Bref%7D");
    expect(`https://wa.me/201103197233?text=${encodeURIComponent("{text}")}`).toBe(wa);
  });
  it("fills every slot with the percent-encoded value; other text is left alone", () => {
    expect(fillHref(wa, { text: "Hello & مرحبًا #1" })).toBe(`https://wa.me/201103197233?text=${encodeURIComponent("Hello & مرحبًا #1")}`);
    const tpl = `https://wa.me/1?text=${encodeURIComponent("Request {ref}: more files for {ref}")}`;
    expect(fillHref(tpl, { ref: "LC-7K3F9" })).toBe(`https://wa.me/1?text=${encodeURIComponent("Request LC-7K3F9: more files for LC-7K3F9")}`);
    expect(fillHref("https://wa.me/1?text=%7bref%7d", { ref: "LC-7K3F9" })).toBe("https://wa.me/1?text=LC-7K3F9"); // lower-case hex
  });
  it("a slot without a value stays as it is; a value can never inject a parameter", () => {
    expect(fillHref(wa, {})).toBe(wa);
    expect(fillHref(wa, { text: "a&phone=1#x" })).toBe("https://wa.me/201103197233?text=a%26phone%3D1%23x");
  });
  it("mailto: bodies get CRLF line breaks (RFC 6068); other links keep LF", () => {
    const mail = `mailto:info@logic-controls.com?subject=${encodeURIComponent("Quote {ref}")}&body=${hrefSlot("text")}`;
    expect(fillHref(mail, { ref: "LC-7K3F9", text: "a\nb\r\nc" })).toBe(
      `mailto:info@logic-controls.com?subject=Quote%20LC-7K3F9&body=${encodeURIComponent("a\r\nb\r\nc")}`,
    );
    expect(fillHref(wa, { text: "a\nb" })).toBe("https://wa.me/201103197233?text=a%0Ab");
  });
  it("sessionStorage keys are distinct", () => {
    expect(new Set(Object.values(RFQ_SESSION)).size).toBe(Object.keys(RFQ_SESSION).length);
  });
});

describe("thanks page: urgent hand-off texts (I18N3-07)", () => {
  /** The prompt the visitor completes ("Machine and brand:"): the last sentence of a line, ending with a colon. */
  const prompt = (line: string) => /[^.。]*[:：]$/.exec(line)?.[0].trim();
  for (const l of LOCALES) {
    it(`${l}: every language line names the request first and ends with the same prompt as the plain "machine stopped" message`, () => {
      const m = getMessages(l);
      const urgent = m.contact.thanks.urgentNow.whatsapp.split("\n");
      const stopped = m.common.whatsapp.stopped.split("\n");
      expect(urgent).toHaveLength(stopped.length); // tr / zh: the local line, then the English one
      urgent.forEach((line, i) => {
        expect(line).toContain("{ref}");
        expect(line.indexOf("{ref}")).toBeLessThan(line.length / 2);
        expect(prompt(line)).toBe(prompt(stopped[i]!));
        expect(prompt(line)).toBeTruthy();
      });
      expect(m.contact.thanks.urgentNow.emailSubject).toContain("{ref}");
    });
  }
});
