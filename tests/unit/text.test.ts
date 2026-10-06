/**
 * src/lib/text.ts — escaping, line breaking and bidi rules for every locale.
 *
 * Besides example-based cases, three invariants run over every string in src/i18n/messages (the real corpus):
 *  - html() output contains only the markup html() itself adds (bdi / nowrap span / break-keep span / wbr); any other
 *    "<", ">" or quote is escaped,
 *  - html() and plain() never lose, add or reorder a visible character (tags, entities and the invisible joiners /
 *    isolates they insert aside),
 *  - plain() is idempotent (documented) and Chinese <wbr> never splits a word, a code or a quantity from its measure word.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { colon, emphasize, esc, html, isCode, ltr, num, plain, rich, techLabel, zhWords } from "~/lib/text";
import type { Locale } from "~/i18n";

const LOCALES: Locale[] = ["en", "ar", "zh", "tr"];
const NBSP = "\u00A0";
const WJ = "\u2060";
const LRI = "\u2066";
const PDI = "\u2069";

/* ------------------------------------------------------------------ helpers */

/** The only markup html() may emit. */
const SAFE_TAG = /<bdi dir="ltr"(?: class="lc-wrap")?>|<\/bdi>|<span class="(?:lc-nw|break-keep)">|<\/span>|<wbr>|<em>|<\/em>/g;
const ENTITY = /&(?:amp|lt|gt|quot|#39|nbsp);/g;
const decode = (s: string) =>
  s.replace(ENTITY, (e) => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": NBSP })[e]!);
/** Visible text of an html() result: tags dropped, entities decoded, no-break spaces as spaces. */
const textOf = (h: string) => decode(h.replace(SAFE_TAG, "")).replaceAll(NBSP, " ");
/** Visible text of a plain() result: joiners and isolates dropped, no-break spaces as spaces. */
const plainText = (p: string) => p.replaceAll(WJ, "").replaceAll(LRI, "").replaceAll(PDI, "").replaceAll(NBSP, " ");
/** Comparable text: html()/plain() drop isolates a caller already inserted (and add their own), use NBSP, never U+2011. */
const norm = (s: string) => s.replace(/[\u2066-\u2069]/g, "").replaceAll(NBSP, " ").replaceAll("\u2011", "-");

/** Every string value of every message file of a locale. */
function corpus(locale: Locale): string[] {
  const dir = new URL(`../../src/i18n/messages/${locale}/`, import.meta.url);
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) walk(JSON.parse(readFileSync(new URL(f, dir), "utf8")));
  return out;
}

const HOSTILE = [
  `<script>alert("x")</script>`,
  `"><img src=x onerror=alert(1)>`,
  `' onmouseover='alert(1)`,
  `Tom & Jerry <b>bold</b>`,
  `(<img src=x onerror=alert(1)>)`,
  `S7-1200 <iframe src="javascript:alert(1)"></iframe> IEC 60204-1`,
  `50 <svg/onload=alert(1)> 多个项目`,
  `برمجة <script>alert('x')</script> (Pressure <b>switch</b>)`,
  `&lt;already escaped&gt; &amp; &#39;`,
];

/* ------------------------------------------------------------------ escaping */

describe("esc / ltr", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(esc(`<a href="x">Tom & 'Jerry'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;");
  });
  it("double-escapes existing entities (input is plain text, never HTML)", () => {
    expect(esc("&amp;")).toBe("&amp;amp;");
  });
  it("ltr() isolates and escapes", () => {
    expect(ltr("<+20 110>")).toBe('<bdi dir="ltr">&lt;+20 110&gt;</bdi>');
  });
});

describe("html() escapes hostile input in every locale", () => {
  for (const locale of [...LOCALES, undefined]) {
    for (const input of HOSTILE) {
      it(`${locale ?? "no locale"}: ${input}`, () => {
        const out = html(locale, input);
        const rest = out.replace(SAFE_TAG, "");
        expect(rest, "no raw markup outside html()'s own tags").not.toMatch(/[<>"']/);
        expect(rest.replace(ENTITY, ""), "every & starts an entity").not.toContain("&");
        expect(norm(textOf(out)), "visible text unchanged").toBe(norm(input));
      });
    }
  }

  it("rich() escapes the template text but keeps the provided HTML snippets; unknown placeholders stay visible", () => {
    expect(rich("en", "Read {link} <now>", { link: '<a href="/x/">x</a>' })).toBe('Read <a href="/x/">x</a> &lt;now&gt;');
    expect(rich("en", "{unknown} & more", {})).toBe("{unknown} &amp; more");
  });

  it("emphasize() escapes the phrase it looks for and never breaks nesting", () => {
    expect(emphasize(html("en", "a <b> c"), "<b>")).toBe("a <em>&lt;b&gt;</em> c");
    const out = emphasize(html("en", "Siemens S7-1200 panels"), "S7-1200 panels");
    expect(out).toBe('Siemens <span class="lc-nw"><em>S7-1200</em></span><em> panels</em>');
    expect(emphasize("x", undefined)).toBe("x");
  });
});

/* ------------------------------------------------------------------ atoms (en / tr) */

describe("atoms never wrap inside (Latin locales)", () => {
  const nw = (s: string) => `<span class="lc-nw">${s}</span>`;
  it.each([
    ["S7-1200", nw("S7-1200")],
    ["IEC 60204-1", nw("IEC 60204-1")],
    ["ISA-88", nw("ISA-88")],
    ["4-20 mA", nw("4-20 mA")],
    ["24 VDC", nw("24 VDC")],
    ["72.0 °C", nw("72.0 °C")],
    ["I/O", nw("I/O")],
    ["21 CFR Part 11", nw("21 CFR Part 11")],
    ["Schneider Electric", nw("Schneider Electric")],
    ["WinCC Professional", nw("WinCC Professional")],
    ["Logic Controls", nw("Logic Controls")],
    ["LS XGB", nw("LS XGB")],
  ])("%s", (input, expected) => {
    expect(html("en", input)).toBe(expected);
    expect(html("tr", input)).toBe(expected);
  });

  it("only atoms are glued, never the words around them", () => {
    expect(html("en", "Siemens S7-1200 and IEC 60204-1 panels")).toBe(
      `Siemens ${nw("S7-1200")} and ${nw("IEC 60204-1")} panels`,
    );
  });

  it("an atom without a break opportunity is not wrapped (no useless spans)", () => {
    expect(html("en", "PLC")).toBe("PLC");
  });

  it("atoms longer than 20 characters stay breakable", () => {
    const long = "ABCDEFGHIJKLMNOPQRSTUV-1234567890XYZ";
    expect(html("en", `code ${long}`)).toBe(`code ${long}`);
    expect(plain("en", long)).toBe(long);
  });

  it("plain(): NBSP inside multi-word atoms, WORD JOINER after hyphens / slashes, never U+2011", () => {
    expect(plain("en", "S7-1200 and IEC 60204-1")).toBe(`S7-${WJ}1200 and IEC${NBSP}60204-${WJ}1`);
    expect(plain("en", "I/O list")).toBe(`I/${WJ}O list`);
    expect(plain("en", "Schneider Electric")).toBe(`Schneider${NBSP}Electric`);
    expect(plain("en", "S7\u20111200")).not.toContain("\u2011");
  });

  it("Turkish letters are part of words, not code boundaries", () => {
    expect(html("tr", "Siemens S7-1200 ile İşletme")).toBe(`Siemens ${nw("S7-1200")} ile İşletme`);
  });
});

/* ------------------------------------------------------------------ separators */

describe("separator gluing", () => {
  it('" · " sticks to the item before it (a line never starts with "·")', () => {
    expect(html("en", "Siemens · Delta · Wecon")).toBe(`Siemens${NBSP}· Delta${NBSP}· Wecon`);
    expect(plain("en", "Siemens · Delta")).toBe(`Siemens${NBSP}· Delta`);
    expect(plain("zh", "西门子 · 台达")).toBe(`西门子${NBSP}· 台达`);
  });
  it("a middle dot without spaces around it is left alone", () => {
    expect(html("en", "a·b")).toBe("a·b");
  });
});

/* ------------------------------------------------------------------ Arabic */

describe("Arabic bidi isolates", () => {
  it("isolates a Latin code in <bdi dir=ltr> (one atom: no lc-wrap)", () => {
    expect(html("ar", "برمجة S7-1200 من Siemens")).toBe('برمجة <bdi dir="ltr">S7-1200</bdi> من <bdi dir="ltr">Siemens</bdi>');
  });
  it("keeps multi-word atoms whole", () => {
    expect(html("ar", "معيار IEC 60204-1 للوحات")).toBe('معيار <bdi dir="ltr">IEC 60204-1</bdi> للوحات');
    expect(html("ar", "LS PLC و S7-200 SMART")).toBe('<bdi dir="ltr">LS PLC</bdi> و <bdi dir="ltr">S7-200 SMART</bdi>');
  });
  it("a run of several tokens may wrap between tokens (lc-wrap) but keeps its atoms", () => {
    expect(html("ar", "Siemens S7-1200 PLC مع شاشة")).toBe(
      '<bdi dir="ltr" class="lc-wrap">Siemens <span class="lc-nw">S7-1200</span> PLC</bdi> مع شاشة',
    );
  });
  it("a parenthesised Latin gloss is isolated together with its brackets", () => {
    expect(html("ar", "مفتاح ضغط (Pressure switch) في اللوحة")).toBe(
      'مفتاح ضغط <bdi dir="ltr" class="lc-wrap">(Pressure switch)</bdi> في اللوحة',
    );
    expect(html("ar", "التنظيف (CIP) اليومي")).toBe('التنظيف <bdi dir="ltr">(CIP)</bdi> اليومي');
  });
  it("brackets around numbers stay in the Arabic flow; only digit ranges are isolated", () => {
    expect(html("ar", "اختبار (2025) و (4-20)")).toBe('اختبار (2025) و (<bdi dir="ltr">4-20</bdi>)');
  });
  it("plain digits are not isolated (Western digits read correctly in RTL)", () => {
    expect(html("ar", "أكثر من 50 مشروعا")).toBe("أكثر من 50 مشروعا");
  });
  it("plain() uses LRI…PDI instead of tags", () => {
    expect(plain("ar", "برمجة S7-1200 من Siemens")).toBe(`برمجة ${LRI}S7-${WJ}1200${PDI} من ${LRI}Siemens${PDI}`);
    expect(plain("ar", "مفتاح (Pressure switch)")).toBe(`مفتاح ${LRI}(Pressure switch)${PDI}`);
  });
  it("isolates already present in the input are not doubled", () => {
    const once = plain("ar", "برمجة S7-1200");
    expect(plain("ar", once)).toBe(once);
    expect(html("ar", `مثل ${LRI}S7-1200${PDI}`)).toBe('مثل <bdi dir="ltr">S7-1200</bdi>');
  });
  // Latent, not live: the phone help text in contact.json carries its own LRI…PDI and is rendered as plain text
  // (Field.astro), so the page is correct. But html() strips caller isolates and does not isolate space-separated
  // digit groups, so the same string through html() would show "5678 1234 10 +20" on an RTL line.
  it.fails("KNOWN ISSUE: html('ar') keeps a space-separated phone number in an LTR isolate", () => {
    expect(html("ar", `مثل ${LRI}+20 10 1234 5678${PDI}.`)).toContain("<bdi");
  });
});

/* ------------------------------------------------------------------ Chinese */

describe("Chinese word-aware line breaking", () => {
  it("breaks only between words, inside a keep-all span", () => {
    expect(html("zh", "电气控制柜设计与装配")).toBe('<span class="break-keep">电气<wbr>控制柜<wbr>设计<wbr>与<wbr>装配</span>');
  });
  it("a number stays with the measure word after it", () => {
    expect(html("zh", "我们完成了 50 多个项目")).toBe('<span class="break-keep">我们<wbr>完成<wbr>了 50&nbsp;多个<wbr>项目</span>');
    expect(plain("zh", "50 多个项目，覆盖 7 个行业")).toBe(`50${NBSP}多个项目，覆盖 7${NBSP}个行业`);
    expect(zhWords("我们完成了 50 多个项目")).toContain(`50${NBSP}多个`);
  });
  it("punctuation sticks to its word (closing after, opening before)", () => {
    expect(html("zh", "（压力开关）与温度")).toBe('<span class="break-keep">（压力<wbr>开关）<wbr>与<wbr>温度</span>');
    expect(zhWords("项目，覆盖")).toEqual(["项目，", "覆盖"]);
  });
  it("Latin codes inside Chinese text are single atoms", () => {
    expect(html("zh", "符合 IEC 60204-1 标准的控制柜")).toBe(
      '<span class="break-keep">符合 <span class="lc-nw">IEC 60204-1</span> 标准<wbr>的<wbr>控制柜</span>',
    );
    expect(zhWords("西门子 S7-1200 设备")).toContain("S7-1200");
  });
  it("text without Han characters on a zh page is handled like Latin text", () => {
    expect(html("zh", "S7-1200")).toBe('<span class="lc-nw">S7-1200</span>');
  });
});

/* ------------------------------------------------------------------ corpus invariants */

describe.each(LOCALES)("corpus invariants: %s messages", (locale) => {
  const strings = corpus(locale);

  it("has a corpus to check", () => {
    expect(strings.length).toBeGreaterThan(500);
  });

  it("html(): only its own markup, everything else escaped, no character lost or reordered", () => {
    const bad: string[] = [];
    for (const s of strings) {
      const out = html(locale, s);
      const rest = out.replace(SAFE_TAG, "");
      if (/[<>"']/.test(rest) || rest.replace(ENTITY, "").includes("&") || norm(textOf(out)) !== norm(s)) bad.push(s);
    }
    expect(bad).toEqual([]);
  });

  it("plain(): no character lost or reordered, and idempotent", () => {
    const lost: string[] = [];
    const unstable: string[] = [];
    for (const s of strings) {
      const p = plain(locale, s);
      if (norm(plainText(p)) !== norm(s)) lost.push(s);
      if (plain(locale, p) !== p) unstable.push(s);
    }
    expect(lost).toEqual([]);
    expect(unstable).toEqual([]);
  });

  if (locale === "zh") {
    it("<wbr> never splits Latin/digit runs, never precedes closing or follows opening punctuation, never after a quantity", () => {
      const bad: string[] = [];
      for (const s of strings) {
        const out = html("zh", s);
        const parts = out.split("<wbr>").map(textOf);
        for (let i = 1; i < parts.length; i++) {
          const before = parts[i - 1]!.slice(-1);
          const after = parts[i]![0] ?? "";
          if (/[A-Za-z0-9]/.test(before) && /[A-Za-z0-9\-/]/.test(after)) bad.push(`${s} :: ${before}|${after}`);
          if (/^[、，。：；！？）」』】》%]/.test(after)) bad.push(`${s} :: |${after}`);
          if (/[（「『【《]$/.test(before)) bad.push(`${s} :: ${before}|`);
          if (/\d\+?%?$/.test(parts[i - 1]!) && /[\u3400-\u9FFF]/.test(after)) bad.push(`${s} :: quantity|${after}`);
        }
      }
      expect(bad).toEqual([]);
    });
  }

  if (locale === "ar") {
    it("every Latin letter of an Arabic string is inside a <bdi> isolate", () => {
      const bad: string[] = [];
      for (const s of strings.filter((x) => /[\u0600-\u06FF]/.test(x))) {
        const outside = html("ar", s)
          .replace(/<bdi[^>]*>[\s\S]*?<\/bdi>/g, "")
          .replace(/<[^>]+>/g, "")
          .replace(ENTITY, "");
        if (/[A-Za-z]/.test(outside)) bad.push(s);
      }
      expect(bad).toEqual([]);
    });
  }
});

/* ------------------------------------------------------------------ small helpers */

describe("helpers", () => {
  it("num() always uses Western digits", () => {
    expect(num(2026)).toBe("2026");
  });
  it("colon() is full-width in Chinese only", () => {
    expect(colon("zh")).toBe("：");
    for (const l of ["en", "ar", "tr"] as const) expect(colon(l)).toBe(": ");
  });
  it("isCode() recognises technical codes and brand names, not ordinary words", () => {
    for (const s of ["PLC", "24 VDC", "LS XGB", "Siemens S7-1200 PLC", "Yaskawa VFDs", "Modbus TCP"]) expect(isCode(s), s).toBe(true);
    for (const s of ["Motion control", "Dolum makinesi", "Industrial Ethernet switch"]) expect(isCode(s), s).toBe(false);
  });
  it("techLabel() localises known technology strings and falls back to English", () => {
    expect(techLabel(undefined, "Yaskawa VFDs")).toBe("Yaskawa VFDs");
    expect(techLabel("en", "Not in any dictionary")).toBe("Not in any dictionary");
    expect(techLabel("ar", "Yaskawa VFDs")).toMatch(/Yaskawa/);
    expect(techLabel("ar", "Yaskawa VFDs")).not.toBe("Yaskawa VFDs");
  });
});
