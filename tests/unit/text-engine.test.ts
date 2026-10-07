/**
 * src/lib/text.ts — the line-breaking / bidi / escaping engine (audit round 1, package PK5).
 * Golden cases per locale for html(), plain(), toHtml(), cleanText() and the catalog.ts compatibility shim.
 */
import { describe, expect, it } from "vitest";
import { cleanText, emphasize, html, linkLabels, ltr, plain, punct, rich, toHtml, trHyphenate, zhWords } from "~/lib/text";
import { getMessages } from "~/i18n";
import { html as catalogHtml, keepCodes } from "~/components/sections/catalog/catalog";

const NBSP = "\u00A0";
const SHY = "\u00AD";
const ZWSP = "\u200B";

describe("Arabic: a conjunction / preposition glues forward only (I18N-02, DEV-02, A11Y-09)", () => {
  it("turns NBSP-و-NBSP between two atoms into space-و-NBSP", () => {
    const out = html("ar", `IEC 60204-1${NBSP}و${NBSP}IEC 61439`);
    expect(out).not.toContain(`${NBSP}و`);
    expect(out).toContain(`</bdi> و${NBSP}<bdi`);
  });
  it("also for و attached to the next word and for مع after a code", () => {
    expect(html("ar", `S7-1200${NBSP}ونظام SCADA`)).toContain("</bdi> ونظام");
    expect(plain("ar", `M100${NBSP}ومصدر`)).not.toContain(`${NBSP}و`);
    expect(html("ar", `S7-1200${NBSP}مع${NBSP}HMI`)).toContain("</bdi> مع");
  });
  it("keeps intended glue: number + noun, Arabic names, و + next term", () => {
    expect(html("ar", `4${NBSP}وحدات`)).toContain(`4${NBSP}وحدات`);
    expect(html("ar", `السادس${NBSP}من${NBSP}أكتوبر`)).toBe(`السادس${NBSP}من${NBSP}أكتوبر`);
    expect(html("ar", `و${NBSP}Schneider Electric`)).toContain(`و${NBSP}<bdi`);
  });
});

describe("Arabic: Latin runs (A11Y-38, I18N-21, I18N-14)", () => {
  it("tags runs with ordinary words lang=en, not pure codes / acronyms", () => {
    const out = html("ar", "نظام Siemens S7-1200 مع PLC و(Recipe)");
    expect(out).toContain(`<bdi dir="ltr" lang="en">Siemens S7-1200</bdi>`);
    expect(out).toContain(`<bdi dir="ltr">PLC</bdi>`);
    expect(out).toContain(`<bdi dir="ltr" lang="en">(Recipe)</bdi>`);
  });
  it("keeps a brand with its model as one atom; a long run keeps its inner atoms", () => {
    expect(html("ar", "شاشة Wecon HMI للتشغيل")).toContain(`<bdi dir="ltr" lang="en">Wecon HMI</bdi>`);
    const long = html("ar", "نظام Siemens WinCC Professional SCADA للمراقبة");
    expect(long).toContain(`class="lc-wrap"`);
    expect(long).toContain(`<span class="lc-nw lc-nws">WinCC Professional</span>`);
  });
  it("isolates phone numbers and e-mail addresses as one piece", () => {
    expect(html("ar", "اتصل على +20 110 319 7233 الآن")).toContain(`<bdi dir="ltr">+20 110 319 7233</bdi>`);
    expect(html("ar", "راسلنا info@logic-controls.com")).toContain(`<span class="lc-nw">info@</span><wbr><span class="lc-nw">logic-controls.com</span>`);
  });
});

describe("Turkish soft hyphens (I18N-03, A11Y-08)", () => {
  it("follows the Turkish syllable rule, never leaving < 2 letters before / < 3 after", () => {
    expect(trHyphenate("otomatikleştiriyorsunuz")).toBe(["oto", "ma", "tik", "leş", "ti", "ri", "yor", "su", "nuz"].join(SHY));
    expect(trHyphenate("spesifikasyonlarının")).toBe(["spe", "si", "fi", "kas", "yon", "la", "rı", "nın"].join(SHY));
  });
  it("only long, lower-case words; html() adds them for tr only; plain() never", () => {
    expect(trHyphenate("modernizasyon")).toContain(SHY);
    expect(trHyphenate("prosesini")).toBe("prosesini");
    expect(trHyphenate("WhatsAppMessenger")).toBe("WhatsAppMessenger");
    expect(html("tr", "Bir ilaç prosesini mi otomatikleştiriyorsunuz?")).toContain(`oto${SHY}ma`);
    expect(html("en", "internationalization")).not.toContain(SHY);
    expect(plain("tr", html("tr", "otomatikleştiriyorsunuz"))).toBe("otomatikleştiriyorsunuz");
  });
  it("is idempotent through toHtml()", () => {
    const once = html("tr", "otomatikleştiriyorsunuz");
    expect(toHtml("tr", once)).toBe(once);
    expect(html("tr", once)).toBe(once);
  });
});

