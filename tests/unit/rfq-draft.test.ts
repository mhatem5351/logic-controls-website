/**
 * The quote form's draft across a language switch (src/scripts/rfq-draft.ts, CODE2-19) and the context parameters
 * the language switcher carries over (src/lib/context-params.ts, CODE2-21).
 *
 * Controls are plain objects with the properties the functions read (the browser passes the real form controls).
 * The forms differ by locale exactly as RfqForm.astro renders them: the reply chips are WhatsApp / phone call / email
 * (WhatsApp preselected on ar, nothing on en and tr) and phone call / email on zh (email preselected).
 */
import { describe, expect, it } from "vitest";
import { draftOf, parseDraft, restoreDraft, type Draft, type DraftControl } from "~/scripts/rfq-draft";
import { CONTEXT_PARAMS, FORM_PRESELECT, contextQuery, isContextParam } from "~/lib/context-params";

type Locale = "en" | "ar" | "zh" | "tr";
const SERVICES = ["", "control-panels", "plc-hmi-programming", "maintenance-support"];

/** A fresh form of that locale, as rendered (before the script runs). */
function form(locale: Locale): DraftControl[] {
  const channels = locale === "zh" ? ["phone", "email"] : ["whatsapp", "phone", "email"];
  const preset = locale === "ar" ? "whatsapp" : locale === "zh" ? "email" : undefined;
  return [
    { name: "name", type: "text", value: "" },
    { name: "company", type: "text", value: "" },
    { name: "phone", type: "tel", value: "" },
    { name: "email", type: "email", value: "" },
    { name: "service", type: "select-one", value: "", options: SERVICES.map((value) => ({ value })) },
    ...channels.map((value) => ({ name: "reply", type: "radio", value, checked: value === preset })),
    { name: "message", type: "textarea", value: "" },
    { name: "files", type: "file", value: "" },
    { name: "consent", type: "checkbox", value: "yes", checked: false },
    { name: "locale", type: "hidden", value: locale },
  ];
}
const get = (controls: DraftControl[], name: string) => controls.find((c) => c.name === name && c.type !== "radio")!;
const reply = (controls: DraftControl[]) => controls.filter((c) => c.type === "radio" && c.checked).map((c) => c.value);
/** The visitor clicks a reply chip (a change event: the group counts as touched). */
function choose(controls: DraftControl[], value: string, touched: Set<string>) {
  for (const c of controls) if (c.type === "radio") c.checked = c.value === value;
  touched.add("reply");
}

/** One page load: restore the stored draft, let the visitor act, return what would be stored. */
function visit(locale: Locale, stored: Draft, act: (controls: DraftControl[], touched: Set<string>) => void = () => {}) {
  const controls = form(locale);
  const restored = restoreDraft(stored, controls);
  const touched = new Set(restored.touched);
  act(controls, touched);
  return { controls, draft: draftOf(controls, touched, restored.carried) };
}

describe("draft: saved values", () => {
  it("only what the visitor touched: an untouched preselected chip (ar WhatsApp, zh email) is not saved", () => {
    const ar = visit("ar", {}, (c, t) => {
      get(c, "name").value = "Ahmed";
      t.add("name");
    });
    expect(reply(ar.controls)).toEqual(["whatsapp"]);
    expect(ar.draft).toEqual({ name: "Ahmed" });
    const zh = visit("zh", {}, (c, t) => {
      get(c, "company").value = "Nile Foods";
      t.add("company");
    });
    expect(zh.draft).toEqual({ company: "Nile Foods" });
  });

  it("a chip the visitor chose is saved, even the preselected one chosen again after another", () => {
    expect(visit("ar", {}, (c, t) => choose(c, "phone", t)).draft).toEqual({ reply: "phone" });
    expect(visit("ar", {}, (c, t) => (choose(c, "email", t), choose(c, "whatsapp", t))).draft).toEqual({ reply: "whatsapp" });
  });

  it("blank text is not saved; files, consent and hidden fields never are", () => {
    const { draft } = visit("en", {}, (c, t) => {
      get(c, "name").value = "   ";
      get(c, "files").value = "C:\\fakepath\\a.pdf";
      get(c, "consent").checked = true;
      for (const n of ["name", "files", "consent", "locale"]) t.add(n);
    });
    expect(draft).toEqual({});
  });

  it("a touched field the visitor emptied is dropped", () => {
    const { draft } = visit("en", { name: "Ahmed", company: "Nile Foods" }, (c) => (get(c, "name").value = ""));
    expect(draft).toEqual({ company: "Nile Foods" });
  });
});

