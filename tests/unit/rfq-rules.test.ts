/**
 * src/lib/rfq-rules.ts — the quote-form contract shared by the form script (browser) and the Worker.
 * The Worker's use of it is covered end to end in worker.test.ts; these pin the rules themselves.
 */
import { describe, expect, it } from "vitest";
import {
  RFQ_FILES,
  RFQ_FILES_ACCEPT,
  RFQ_MAX,
  REF_RE,
  checkFiles,
  compactPhone,
  intlPhone,
  isValidEmail,
  isValidPhone,
  multiLine,
  normalizeRfq,
  oneLine,
  rfqProblems,
  rfqReference,
  safeFilename,
  sniffOk,
  toLatinDigits,
} from "~/lib/rfq-rules";

const ch = (...codes: number[]) => String.fromCharCode(...codes);
const bytes = (...b: (number | string)[]) => new Uint8Array(b.flatMap((x) => (typeof x === "string" ? [...x].map((c) => c.charCodeAt(0)) : [x])));

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
    ["01001234567", "201001234567"],
    ["01101234567", "201101234567"],
    ["01201234567", "201201234567"],
    ["01501234567", "201501234567"],
    ["01301234567", "01301234567"], // not an Egyptian mobile prefix
    ["0201234567", "0201234567"], // landline-like: left alone
    ["+201001234567", "201001234567"],
    ["00201001234567", "201001234567"],
    ["201001234567", "201001234567"],
    ["+90 532 123 45 67", "905321234567"],
    ["abc", null],
  ])("intlPhone(%j) → %j", (v, out) => expect(intlPhone(v)).toBe(out));
});

describe("email", () => {
  it.each([
    ["ahmed@example.com", true],
    ["a.b+c@sub.example.co", true],
    ["a@b", false],
    ["a b@example.com", false],
    ["@example.com", false],
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
    expect(rfqProblems(normalizeRfq(get({ name: "Ahmed", phone: "01001234567", reply: "email" })), "yes")).toEqual(["reply"]);
    expect(normalizeRfq(get({ reply: "telegram" })).reply).toBe("");
    expect(normalizeRfq(get({ reply: "phone" })).reply).toBe("phone");
  });

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
    [[f("", 0)], null], // an empty file input
  ] as const)("checkFiles(%j) → %s", (files, out) => expect(checkFiles(files)).toBe(out));

  it.each([
    ["pdf", bytes("%PDF-1.7"), true],
    ["pdf", bytes("MZ", 0x90, 0), false],
    ["png", bytes(0x89, "PNG", 13, 10), true],
    ["jpg", bytes(0xff, 0xd8, 0xff, 0xe0), true],
    ["jpeg", bytes(0xff, 0xd8, 0xff, 0xe1), true],
    ["webp", bytes("RIFF", 0, 0, 0, 0, "WEBP"), true],
    ["webp", bytes("RIFF", 0, 0, 0, 0, "WAVE"), false],
    ["zip", bytes("PK", 3, 4), true],
    ["dwg", bytes("AC1032"), true],
    ["dwg", bytes("ACAD"), false],
    ["dxf", bytes("  0\r\nSECTION\r\n"), true],
    ["dxf", bytes(0, 1, 2), false],
    ["exe", bytes("MZ"), false],
  ] as const)("sniffOk(%s, …) → %s", (ext, head, ok) => expect(sniffOk(ext, head)).toBe(ok));

  it("safeFilename drops the path and control characters, keeps the extension's case, caps the length", () => {
    expect(safeFilename("C:\\fakepath\\I-O list.PDF")).toBe("I-O list.PDF");
    expect(safeFilename(`../../a${ch(13, 10)}b.pdf`)).toBe("a b.pdf");
    expect(safeFilename(`${"x".repeat(200)}.dwg`)).toBe(`${"x".repeat(90)}.dwg`);
    expect(safeFilename('a"<b>|c?.png')).toBe("a__b__c_.png");
    expect(safeFilename(".pdf")).toBe("file.pdf");
  });
});