describe("Chinese (A11Y-34, PERF-19, I18N-05, I18N-15)", () => {
  it("marks word breaks with U+200B instead of <wbr>", () => {
    const out = html("zh", "我们为工厂提供设备自动化服务");
    expect(out).not.toContain("<wbr>");
    expect(out).toContain(ZWSP);
    expect(out.startsWith(`<span class="break-keep">`)).toBe(true);
  });
  it("keeps a closing-punctuation cluster (and the character before it) on one line", () => {
    expect(html("zh", "勾选即表示同意）；此外我们")).toContain(`<span class="lc-nw">意）；</span>`);
    const after = html("zh", "例如 WinCC Professional）、Schneider Electric");
    expect(after).toMatch(/<\/span><span class="lc-nw">）、<\/span>/);
    // …and a line may break after the cluster, before the next Latin name (else WebKit overflows)
    expect(after).toContain(`）、</span>${ZWSP}<span class="lc-nw lc-nws">Schneider Electric`);
  });
  it("keeps a full-width opening mark with the Latin word after it (WebKit would end a line with （)", () => {
    expect(html("zh", "经济区（SCZONE）一站式")).toContain(`<span class="lc-nw">（SCZONE</span>）`);
    expect(html("zh", "标准（IEC 60204-1）")).toContain(`<span class="lc-nw">（IEC 60204-1</span>）`);
    expect(html("zh", "依据《个人信息保护法》")).toContain(`<span class="lc-nw">《个</span>`);
  });
  it("text after a link with only full-width punctuation still gets the Chinese rules", () => {
    const out = html("zh", "请咨询{link:ext:https://www.gafi.gov.eg/|管理总局}（GAFI）、{link:ext:https://sczone.eg/|一站式服务中心}或顾问。");
    expect(out).toContain(`<span class="lc-nw">（GAFI</span><span class="lc-nw">）、</span>`);
  });
  it("never breaks before —— (it stays with the word before it)", () => {
    const out = html("zh", "设备自动化——由我们设计");
    expect(out).not.toContain(`${ZWSP}—`);
    expect(zhWords("设备自动化——由我们设计").some((w) => w.endsWith("——"))).toBe(true);
  });
  it("still keeps a number with its measure word", () => {
    expect(html("zh", "完成 50 多个项目")).toContain(`50&nbsp;多个`);
  });
  it("emphasize() matches across U+200B", () => {
    expect(emphasize(html("zh", "我们提供设备自动化服务"), "设备自动化")).toContain("<em>");
  });
});

describe("atoms in every locale (I18N-08, I18N-14)", () => {
  it("e-mail addresses break only right after @ (also inside ltr())", () => {
    const mail = `<span class="lc-nw">info@</span><wbr><span class="lc-nw">logic-controls.com</span>`;
    expect(html("en", "Write to info@logic-controls.com today")).toContain(mail);
    expect(ltr("info@logic-controls.com")).toBe(`<bdi dir="ltr">${mail}</bdi>`);
    expect(plain("en", "info@logic-controls.com")).toBe("info@logic-\u2060controls.com");
  });
  it("phone numbers never split", () => {
    expect(html("en", "e.g. +20 10 1234 5678")).toContain(`<span class="lc-nw">+20 10 1234 5678</span>`);
    expect(html("zh", "例如 +20 10 1234 5678")).toContain(`<span class="lc-nw">+20 10 1234 5678</span>`);
    expect(plain("tr", "+20 110 319 7233")).toBe(`+20${NBSP}110${NBSP}319${NBSP}7233`);
  });
  it("brand + model is one atom when ≤ 20 characters", () => {
    expect(html("en", "Siemens S7-1200 PLC and Wecon HMI")).toBe(`<span class="lc-nw">Siemens S7-1200 PLC</span> and <span class="lc-nw">Wecon HMI</span>`);
    expect(html("en", "Siemens WinCC Professional")).toBe(`Siemens <span class="lc-nw lc-nws">WinCC Professional</span>`);
    expect(html("en", "Wecon PLC/HMI")).toBe(`Wecon <span class="lc-nw">PLC/HMI</span>`);
  });
  it("names made only of words are .lc-nws (may break at the space in narrow headings); codes are not", () => {
    expect(html("en", "Logic Controls")).toBe(`<span class="lc-nw lc-nws">Logic Controls</span>`);
    expect(html("en", "24 VDC")).toBe(`<span class="lc-nw">24 VDC</span>`);
    expect(html("en", "IEC 60204-1")).toBe(`<span class="lc-nw">IEC 60204-1</span>`);
  });
  it("ISA / IEC standards stay whole", () => {
    expect(html("en", "as ISA-18.2 requires")).toContain(`<span class="lc-nw">ISA-18.2</span>`);
  });
});

