/**
 * src/lib/text.ts — the line-breaking / bidi / escaping engine (audit round 1, package PK5).
 * Golden cases per locale for html(), plain(), toHtml(), heading(), cleanText() and the helpers around them.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cleanText, emphasize, heading, html, isSafeHtml, linkLabels, ltr, markup, plain, punct, rich, toHtml, trHyphenate, zhWords } from "~/lib/text";
import { getMessages } from "~/i18n";

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

describe("Turkish soft hyphens (I18N-03, A11Y-08, I18N2-04, I18N2-05)", () => {
  it("follows the Turkish syllable rule, never leaving < 3 letters on either side of a break", () => {
    expect(trHyphenate("otomatikleştiriyorsunuz")).toBe(["oto", "ma", "tik", "leş", "ti", "ri", "yor", "su", "nuz"].join(SHY));
    expect(trHyphenate("spesifikasyonlarının")).toBe(["spe", "si", "fi", "kas", "yon", "la", "rı", "nın"].join(SHY));
    // no 2-letter stub at a line end (I18N2-05): "ta-", "iş-", "ge-", "mü-", "do-", "mo-"
    expect(trHyphenate("tarayıcınızdan")).toBe(["tara", "yı", "cı", "nız", "dan"].join(SHY));
    for (const w of ["tarayıcınızdan", "işletebileceği", "genişletebileceği", "mühendisleriyle", "dokümantasyonu", "modernizasyonu", "çalışıyorsunuz"]) {
      const parts = trHyphenate(w).split(SHY);
      expect(parts.length, w).toBeGreaterThan(1);
      expect(parts[0]!.length, w).toBeGreaterThanOrEqual(3);
      expect(parts.at(-1)!.length, w).toBeGreaterThanOrEqual(3);
    }
  });
  it("only long, lower-case words; heading() adds them for tr only; html() (body text) and plain() never", () => {
    expect(trHyphenate("modernizasyon")).toContain(SHY);
    expect(trHyphenate("prosesini")).toBe("prosesini");
    expect(trHyphenate("WhatsAppMessenger")).toBe("WhatsAppMessenger");
    expect(heading("tr", "Bir ilaç prosesini mi otomatikleştiriyorsunuz?")).toContain(`oto${SHY}ma`);
    expect(heading("en", "internationalization")).not.toContain(SHY);
    // body text never carries soft hyphens (I18N2-04: WebKit breaks at U+00AD even under hyphens: none)
    expect(html("tr", "Bir ilaç prosesini mi otomatikleştiriyorsunuz?")).not.toContain(SHY);
    expect(toHtml("tr", "parametrelerde değişiklikleri kullanabilirsiniz")).not.toContain(SHY);
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
    expect(heading("tr", "{link:services/machine-retrofits|modernizasyonumuzda}")).toContain(SHY);
    expect(html("tr", "{link:services/machine-retrofits|modernizasyonumuzda}")).not.toContain(SHY);
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
    expect(rich("en", "Hi {name}, see {link:about|us} <now>", { name: markup`<b>x</b>` })).toBe('Hi <b>x</b>, see <a href="/en/about/">us</a> &lt;now&gt;');
  });
});

/* ------------------------------------------------------------------ audit round 2 (package Q6) */

describe("Arabic: digit groups and phone numbers are LTR isolates (I18N2-02)", () => {
  it("isolates a local phone example so it never reads '5678 1234 010'", () => {
    expect(html("ar", "مثال: 010 1234 5678")).toBe('مثال: <bdi dir="ltr">010 1234 5678</bdi>');
    expect(html("ar", "مثال: 010 1234 5678 أو +20 10 1234 5678.")).toBe(
      'مثال: <bdi dir="ltr">010 1234 5678</bdi> أو <bdi dir="ltr">+20 10 1234 5678</bdi>.',
    );
  });
  it("the author's LRI…PDI isolates are replaced by the engine's (same result)", () => {
    const authored = "مثال: \u2066010 1234 5678\u2069 أو \u2066+20 10 1234 5678\u2069.";
    expect(html("ar", authored)).toBe(html("ar", "مثال: 010 1234 5678 أو +20 10 1234 5678."));
    expect(plain("ar", "مثال: 010 1234 5678")).toBe(`مثال: \u2066010${NBSP}1234${NBSP}5678\u2069`);
  });
  it("any run of space-separated digit groups is isolated; a single number stays in the Arabic flow", () => {
    expect(html("ar", "الرقم 0128 4455 667 هنا")).toContain('<bdi dir="ltr">0128 4455 667</bdi>');
    expect(html("ar", "أكثر من 50 مشروعًا في 2026")).toBe("أكثر من 50 مشروعًا في 2026");
  });
  it("the real contact-form help text renders the number in order", () => {
    const help = getMessages("ar").contact.form.fields.phone.help;
    const out = html("ar", help);
    for (const n of help.replace(/[\u2066-\u2069]/g, "").match(/\+?\d+(?:[ \u00A0]\d+)+/g) ?? []) expect(out).toContain(`<bdi dir="ltr">${n}</bdi>`);
  });
});