describe("draft: restored values", () => {
  it("text, select and chip come back; text never overwrites a value already there", () => {
    const controls = form("en");
    get(controls, "company").value = "Typed already";
    const restored = restoreDraft({ name: "Ahmed", company: "Nile Foods", service: "control-panels", reply: "email" }, controls);
    expect(get(controls, "name").value).toBe("Ahmed");
    expect(get(controls, "company").value).toBe("Typed already");
    expect(get(controls, "service").value).toBe("control-panels");
    expect(reply(controls)).toEqual(["email"]);
    expect(restored.touched.sort()).toEqual(["company", "name", "reply", "service"]);
    expect(restored.carried).toEqual({});
  });

  it("a long description comes back whole (the form then refreshes its counter)", () => {
    const controls = form("en");
    restoreDraft({ message: "x".repeat(1900) }, controls);
    expect(get(controls, "message").value).toHaveLength(1900);
  });

  it("a chip this page does not offer is skipped: the group keeps its default, never nothing checked", () => {
    const controls = form("zh");
    const restored = restoreDraft({ name: "Li Wei", reply: "whatsapp" }, controls);
    expect(reply(controls)).toEqual(["email"]);
    expect(restored.touched).toEqual(["name"]);
    expect(restored.carried).toEqual({ reply: "whatsapp" });
  });

  it("an unknown select option is skipped (the placeholder stays), and so are fields this page does not have", () => {
    const controls = form("en");
    const restored = restoreDraft({ service: "<script>", fax: "123" }, controls);
    expect(get(controls, "service").value).toBe("");
    expect(restored.touched).toEqual([]);
    expect(restored.carried).toEqual({ service: "<script>", fax: "123" });
  });

  it("a stored draft that is not a flat object of strings is ignored", () => {
    expect(parseDraft(null)).toEqual({});
    expect(parseDraft("not json")).toEqual({});
    expect(parseDraft("[1,2]")).toEqual({});
    expect(parseDraft("null")).toEqual({});
    expect(parseDraft('{"name":"Ahmed","n":1,"o":{}}')).toEqual({ name: "Ahmed" });
  });
});

describe("draft: carried across language switches (CODE2-19)", () => {
  it("ar → en → zh without touching the chips: each page keeps its own default", () => {
    const ar = visit("ar", {}, (c, t) => ((get(c, "name").value = "QA Draft"), t.add("name")));
    expect(ar.draft).toEqual({ name: "QA Draft" });
    const en = visit("en", ar.draft);
    expect(get(en.controls, "name").value).toBe("QA Draft");
    expect(reply(en.controls)).toEqual([]); // no WhatsApp carried over from ar
    const zh = visit("zh", en.draft);
    expect(reply(zh.controls)).toEqual(["email"]); // the zh default is not wiped
    expect(zh.draft).toEqual({ name: "QA Draft" });
  });

  it("a chosen channel follows the visitor; one zh does not offer waits on zh and comes back on en", () => {
    const ar = visit("ar", {}, (c, t) => choose(c, "phone", t));
    const zh = visit("zh", ar.draft);
    expect(reply(zh.controls)).toEqual(["phone"]);

    const ar2 = visit("ar", {}, (c, t) => (choose(c, "email", t), choose(c, "whatsapp", t)));
    const zh2 = visit("zh", ar2.draft);
    expect(reply(zh2.controls)).toEqual(["email"]); // zh's own default, WhatsApp is not offered
    expect(zh2.draft).toEqual({ reply: "whatsapp" }); // …but the visitor's choice is not lost
    const en2 = visit("en", zh2.draft);
    expect(reply(en2.controls)).toEqual(["whatsapp"]);
  });

  it("a choice made on zh replaces the carried one", () => {
    const zh = visit("zh", { reply: "whatsapp" }, (c, t) => choose(c, "phone", t));
    expect(zh.draft).toEqual({ reply: "phone" });
  });
});

describe("context parameters (kept across a language switch, CODE2-21)", () => {
  it("one list for the switcher and the readers", () => {
    for (const p of [...FORM_PRESELECT, "project", "intent", "platform", "ref", "skipped"]) expect(CONTEXT_PARAMS, p).toContain(p);
    expect(CONTEXT_PARAMS).not.toContain("filter"); // nothing reads it
    expect(new Set(CONTEXT_PARAMS).size).toBe(CONTEXT_PARAMS.length);
  });

  it.each([
    ["utm_source", true],
    ["utm_campaign", true],
    ["timeline", true],
    ["ref", true],
    ["error", false], // an error alert does not follow the visitor to the other language
    ["filter", false],
    ["utm_", false],
    ["UTM_SOURCE", false],
    ["name", false], // never personal data
  ])("isContextParam(%j) → %s", (k, ok) => expect(isContextParam(k)).toBe(ok));

  it("contextQuery keeps the context, in order, and drops the rest", () => {
    expect(contextQuery("?service=control-panels&name=Ahmed&utm_source=fb&ref=LC-7K3F9&error=send")).toBe(
      "?service=control-panels&utm_source=fb&ref=LC-7K3F9",
    );
    expect(contextQuery("?timeline=urgent&intent=reference&project=milk-pasteurizer")).toBe(
      "?timeline=urgent&intent=reference&project=milk-pasteurizer",
    );
    expect(contextQuery("?a=1")).toBe("");
    expect(contextQuery("")).toBe("");
  });
});