describe("separators (I18N-15)", () => {
  it("a dash or a middle dot sticks to the word before it", () => {
    expect(html("en", "Fast — reliable")).toBe(`Fast${NBSP}— reliable`);
    expect(html("en", "PLC · HMI")).toBe(`PLC${NBSP}· HMI`);
  });
});

describe("set:html contract (CODE-02) and machine text (CODE-09)", () => {
  it("toHtml() escapes plain text and passes rendered HTML through", () => {
    expect(toHtml("en", "a < b & c")).toBe("a &lt; b &amp; c");
    const rendered = html("ar", "نظام Siemens S7-1200");
    expect(toHtml("ar", rendered)).toBe(rendered);
    expect(toHtml("zh", html("zh", "设备自动化服务"))).toBe(html("zh", "设备自动化服务"));
    expect(toHtml("en", undefined)).toBe("");
  });
  it("cleanText() removes tags, entities and every display control", () => {
    const ar = plain("ar", "نظام Siemens S7-1200 و WinCC");
    expect(cleanText(ar)).toBe("نظام Siemens S7-1200 و WinCC");
    expect(cleanText(html("zh", "基于 Siemens S7-1200 和 WinCC 的混凝土搅拌站"))).toBe("基于 Siemens S7-1200 和 WinCC 的混凝土搅拌站");
    expect(cleanText(html("tr", "Ar-Ge & otomatikleştiriyorsunuz"))).toBe("Ar-Ge & otomatikleştiriyorsunuz");
  });
  it("plain() is idempotent", () => {
    for (const [l, s] of [
      ["ar", "لوحة Siemens S7-1200 و WinCC Professional"],
      ["zh", "完成 50 多个项目，使用 S7-1200"],
      ["tr", "Siemens S7-1200 PLC ve info@logic-controls.com"],
      ["en", "IEC 60204-1 and 24 VDC"],
    ] as const)
      expect(plain(l, plain(l, s))).toBe(plain(l, s));
  });
});

describe("catalog.ts shims (CODE-05)", () => {
  it("html() accepts both argument orders", () => {
    expect(catalogHtml("Siemens S7-1200", "en")).toBe(html("en", "Siemens S7-1200"));
    expect(catalogHtml("zh", "设备自动化")).toBe(html("zh", "设备自动化"));
    expect(catalogHtml("نظام PLC", "ar")).toBe(html("ar", "نظام PLC"));
  });
  it("keepCodes() is plain() with swapped arguments", () => {
    expect(keepCodes("S7-1200", "en")).toBe(plain("en", "S7-1200"));
  });
});

describe("punct()", () => {
  it("full-width forms in Chinese, Arabic comma in Arabic", () => {
    expect(punct("zh").colon).toBe("：");
    expect(punct("ar").comma).toBe("، ");
    expect(punct("en").colon).toBe(": ");
  });
});