describe("Arabic: word-only names keep the .lc-nws hook (A11Y2-23)", () => {
  it("'Logic Controls' in an Arabic heading is a bdi.lc-nws (CSS lets a narrow heading wrap it at its space)", () => {
    expect(html("ar", "عن Logic Controls")).toBe('عن <bdi dir="ltr" lang="en" class="lc-nws">Logic Controls</bdi>');
    expect(html("ar", "منصة Schneider Electric")).toContain('<bdi dir="ltr" lang="en" class="lc-nws">Schneider Electric</bdi>');
  });
  it("codes, brand + model and single words never get it", () => {
    expect(html("ar", "معيار IEC 60204-1")).toContain('<bdi dir="ltr">IEC 60204-1</bdi>');
    expect(html("ar", "شاشة Wecon HMI")).toContain('<bdi dir="ltr" lang="en">Wecon HMI</bdi>');
    expect(html("ar", "من Siemens")).toContain('<bdi dir="ltr" lang="en">Siemens</bdi>');
    expect(html("ar", "و S7-200 SMART")).toContain('<bdi dir="ltr">S7-200 SMART</bdi>');
  });
});

describe("Chinese: '——' never starts a line (I18N2-06)", () => {
  it("keeps the dash run on one line with the character before it", () => {
    const out = html("zh", "SCADA 与设备自动化——由我们在埃及的工程师完成");
    expect(out).toContain('<span class="lc-nw">化——</span>');
    expect(out).not.toMatch(new RegExp(`[${ZWSP}]<span class="lc-nw">——|${ZWSP}——`));
  });
  it("after an atom (markup before the dash) a WORD JOINER prohibits the break", () => {
    expect(html("zh", "西门子 S7-1200——由我们编程")).toContain(`</span>\u2060——`);
  });
  it("the real footer pitch: no break opportunity right before '——'", () => {
    const zh = JSON.stringify(getMessages("zh"));
    const pitches = [...zh.matchAll(/"([^"]*——[^"]*)"/g)].map((m) => m[1]!);
    expect(pitches.length).toBeGreaterThan(0);
    for (const s of pitches) {
      const out = html("zh", s);
      for (const m of out.matchAll(/——/g)) {
        const before = out.slice(0, m.index);
        expect(before.endsWith(ZWSP), s).toBe(false);
        expect(/<span class="lc-nw">[^<>]$/.test(before) || before.endsWith("\u2060") || before.endsWith("——"), s).toBe(true);
      }
    }
  });
  it("visible text and emphasize() are unaffected", () => {
    expect(cleanText(html("zh", "西门子 S7-1200——由我们编程"))).toBe("西门子 S7-1200——由我们编程");
    expect(emphasize(html("zh", "设备自动化——由我们"), "自动化——由")).toContain("<em>");
  });
});

