/**
 * The quote form's draft (src/scripts/rfq-form.ts): what the visitor typed or chose, kept in sessionStorage
 * (RFQ_SESSION.draft) so that switching the page language in the same tab does not lose it. Pure functions over the
 * controls' plain properties: no DOM access and no side effects at import, so they run in Vitest
 * (tests/unit/rfq-draft.test.ts). HTMLInputElement, HTMLSelectElement and HTMLTextAreaElement fit DraftControl.
 *
 * Rules (CODE2-19):
 *   saved     only the fields the visitor changed (or that were restored from their draft). An untouched default —
 *             the preselected reply channel (WhatsApp on ar, email on zh) — and ?service= / ?industry= … preselections
 *             are not the visitor's choice and are not saved. Radios: the group's checked value; other fields: a
 *             non-blank value. Files, checkboxes (consent) and hidden fields never.
 *   restored  a radio value or select option this page does not offer (WhatsApp on zh) is skipped, so the group keeps
 *             its own default and is never left with nothing checked; it is carried on in the draft for the next
 *             page, unless the visitor makes another choice here. Text only fills an empty field.
 */

export type Draft = Record<string, string>;

/** What the draft needs from a form control. */
export interface DraftControl {
  name: string;
  /** "text", "email", "tel", "radio", "textarea", "select-one", … */
  type: string;
  value: string;
  checked?: boolean;
  options?: ArrayLike<{ value: string }>;
}

export interface Restored {
  /** Fields that now hold the visitor's own value: they count as touched (saved from now on). */
  touched: string[];
  /** Draft values this page cannot show (a reply channel it does not offer, a field it does not have): kept in the
   *  draft for the next page. */
  carried: Draft;
}

const NEVER = new Set(["file", "checkbox", "hidden", "submit", "button", "reset", "image"]);
const draftable = (el: DraftControl) => el.name !== "" && !NEVER.has(el.type);
const isRadio = (el: DraftControl) => el.type === "radio";
const isSelect = (el: DraftControl) => el.type.startsWith("select");

/** The stored draft, or {} when there is none or it is not a flat object of strings. */
export function parseDraft(raw: string | null | undefined): Draft {
  try {
    const o: unknown = JSON.parse(raw ?? "{}");
    if (!o || typeof o !== "object" || Array.isArray(o)) return {};
    return Object.fromEntries(Object.entries(o).filter((e): e is [string, string] => typeof e[1] === "string"));
  } catch {
    return {};
  }
}

/** Puts the draft's values into the controls (see the rules above). Mutates the controls' value / checked. */
export function restoreDraft(draft: Readonly<Draft>, controls: readonly DraftControl[]): Restored {
  const touched = new Set<string>();
  const groups = new Map<string, DraftControl[]>();
  for (const el of controls.filter(draftable)) {
    if (isRadio(el)) {
      groups.set(el.name, [...(groups.get(el.name) ?? []), el]);
      continue;
    }
    const v = draft[el.name];
    if (v === undefined) continue;
    if (isSelect(el)) {
      if (!Array.from(el.options ?? []).some((o) => o.value === v)) continue;
      el.value = v;
    } else if (!el.value) el.value = v; // a value already there (the browser's own restore) is the visitor's too
    touched.add(el.name);
  }
  for (const [name, group] of groups) {
    const v = draft[name];
    if (v === undefined || !group.some((r) => r.value === v)) continue;
    for (const r of group) r.checked = r.value === v;
    touched.add(name);
  }
  // whatever this page could not show (a channel it does not offer, a field it does not have) goes on to the next one
  const carried = Object.fromEntries(Object.entries(draft).filter(([k]) => !touched.has(k)));
  return { touched: [...touched], carried };
}

/** The draft to store: the touched fields' values, over what was carried from the previous page. */
export function draftOf(controls: readonly DraftControl[], touched: ReadonlySet<string>, carried: Readonly<Draft> = {}): Draft {
  const out: Draft = {};
  for (const [k, v] of Object.entries(carried)) if (!touched.has(k)) out[k] = v; // a choice made here replaces it
  for (const el of controls.filter(draftable)) {
    if (!touched.has(el.name)) continue;
    if (isRadio(el)) {
      if (el.checked) out[el.name] = el.value;
    } else if (el.value.trim()) out[el.name] = el.value;
  }
  return out;
}
