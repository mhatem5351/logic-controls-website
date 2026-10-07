/**
 * src/lib/format.ts — the site's one placeholder engine (fmt) and the two-digit index (pad2).
 */
import { describe, expect, it } from "vitest";
import { fmt, pad2 } from "~/lib/format";

describe("fmt", () => {
  it("replaces every occurrence of every placeholder", () => {
    expect(fmt("{n} / {total}", { n: 1, total: 4 })).toBe("1 / 4");
    expect(fmt("{a}-{a}-{a}", { a: "x" })).toBe("x-x-x");
    expect(fmt("{subject}: {topic}", { subject: "Inquiry", topic: "Control panels" })).toBe("Inquiry: Control panels");
  });

  it("falsy values are values (0 and the empty string are written, not treated as missing)", () => {
    expect(fmt("{n} items", { n: 0 })).toBe("0 items");
    expect(fmt("[{s}]", { s: "" })).toBe("[]");
  });

  it('missing keys: "keep" (default) leaves the token visible, "empty" removes it', () => {
    expect(fmt("Hello {name}, {missing}!", { name: "Ali" })).toBe("Hello Ali, {missing}!");
    expect(fmt("Hello {name}, {missing}!", { name: "Ali" }, { missing: "keep" })).toBe("Hello Ali, {missing}!");
    expect(fmt("Hello {name}, {missing}!", { name: "Ali" }, { missing: "empty" })).toBe("Hello Ali, !");
    expect(fmt("{a}{b}", { a: undefined }, { missing: "empty" })).toBe("");
  });

  it("unused values are ignored; text without placeholders is unchanged", () => {
    expect(fmt("No tokens here.", { unused: "x" })).toBe("No tokens here.");
    expect(fmt("{service}", { service: "PLC", serviceEn: "PLC" })).toBe("PLC");
  });

  it("only {word} tokens are placeholders (hyphens, spaces, empty braces and JSON stay literal)", () => {
    const vars = { a: "1", "a-b": "2", "a b": "3" };
    expect(fmt("{a-b} {a b} {} {{a}}", vars)).toBe("{a-b} {a b} {} {1}");
    expect(fmt('{"k": 1}', { k: "x" })).toBe('{"k": 1}');
  });

  it("values are inserted literally (no $-pattern expansion, no recursive replacement)", () => {
    expect(fmt("{price}", { price: "$& $1 $$" })).toBe("$& $1 $$");
    expect(fmt("{a} {b}", { a: "{b}", b: "B" })).toBe("{b} B");
  });

  it("works for every script the site uses", () => {
    expect(fmt("مرحبًا {name}", { name: "Logic Controls" })).toBe("مرحبًا Logic Controls");
    expect(fmt("{subject}：{topic}", { subject: "自动化项目咨询", topic: "控制柜" })).toBe("自动化项目咨询：控制柜");
  });
});

describe("pad2", () => {
  it("pads single digits to two, leaves longer numbers alone", () => {
    expect(pad2(0)).toBe("00");
    expect(pad2(3)).toBe("03");
    expect(pad2(9)).toBe("09");
    expect(pad2(10)).toBe("10");
    expect(pad2(42)).toBe("42");
    expect(pad2(123)).toBe("123");
  });
});