describe("set:html contract is enforced at run time (CODE2-03)", () => {
  const HOSTILE_LOOKALIKES = [
    "<b>bold</b>",
    "<2 bar>",
    "R&amp;D",
    "&lt;script&gt;",
    '<span class="lc-nw" onclick="alert(1)">S7</span>',
    '<bdi dir="ltr">x</bdi><img src=x onerror=alert(1)>',
    "<a href=\"javascript:alert(1)\">x</a>",
  ];
  it("toHtml() / heading() escape every string the engine did not produce, however HTML-like", () => {
    for (const s of HOSTILE_LOOKALIKES)
      for (const l of ["en", "ar", "zh", "tr"] as const) {
        for (const out of [toHtml(l, s), heading(l, s)]) {
          expect(out.replace(/<\/?(?:span|bdi)[^>]*>|<wbr>/g, ""), `${l}: ${s}`).not.toMatch(/[<>]/);
          expect(cleanText(out), `${l}: ${s}`).toBe(cleanText(esc2(s)));
        }
      }
    expect(toHtml("en", "<b>bold</b>")).toBe("&lt;b&gt;bold&lt;/b&gt;");
    expect(toHtml("en", "R&amp;D")).toBe("R&amp;amp;D");
  });
  it("engine output passes through unchanged (never double-escaped)", () => {
    for (const r of [html("en", "a < b"), html("ar", "نظام Siemens S7-1200"), html("zh", "设备自动化"), ltr("+20 10 1234 5678"), emphasize(html("en", "x y"), "y"), markup`<b>${"1"}</b>`]) {
      expect(isSafeHtml(r)).toBe(true);
      expect(toHtml("en", r)).toBe(r);
    }
    expect(isSafeHtml("<b>never issued</b>")).toBe(false);
  });
  it("markup`` escapes values and keeps SafeHtml values", () => {
    expect(markup`<a href="${"/x/?a=1&b=<2>"}">${'"quoted" <b>'}</a>`).toBe('<a href="/x/?a=1&amp;b=&lt;2&gt;">&quot;quoted&quot; &lt;b&gt;</a>');
    expect(markup`<b>${html("en", "S7-1200")}</b>${null}${undefined}${false}${[ltr("PLC"), " & "]}`).toBe(
      '<b><span class="lc-nw">S7-1200</span></b><bdi dir="ltr">PLC</bdi> &amp; ',
    );
  });
  it("rich() placeholders take SafeHtml; any other string is escaped", () => {
    const vars = { link: "<a href=x>y</a>" } as unknown as Record<string, ReturnType<typeof markup>>;
    expect(rich("en", "see {link}", vars)).toBe("see &lt;a href=x&gt;y&lt;/a&gt;");
    expect(rich("en", "see {link}", { link: markup`<a href="/en/privacy/">privacy</a>` })).toBe('see <a href="/en/privacy/">privacy</a>');
  });
  it("emphasize() treats a non-engine string as plain text", () => {
    expect(emphasize("<img src=x onerror=alert(1)> y" as never, "y")).toBe("&lt;img src=x onerror=alert(1)&gt; <em>y</em>");
  });
  it("heading() adds Turkish soft hyphens to engine output, never inside atoms, idempotently", () => {
    const h = html("tr", "Siemens S7-1200 ile otomatikleştiriyorsunuz");
    const once = heading("tr", h);
    expect(once).toContain(`oto${SHY}ma`);
    expect(once).toContain('<span class="lc-nw">Siemens S7-1200</span>');
    expect(heading("tr", once)).toBe(once);
    expect(heading("en", html("en", "internationalization"))).toBe(html("en", "internationalization"));
    const em = emphasize(html("tr", "Bir ilaç prosesini mi otomatikleştiriyorsunuz?"), "prosesini");
    expect(heading("tr", em)).toContain("<em>prosesini</em>");
  });
  it("external link tokens work only for allow-listed official hosts", () => {
    expect(html("en", "{link:ext:https://www.gafi.gov.eg/|GAFI}")).toContain('<a href="https://www.gafi.gov.eg/"');
    expect(html("en", "{link:ext:https://example.com/|x}")).not.toContain("<a");
    expect(html("en", "{link:ext:https://gafi.gov.eg.evil.example/|x}")).not.toContain("<a");
  });
  it("no string literal in src/data/*.ts contains markup or an entity (data is plain text too)", () => {
    const dir = new URL("../../src/data/", import.meta.url);
    const bad: string[] = [];
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".ts")))
      for (const m of readFileSync(new URL(f, dir), "utf8").matchAll(/"((?:[^"\\\n]|\\.)*)"/g))
        if (/<\/?[a-z][^>]*>|&(?:[a-z]+|#\d+|#x[0-9a-f]+);/i.test(m[1]!)) bad.push(`${f}: ${m[1]}`);
    expect(bad).toEqual([]);
  });
});