describe("link tokens {link:path|label} / {link:ext:https://…|label}", () => {
  const EXT = 'target="_blank" rel="noopener noreferrer"';
  it("internal: locale prefix + trailing slash, label through the locale rules", () => {
    expect(html("en", "See our {link:services/machine-retrofits|machine retrofit service}.")).toBe(
      'See our <a href="/en/services/machine-retrofits/">machine retrofit service</a>.',
    );
    expect(html("tr", "{link:about|Hakkımızda}")).toBe('<a href="/tr/about/">Hakkımızda</a>');
    expect(html(undefined, "{link:contact|Contact}")).toBe('<a href="/en/contact/">Contact</a>');
    expect(html("en", "{link:services/control-panels|IEC 60204-1 practice}")).toBe(
      '<a href="/en/services/control-panels/"><span class="lc-nw">IEC 60204-1</span> practice</a>',
    );
  });
  it("Arabic: Latin runs inside the label are isolated; the link sits in the RTL flow", () => {
    expect(html("ar", "نصمم وفق {link:services/control-panels|ممارسات IEC 60204-1}، ونوثّق")).toBe(
      'نصمم وفق <a href="/ar/services/control-panels/">ممارسات <bdi dir="ltr">IEC 60204-1</bdi></a>، ونوثّق',
    );
  });
  it("Chinese: one keep-all wrapper; a word break at the link edges, never before closing punctuation", () => {
    const out = html("zh", "详见我们的{link:services/machine-retrofits|旧设备改造服务}。");
    expect(out.startsWith('<span class="break-keep">')).toBe(true);
    expect(out.match(/break-keep/g)).toHaveLength(1);
    expect(out).toContain(`的${ZWSP}<a href="/zh/services/machine-retrofits/">`);
    expect(out).toContain("</a>。");
    expect(out).not.toContain(`${ZWSP}。`);
    expect(html("zh", "（如我们的{link:projects/pasteurizer-cip-recipes|巴氏杀菌机项目}），也可以")).toContain('</a><span class="lc-nw">），</span>');
  });
  it("Turkish: soft hyphens in long label words", () => {
    expect(html("tr", "{link:services/machine-retrofits|modernizasyonumuzda}")).toContain(SHY);
  });
  it("external: https only, new tab, rel noopener noreferrer, hidden localized hint", () => {
    for (const l of ["en", "ar", "zh", "tr"] as const) {
      const out = html(l, "{link:ext:https://www.gafi.gov.eg/|GAFI}");
      const hint = getMessages(l).ui.a11y.newTab;
      expect(out).toContain(`<a href="https://www.gafi.gov.eg/" ${EXT}>`);
      expect(out).toContain(`<span class="sr-only">${punct(l).open}${hint}${punct(l).close}</span></a>`);
    }
  });
  it("anything else is not a link: it stays visible, escaped", () => {
    for (const bad of [
      "{link:javascript:alert(1)|x}",
      "{link:ext:javascript:alert(1)|x}",
      "{link:ext:http://example.com/|x}",
      '{link:ext:https://evil.example/"onmouseover="alert(1)|x}',
      "{link:Services/Upper|x}",
      "{link:/services/|x}",
      "{link:services//x|x}",
      "{link:services|}",
      "{link:services}",
    ]) {
      const out = html("en", bad);
      expect(out, bad).not.toContain("<a");
      expect(out.replace(/<span class="lc-nw">|<\/span>/g, ""), bad).not.toMatch(/[<>"']/);
    }
  });
  it("hostile labels are escaped inside the link", () => {
    expect(html("en", "{link:about|<img src=x onerror=alert(1)>}")).toBe('<a href="/en/about/">&lt;img src=x onerror=alert(1)&gt;</a>');
  });
  it("plain() / cleanText() / linkLabels() keep only the label", () => {
    const s = "Contact {link:ext:https://www.gafi.gov.eg/|GAFI} or our {link:services/maintenance-support|support team}.";
    expect(linkLabels(s)).toBe("Contact GAFI or our support team.");
    expect(plain("en", s)).toBe("Contact GAFI or our support team.");
    expect(cleanText(s)).toBe("Contact GAFI or our support team.");
    expect(plain("zh", "详见我们的{link:services/machine-retrofits|旧设备改造服务}。")).toBe("详见我们的旧设备改造服务。");
    expect(linkLabels("{link:javascript:x|y}")).toBe("{link:javascript:x|y}");
  });
  it("toHtml() renders tokens in plain text and passes rendered HTML through; rich() renders them around placeholders", () => {
    const out = toHtml("en", "see {link:about|us}");
    expect(out).toBe('see <a href="/en/about/">us</a>');
    expect(toHtml("en", out)).toBe(out);
    expect(rich("en", "Hi {name}, see {link:about|us} <now>", { name: "<b>x</b>" })).toBe('Hi <b>x</b>, see <a href="/en/about/">us</a> &lt;now&gt;');
  });
});