/** What a reader sees of a string escaped once (for comparing hostile inputs). */
function esc2(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

describe("numbers with an inch / prime mark (I18N2-11)", () => {
  it("is one atom: never wraps between the number and the mark", () => {
    expect(html("en", "Simulated 10.1″ operator panel")).toContain(`<span class="lc-nw">10.1″</span>`);
    expect(plain("tr", "simüle 10,1″ operatör")).toContain("10,1″");
  });
  it("is an LTR isolate in Arabic, so the mark is drawn after the number", () => {
    expect(html("ar", "شاشة مقاس 10.1″ مصمّمة")).toContain(`<bdi dir="ltr">10.1″</bdi>`);
    expect(plain("ar", "شاشة مقاس 10.1″ مصمّمة")).toContain("⁦10.1″⁩");
  });
  it("the real HMI caption renders the screen size whole in every locale", () => {
    for (const l of ["en", "ar", "zh", "tr"] as const) {
      const out = html(l, getMessages(l).hmi.caption);
      // "10,1″" (tr) has no break opportunity at all (NU IS NU PO), so it needs no wrapper
      expect(out, l).toMatch(l === "tr" ? /10,1″/ : /(?:<span class="lc-nw">|<bdi dir="ltr">)10\.1″<\/(?:span|bdi)>/);
    }
  });
});

describe("Chinese: fixed place names stay whole (I18N2-08)", () => {
  it("no break opportunity inside 十月六日城 / 新十月城", () => {
    for (const name of ["十月六日城", "新十月城"]) {
      const out = html("zh", `位于${name}及周边工业区`);
      expect(out).toContain(name);
      expect(zhWords(`位于${name}及周边工业区`)).toContain(name);
    }
  });
});

describe("the SafeHtml registry never depends on render order across locales (CODE3-09)", () => {
  // Strings no other test renders, so each case starts from a registry that has never seen them.
  it("html('en', X) then heading('ar', X) gives the Arabic isolate a fresh heading('ar', X) gives", () => {
    const fresh = '<bdi dir="ltr" lang="en">Zelio</bdi>';
    expect(html("en", "Zelio")).toBe("Zelio");
    expect(heading("ar", "Zelio")).toBe(fresh);
    expect(toHtml("ar", "Zelio")).toBe(fresh);
  });
  it("the audit repro: identity outputs of other locales are plain text for the next caller", () => {
    expect(html("en", "Profibox")).toBe("Profibox");
    expect(heading("ar", "Profibox")).toBe('<bdi dir="ltr" lang="en">Profibox</bdi>');
    expect(html("en", "PLC 9001x")).toBe("PLC 9001x");
    expect(toHtml("ar", "PLC 9001x")).toBe(html("ar", "PLC 9001x"));
    expect(toHtml("ar", "PLC 9001x")).toContain("<bdi");
    // markup``, rich() and emphasize() results without markup are plain text too
    expect(heading("ar", markup`${"Sysmac"}`)).toBe('<bdi dir="ltr" lang="en">Sysmac</bdi>');
    expect(heading("ar", rich("en", "Omronix", {}))).toBe('<bdi dir="ltr" lang="en">Omronix</bdi>');
  });
  it("output with markup or an entity still passes through unchanged, in any locale", () => {
    for (const r of [html("en", "Siemens S7-1200"), html("en", "R&D"), html("zh", "设备自动化"), heading("tr", "otomatikleştiriyorsunuz ve S7-1200")]) {
      expect(isSafeHtml(r)).toBe(true);
      for (const l of ["en", "ar", "zh", "tr"] as const) expect(toHtml(l, r)).toBe(r);
    }
  });
  it("re-rendering an identity output in its own locale changes nothing (pass-through and render agree)", () => {
    for (const l of ["en", "ar", "zh", "tr"] as const)
      for (const s of ["PLC", "Profinet", "otomasyon", "تشغيل", "Bir pastörizatörü tarayıcınızdan çalıştırın"]) {
        const once = html(l, s);
        expect(toHtml(l, once), `${l}: ${s}`).toBe(once);
        expect(heading(l, heading(l, s)), `${l}: ${s}`).toBe(heading(l, s));
      }
  });
});

describe("Arabic: a conjunction glued to a word-only name never ends a line alone (I18N3-03)", () => {
  it("'و⍽SIMATIC HMI' is one no-wrap unit (Chromium breaks before an inline-block even after a no-break space)", () => {
    const out = heading("ar", `باستخدام Siemens S7-1200 و${NBSP}SIMATIC HMI`);
    expect(out).toContain(`<span class="lc-nw">و${NBSP}<bdi dir="ltr" class="lc-nws">SIMATIC HMI</bdi></span>`);
    expect(cleanText(out)).toBe("باستخدام Siemens S7-1200 و SIMATIC HMI");
  });
  it("only after a whole conjunction word, and never around a code (codes are not inline-blocks)", () => {
    expect(html("ar", `بنظام${NBSP}Logic Controls`)).not.toContain('<span class="lc-nw">');
    expect(html("ar", `و${NBSP}S7-1200`)).not.toContain('<span class="lc-nw">و');
  });
});

describe("Arabic: a lone 'و' and a heading's 'لا' keep the word after them (VI4-04)", () => {
  it("a lone 'و' written apart (before a code or name) glues forward, in body text too", () => {
    const out = html("ar", "أنظمة PLC و HMI و SCADA وبرمجتها");
    expect(out).toBe(`أنظمة <bdi dir="ltr">PLC</bdi> و${NBSP}<bdi dir="ltr">HMI</bdi> و${NBSP}<bdi dir="ltr">SCADA</bdi> وبرمجتها`);
    expect(plain("ar", "PLC و HMI")).toContain(`و${NBSP}⁦HMI`);
    // never backward, never inside a word ("مهندسو" ends in و), and a written ⍽ stays as it is
    expect(html("ar", "S7-1200 و WinCC")).toContain(`</bdi> و${NBSP}<bdi`);
    expect(html("ar", "مهندسو PLC")).toBe('مهندسو <bdi dir="ltr">PLC</bdi>');
    expect(html("ar", `و${NBSP}SCADA`)).toBe(`و${NBSP}<bdi dir="ltr">SCADA</bdi>`);
    // a word-only name after it still gets the one no-wrap unit of I18N3-03
    expect(heading("ar", "باستخدام S7-1200 و SIMATIC HMI")).toContain(`<span class="lc-nw">و${NBSP}<bdi dir="ltr" class="lc-nws">SIMATIC HMI</bdi></span>`);
  });
  it("display text: 'لا' keeps the word it negates ('مهندسون، لا تجّار معدات'); body text is left as written", () => {
    expect(heading("ar", "مهندسون، لا تجّار معدات")).toBe(`مهندسون، لا${NBSP}تجّار معدات`);
    expect(html("ar", "مهندسون، لا تجّار معدات")).toBe("مهندسون، لا تجّار معدات");
    // only the whole word: "إلا" / "ولا" are other words
    expect(heading("ar", "ليس إلا كلامًا")).toBe("ليس إلا كلامًا");
    expect(cleanText(heading("ar", "مهندسون، لا تجّار معدات"))).toBe("مهندسون، لا تجّار معدات");
  });
  it("the team strip renders both (common.teamStrip)", () => {
    const strip = getMessages("ar").common.teamStrip;
    expect(heading("ar", strip.title)).toContain(`لا${NBSP}`);
    expect(html("ar", strip.text)).not.toMatch(/(^|\s)و (?=\S)/);
  });
});

describe("English display text: soft hyphens where the browsers find no break (VI4-01)", () => {
  it("'Troubleshooting' gets one at 'Trouble|shooting' in headings, whatever the case; body text gets none", () => {
    expect(heading("en", "Troubleshooting, maintenance and support")).toBe(`Trouble${SHY}shooting, maintenance and support`);
    expect(heading("en", "Breakdown troubleshooting")).toBe(`Breakdown trouble${SHY}shooting`);
    expect(heading("en", html("en", "Troubleshooting for Siemens S7-1200 PLCs"))).toContain(`Trouble${SHY}shooting`);
    expect(html("en", "Troubleshooting, maintenance and support")).not.toContain(SHY);
    expect(plain("en", heading("en", "Troubleshooting"))).toBe("Troubleshooting");
    expect(cleanText(heading("en", "Troubleshooting"))).toBe("Troubleshooting");
  });
  it("idempotent, and other locales are untouched", () => {
    const once = heading("en", "Troubleshooting");
    expect(heading("en", once)).toBe(once);
    expect(heading("tr", "Troubleshooting")).not.toContain(`Trouble${SHY}`);
    expect(heading("ar", "Troubleshooting")).not.toContain(SHY);
  });
});

describe("Chinese: no unbreakable run wider than a phone heading line (I18N3-03)", () => {
  const HAN_RUN = /[\u3400-\u9FFF\uF900-\uFAFF]{7,}/;
  it("'四头洗发水灌装机：' breaks between its words; '：' stays on the line of the word before it", () => {
    const s = "四头洗发水灌装机：全新控制柜、Delta PLC 与阿拉伯语 HMI";
    expect(zhWords(s).slice(0, 3)).toEqual(["四头", "洗发水", "灌装机："]);
    const out = html("zh", s);
    expect(out).toContain(`四头${ZWSP}洗发水${ZWSP}灌装机：${ZWSP}`);
    expect(out).not.toContain(`${ZWSP}：`);
  });
  it("an unknown compound longer than 6 Han characters is halved, never before closing punctuation", () => {
    const out = html("zh", "泵启停均带定时延时。");
    expect(out).toBe(`<span class="break-keep">泵启停均带${ZWSP}定时延时。</span>`);
    expect(cleanText(out)).toBe("泵启停均带定时延时。");
  });
  it("every zh message renders with no Han run of more than 6 characters between break opportunities", () => {
    const bad: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === "string") {
        // visible text only (a link's hidden "opens in a new tab" hint is not laid out)
        const text = html("zh", v).replace(/<span class="sr-only">[^<]*<\/span>/g, " ").replace(/<[^>]+>/g, "");
        for (const piece of text.split(/[\s\u200B]/)) if (HAN_RUN.test(piece)) bad.push(piece);
      } else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(getMessages("zh"));
    expect(bad).toEqual([]);
  });
});
