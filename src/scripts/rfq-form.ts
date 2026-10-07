/**
 * Quote form (RfqForm.astro), progressive enhancement. Without this script the form is one long page that posts
 * natively (multipart, attachments included) and the Worker answers 303 → thanks / ?error=…#rfq-error-….
 *
 * With it: two steps, localized inline validation with a linked error summary, "machine stopped?" call-now panel
 * (with a "machine is stopped now" switch that marks the request urgent), Turnstile loaded on the first interaction
 * (explicit render), and a recovery path when the security check or the server fails: the visitor's request is handed
 * over pre-filled to WhatsApp (not on zh) or email, plus "Try again".
 *   Reply channel: choosing Email makes the email address required (and brings the field up into step 1); Phone call
 *   or WhatsApp make the phone number required. Same rule on the Worker (rfqProblems).
 *   Attachments: each pick (or drop) adds to the list, every file can be removed, large photos are reduced in the
 *   browser (≤ 2000 px, JPEG), each file's type and content are checked when it is added (errors are announced), and
 *   the upload shows progress, gives up when it stalls, and can be retried without choosing the files again.
 *   Context: ?service= / ?industry= / ?location= / ?timeline= preselect; ?project=<slug> and ?intent=reference
 *   explain what the visitor came for and start the description for them (src/lib/context-params.ts: the same list
 *   the language switcher carries over).
 * Limits and validation rules come from src/lib/rfq-rules.ts (the Worker uses the same module).
 * The values the visitor typed or chose (not files, not consent, not defaults they never touched) are kept as a draft
 * in sessionStorage, so switching the page language keeps them (rules: src/scripts/rfq-draft.ts); on success the draft
 * is cleared and a short summary ({ref, name, company, need, files, skipped, reply, urgent}) is handed to the thanks
 * page, which deletes it once read. Back from the thanks page (back/forward cache) brings a fresh form, never the
 * "sent" overlay.
 * Hand-over links (WhatsApp / email) are templates rendered by the server with the site's link builders
 * (data-href-tpl); this script only fills in the text (fillHref).
 */
import {
  RFQ_FILES,
  RFQ_MAX,
  RFQ_NAME_MIN,
  REPLY_NEEDS,
  SNIFF_BYTES,
  URGENT_SERVICES,
  URGENT_TIMELINE,
  RFQ_SESSION,
  badTypeNames,
  checkFiles,
  fileExt,
  fillHref,
  intlPhone,
  isValidEmail,
  isValidPhone,
  sniffOk,
  toLatinDigits,
  urgencyOf,
  type FileProblem,
  type ReplyChannel,
} from "~/lib/rfq-rules";
import { motionOff, scrollBehavior } from "~/scripts/motion/motion-pref";
import { FORM_PRESELECT } from "~/lib/context-params";
import { fmt } from "~/lib/format";
import { draftOf, parseDraft, restoreDraft, type Draft } from "./rfq-draft";

type Code = "invalid" | "attachments" | "verification" | "send" | "unknown";
type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export interface RfqI18n {
  locale: string;
  validation: Record<string, string>;
  errors: Record<string, string>;
  /** The same error texts rendered by the text engine (src/lib/text.ts html(): Latin runs and "4 MB" isolated in RTL). */
  errorsHtml: Record<string, string>;
  counter: string;
  sending: string;
  submit: string;
  sendNow: string;
  sent: string;
  waiting: string;
  thanks: string;
  /** Locale punctuation (src/lib/text.ts punct()): "label: value" and lists of file names. */
  colon: string;
  listSep: string;
  files: {
    remove: string;
    summary: string;
    choose: string;
    addMore: string;
    preparing: string;
    reduced: string;
    badType: string;
    badContent: string;
    uploading: string;
  };
  prefill: { intro: string; subject: string; files: string };
  context: { project: string; projectMessage: string; reference: string; referenceMessage: string };
  /** Case-study slug → title (for ?project=). */
  projects: Record<string, string>;
}

/** What the thanks page reads (contact/thanks/index.astro; RFQ_SESSION.sent), then deletes. */
export interface RfqSent {
  ref: string;
  name: string;
  company: string;
  need: string;
  files: string[];
  skipped: string[];
  reply: string;
  urgent: "urgent" | "likely" | "";
}
/** Kept for the tab session (RFQ_SESSION.last): the thanks page's fallback when ?ref= is missing. No personal data. */
export type RfqLast = Pick<RfqSent, "ref" | "urgent">;

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove?: (id?: string) => void;
  getResponse: (id?: string) => string | undefined;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
    lcTsLoaded?: () => void;
  }
}

const TS_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=lcTsLoaded";
/** No load / error event from api.js after this long (some content blockers): the security check counts as failed. */
const TS_GIVE_UP_MS = 12_000;
/** Photos heavier than this are reduced in the browser: long side ≤ IMAGE_MAX_SIDE, JPEG at IMAGE_QUALITY. */
const IMAGE_REDUCE_OVER = 600 * 1024;
const IMAGE_MAX_SIDE = 2000;
const IMAGE_QUALITY = 0.82;
/** Upload watchdog: no progress for STALL_MS (or no answer AFTER_UPLOAD_MS after the last byte), or TOTAL_MS overall. */
const STALL_MS = 30_000;
const AFTER_UPLOAD_MS = 45_000;
const TOTAL_MS = 150_000;

const store = {
  get: (k: string) => {
    try {
      return sessionStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v === null) sessionStorage.removeItem(k);
      else sessionStorage.setItem(k, v);
    } catch {}
  },
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** "614 KB", "1.9 MB", "4 MB", as an LTR isolate (Arabic text would otherwise show "MB 4"). */
const LRI = String.fromCharCode(0x2066);
const PDI = String.fromCharCode(0x2069);
const NBSP = String.fromCharCode(0xa0); // "4 MB" never splits across lines
const mb = (n: number) =>
  LRI + (n === 0 ? `0${NBSP}KB` : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))}${NBSP}KB` : `${(n / 1024 / 1024).toFixed(1).replace(/\.0$/, "")}${NBSP}MB`) + PDI;
/** A label used before a colon: "What do you need?" → "What do you need". */
const bare = (label: string) => label.trim().replace(/[?？؟:：]\s*$/, "");
/** One announcement per change: clear, then set on the next frame (screen readers skip text set in the same task). */
const announce = (region: HTMLElement, msg: string) => {
  region.textContent = "";
  if (msg) requestAnimationFrame(() => (region.textContent = msg));
};

/* ---------- attachments: photo reduction and signature check (no DOM state) ---------- */

/** A lighter copy of a large JPEG / PNG / WebP photo (long side ≤ 2000 px), or null when it would not help. */
async function reduceImage(file: File): Promise<File | null> {
  const ext = fileExt(file.name);
  if (!["jpg", "jpeg", "png", "webp"].includes(ext) || file.size <= IMAGE_REDUCE_OVER || typeof createImageBitmap !== "function") return null;
  let bmp: ImageBitmap | undefined;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const encode = (type: string, quality?: number) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, quality));
    const asJpeg = async () => {
      ctx.fillStyle = "#fff"; // JPEG has no transparency: transparent areas become white, not black
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(bmp!, 0, 0, w, h);
      return encode("image/jpeg", IMAGE_QUALITY);
    };
    let out: Blob | null = null;
    let name = file.name;
    if (ext === "png") {
      // drawings and screenshots stay sharp as PNG; a photo saved as PNG becomes a JPEG (renamed) when that is far lighter
      ctx.drawImage(bmp, 0, 0, w, h);
      const png = scale < 1 ? await encode("image/png") : null;
      const best = png && png.size < file.size ? png : null;
      if ((best?.size ?? file.size) > 1024 * 1024) {
        const jpeg = await asJpeg();
        if (jpeg && jpeg.size < (best?.size ?? file.size) / 2) {
          out = jpeg;
          name = file.name.replace(/\.png$/i, ".jpg");
        }
      }
      out ??= best;
    } else {
      out = await asJpeg();
      if (ext === "webp") name = file.name.replace(/\.webp$/i, ".jpg");
    }
    if (!out || out.size >= file.size || !/^image\/(jpeg|png)$/.test(out.type)) return null;
    return new File([out], name, { type: out.type, lastModified: file.lastModified });
  } catch {
    return null; // undecodable or out of memory: send the original
  } finally {
    bmp?.close();
  }
}

/** Does the file's content match its extension? (the same check the Worker runs; null when it cannot be read) */
async function contentOk(file: File): Promise<boolean | null> {
  try {
    return sniffOk(fileExt(file.name), new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer()));
  } catch {
    return null;
  }
}

export function enhance(form: HTMLFormElement) {
  const i18n = JSON.parse(form.dataset.i18n ?? "{}") as RfqI18n;
  const $ = <T extends Element = HTMLElement>(sel: string) => form.querySelector<T>(sel);
  const $$ = <T extends Element = HTMLElement>(sel: string) => [...form.querySelectorAll<T>(sel)];

  const panels = $$<HTMLFieldSetElement>("fieldset[data-step]");
  const tabs = $$("[data-step-tab]");
  const actions1 = $("[data-actions='1']")!;
  const actions2 = $("[data-actions='2']")!;
  const back = $<HTMLButtonElement>("[data-back]")!;
  const live = $("[data-step-live]")!;
  const alertBox = $("[data-alert]")!;
  const alertList = $<HTMLUListElement>("[data-alert-list]")!;
  const message = $<HTMLTextAreaElement>("[data-message]")!;
  const count = $("[data-count]")!;
  const success = $("[data-success]")!;
  const body = $("[data-rfq-body]")!;
  const tsSlot = $<HTMLElement>("[data-turnstile]")!;
  const tsStatus = $("[data-ts-status]")!;
  const fileInput = $<HTMLInputElement>("[data-files]");
  const fileZone = $("[data-file-zone]");
  const fileList = $<HTMLUListElement>("[data-files-list]");
  const fileSummary = $("[data-files-summary]");
  const filesLive = $("[data-files-live]");
  const chooseLabel = $("[data-files-choose]");
  const progress = $("[data-progress]");
  const urgent = $("[data-urgent]");
  const stopped = $<HTMLInputElement>("[data-stopped]");
  const phone = $<HTMLInputElement>("[data-phone]")!;
  const email = $<HTMLInputElement>("[data-email]");
  const phoneHint = $("[data-phone-hint]");
  let step = 1;
  let submitted = false;
  let sending = false;
  let sentOk = false;
  let lastSubmitter: HTMLElement | null = null;

  /* ---------- progressive enhancement ---------- */
  form.noValidate = true;
  form.setAttribute("data-enhanced", "");
  $("[data-stepper]")!.hidden = false;
  message.removeAttribute("maxlength"); // the counter + validation message replace the hard stop (paste stays visible)

  const controls = (scope: ParentNode) =>
    [...scope.querySelectorAll<Control>("input:not([type=hidden]):not([name=lc_hp]), select, textarea")].filter(
      (el) => !el.closest("[data-turnstile]") && el.name !== "",
    );
  const select = (name: string) => $<HTMLSelectElement>(`select[name='${name}']`);
  const replyChoice = () => ($<HTMLInputElement>("input[name='reply']:checked")?.value ?? "") as ReplyChannel | "";

  // Context: the page that sent the visitor here, and ?service= / ?industry= / ?location= / ?timeline= preselection.
  const params = new URLSearchParams(location.search);
  const pageField = $<HTMLInputElement>("[data-page-field]")!;
  try {
    const ref = document.referrer ? new URL(document.referrer) : null;
    pageField.value = ref && ref.origin === location.origin && ref.pathname !== location.pathname ? ref.pathname : location.pathname + location.search;
  } catch {
    /* keep the server-rendered value */
  }

  /* ---------- draft: survives a language switch (same tab); only what the visitor typed or chose ---------- */
  // Rules and the pure save / restore functions: src/scripts/rfq-draft.ts (CODE2-19).
  const draftable = () => controls(form);
  /** Fields the visitor changed (or restored from their draft): defaults they never touched are not carried over. */
  const touched = new Set<string>();
  /** Draft values this page cannot show (WhatsApp on zh): passed on to the next page unless the visitor chooses here. */
  let carried: Draft = {};
  {
    const restored = restoreDraft(parseDraft(store.get(RFQ_SESSION.draft)), draftable());
    restored.touched.forEach((name) => touched.add(name));
    carried = restored.carried;
  }
  let draftTimer = 0;
  const saveDraft = (e: Event) => {
    const target = e.target as Control | null;
    // An input / change event: the visitor (or something acting for them: autofill, a password manager, an assistive
    // tool) changed the field. Defaults, ?service= preselections and the draft itself are set without events.
    if (target?.name) touched.add(target.name);
    clearTimeout(draftTimer);
    if (sentOk) return;
    draftTimer = window.setTimeout(() => {
      if (sentOk) return; // UX2-21: a debounced save must never resurrect the draft after a successful send
      const draft = draftOf(draftable(), touched, carried);
      store.set(RFQ_SESSION.draft, Object.keys(draft).length ? JSON.stringify(draft) : null);
    }, 300);
  };
  form.addEventListener("input", saveDraft);
  form.addEventListener("change", saveDraft);

  // ?service= / ?industry= / ?location= / ?timeline= from the page that linked here win over the draft; the link (and a
  // language switch, which keeps the query) carries them, so they are not saved as the visitor's choice
  for (const name of FORM_PRESELECT) {
    const sel = select(name);
    const value = params.get(name);
    if (sel && value && [...sel.options].some((o) => o.value === value)) {
      sel.value = value;
      touched.delete(name);
      delete carried[name];
    }
  }
  // ?project=<slug> (case study CTAs) / ?intent=reference: say what this is about and start the description
  {
    const title = i18n.projects[params.get("project") ?? ""];
    const reference = params.get("intent") === "reference";
    const note = $("[data-context]");
    const text = title ? fmt(i18n.context.project, { title }) : reference ? i18n.context.reference : "";
    const start = title ? fmt(i18n.context.projectMessage, { title }) : reference ? i18n.context.referenceMessage : "";
    if (note && text) {
      note.querySelector("[data-context-text]")!.textContent = text;
      note.hidden = false;
    }
    if (start && !message.value.trim()) message.value = `${start}\n`;
  }

  /* ---------- labels (for the error summary and the hand-over message) ---------- */
  const labelOf = (el: Control) => {
    if (el instanceof HTMLInputElement && el.type === "radio") return el.closest("fieldset")?.querySelector("legend > span")?.textContent?.trim() ?? el.name;
    const label = form.querySelector<HTMLElement>(`label[for='${el.id}'] > span:first-child`);
    return (label?.textContent ?? el.name).trim();
  };
  const valueOf = (el: Control) => {
    if (el instanceof HTMLSelectElement) return el.value ? (el.selectedOptions[0]?.textContent?.trim() ?? "") : "";
    // UX2-19: a chip's visible text ("WhatsApp"), not its value ("whatsapp") or the field name
    if (el instanceof HTMLInputElement && el.type === "radio") return el.checked ? (el.closest("label")?.textContent?.trim() ?? el.value) : "";
    return el.value.trim();
  };
  const pair = (label: string, value: string) => `${bare(label)}${i18n.colon}${value}`;

  /* ---------- preferred reply channel → which contact detail is required (UX2-07) ---------- */
  const emailField = email?.closest<HTMLElement>(".lc-field") ?? null;
  const emailHome = emailField ? { parent: emailField.parentElement!, next: emailField.nextElementSibling } : null;
  const replyField = $("[data-field='rfq-reply']");
  const baseRequired = (el: HTMLInputElement | null) => el?.dataset.baseRequired === "true";
  const needs = () => {
    const ch = replyChoice();
    return ch ? REPLY_NEEDS[ch] : null;
  };
  function setRequired(el: HTMLInputElement, on: boolean) {
    el.required = on;
    el.setAttribute("aria-required", String(on));
    const field = el.closest(".lc-field");
    field?.querySelector<HTMLElement>("[data-req-mark]")?.toggleAttribute("hidden", !on);
    field?.querySelector<HTMLElement>("[data-opt-mark]")?.toggleAttribute("hidden", on);
  }
  function syncReply() {
    const need = needs();
    setRequired(phone, baseRequired(phone) || need === "phone");
    if (email && emailField && emailHome && replyField) {
      setRequired(email, baseRequired(email) || need === "email");
      // non-zh forms keep the email at the end of step 2: bring it up under the chips while it is required
      if (!baseRequired(email)) {
        if (need === "email" && !replyField.nextElementSibling?.isSameNode(emailField)) replyField.after(emailField);
        else if (need !== "email" && emailField.parentElement !== emailHome.parent) emailHome.parent.insertBefore(emailField, emailHome.next);
      }
    }
  }
  form.addEventListener("change", (e) => {
    if (!(e.target instanceof HTMLInputElement && e.target.name === "reply")) return;
    syncReply();
    for (const el of [phone, email]) if (el && (submitted || el.getAttribute("aria-invalid") === "true")) show(el, check(el));
  });
  syncReply();

  /* ---------- validation ---------- */
  type Item = { file: File; key: string; original?: number; preparing?: boolean; issue?: "type" | "content" };
  let items: Item[] = [];
  const fileMessage = (problem: FileProblem) =>
    problem === "type"
      ? fmt(i18n.validation.filesType!, { files: items.filter((i) => i.issue === "type").map((i) => i.file.name).join(i18n.listSep) })
      : problem === "count"
        ? fmt(i18n.validation.filesCount!, { max: RFQ_FILES.maxCount })
        : fmt(i18n.validation.filesSize!, { max: mb(RFQ_FILES.maxTotal) });

  function check(el: Control): string {
    if (el instanceof HTMLInputElement && el.type === "checkbox") return el.checked || !el.required ? "" : i18n.validation.consent!;
    if (el instanceof HTMLInputElement && el.type === "radio") return "";
    if (el instanceof HTMLInputElement && el.type === "file") {
      // a type problem: by extension (here) or as the Worker answered for a file (issue "type")
      const problem = items.some((i) => i.issue === "type") ? "type" : checkFiles(items.map((i) => i.file));
      return problem ? fileMessage(problem) : "";
    }
    const v = el.value.trim();
    if (el.name === "phone") {
      if (!v) return el.required ? (needs() === "phone" && !baseRequired(phone) ? i18n.validation.phoneForReply! : i18n.validation.required!) : "";
      return isValidPhone(v) ? "" : i18n.validation.phone!;
    }
    if (el.name === "email") {
      if (!v) return el.required ? (needs() === "email" && !baseRequired(email) ? i18n.validation.emailForReply! : i18n.validation.required!) : "";
      return isValidEmail(v) ? "" : i18n.validation.email!;
    }
    if (el.name === "message") return v.length > RFQ_MAX.message ? fmt(i18n.validation.messageTooLong!, { max: RFQ_MAX.message }) : "";
    if (!el.required) return "";
    if (el instanceof HTMLSelectElement) return v ? "" : i18n.validation.select!;
    if (el.name === "name") return v.length >= RFQ_NAME_MIN ? "" : i18n.validation.name!;
    return v ? "" : i18n.validation.required!;
  }

  function show(el: Control, msg: string) {
    const err = form.querySelector<HTMLElement>(`#${el.id}-error`);
    el.setAttribute("aria-invalid", msg ? "true" : "false");
    if (err) {
      err.textContent = msg;
      err.hidden = !msg;
    }
  }

  function validate(scope: ParentNode) {
    const bad: { el: Control; msg: string }[] = [];
    for (const el of controls(scope)) {
      const msg = check(el);
      show(el, msg);
      if (msg) bad.push({ el, msg });
    }
    return bad;
  }

  // Live re-validation once a field has been visited (or after a submit attempt).
  // A11Y2-19: never on blur for checkboxes / radios (their value is always set, so "visited" meant "invalid"), and not
  // while the pointer is on its way to Continue / Send / Back: an error line inserted there would move the button
  // between mousedown and mouseup and swallow the click (those buttons validate anyway).
  let toAction = false;
  const ACTIONS = "[data-next],[data-submit],[data-back]";
  form.addEventListener("pointerdown", (e) => (toAction = !!(e.target as Element).closest(ACTIONS)), true);
  // the phone's country-code hint also changes the layout: when it was skipped for that reason, update it after the click
  let hintLater = false;
  for (const type of ["pointerup", "pointercancel"])
    document.addEventListener(
      type,
      () =>
        setTimeout(() => {
          toAction = false;
          if (hintLater) {
            hintLater = false;
            phoneCountryHint();
          }
        }),
      true,
    );
  for (const el of controls(form)) {
    el.addEventListener("blur", (e) => {
      if (el.name === "phone" && el.value) el.value = toLatinDigits(el.value);
      if (el.type === "file" || el.type === "checkbox" || el.type === "radio") return;
      if (toAction) {
        if (el.name === "phone") hintLater = true;
        return;
      }
      if (el.name === "phone") phoneCountryHint();
      if (((e as FocusEvent).relatedTarget as Element | null)?.closest?.(ACTIONS)) return; // the action validates anyway
      if (submitted || el.value.trim()) show(el, check(el));
    });
    const live = el instanceof HTMLSelectElement || el.type === "checkbox" || el.type === "radio" || el.type === "file" ? "change" : "input";
    el.addEventListener(live, () => {
      if (el.getAttribute("aria-invalid") === "true") show(el, check(el));
    });
  }

  /* ---------- phone: no usable country code → a gentle hint (never blocking; UX2-02) ---------- */
  function phoneCountryHint() {
    if (!phoneHint) return;
    const v = phone.value.trim();
    const ctx = { locale: i18n.locale, country: $<HTMLInputElement>("[name='country']")?.value, location: select("location")?.value };
    phoneHint.hidden = !(v && isValidPhone(v) && !intlPhone(v, ctx));
  }
  $<HTMLInputElement>("[name='country']")?.addEventListener("change", phoneCountryHint);
  select("location")?.addEventListener("change", phoneCountryHint);
  if (phone.value) phoneCountryHint();

  // Character counter for the description (shown near the limit; announced once at 90 % and once over the limit).
  // Also run once at start, silently: a description restored from the draft (or started by ?project=) may be long.
  let near = false;
  let over = false;
  function syncCount(speak: boolean) {
    const n = message.value.length;
    count.hidden = n < RFQ_MAX.message * 0.8;
    count.textContent = `${n} / ${RFQ_MAX.message}`;
    count.toggleAttribute("data-over", n > RFQ_MAX.message);
    const isNear = n >= RFQ_MAX.message * 0.9;
    const isOver = n > RFQ_MAX.message;
    if (speak && isOver && !over) announce(live, fmt(i18n.validation.messageTooLong!, { max: RFQ_MAX.message }));
    else if (speak && isNear && !near && !isOver) announce(live, fmt(i18n.validation.messageNear!, { count: n, max: RFQ_MAX.message }));
    near = isNear;
    over = isOver;
  }
  message.addEventListener("input", () => syncCount(true));
  syncCount(false);

  // Enter in a step-1 field continues to step 2 (the form's default button would otherwise be "Skip and send now").
  panels[0]!.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && step === 1 && e.target instanceof HTMLInputElement && e.target.type !== "checkbox" && !e.isComposing) {
      e.preventDefault();
      $<HTMLButtonElement>("[data-next]")!.click();
    }
  });

  /* ---------- attachments ---------- */
  /** The same file picked twice (name + size: lastModified differs between pickers for the same file). */
  const keyOf = (f: File) => `${f.name}|${f.size}`;
  const filesReady = () => Promise.all(pending);
  let pending: Promise<void>[] = [];

  function fileNote(it: Item): string {
    if (it.issue === "type") return i18n.files.badType;
    if (it.issue === "content") return fmt(i18n.files.badContent, { ext: fileExt(it.file.name).toUpperCase() });
    if (it.preparing) return i18n.files.preparing;
    if (it.original) return fmt(i18n.files.reduced, { size: mb(it.original) });
    return "";
  }
  function summaryText() {
    if (!items.length) return "";
    const total = items.reduce((n, i) => n + i.file.size, 0);
    return fmt(i18n.files.summary, { count: items.length, max: RFQ_FILES.maxCount, size: mb(total), maxSize: mb(RFQ_FILES.maxTotal) });
  }
  /** What a screen reader hears after a change: the error, else the per-file problems, else the new count. */
  function announceFiles() {
    if (!filesLive || !fileInput) return;
    const err = check(fileInput);
    const notes = items.filter((i) => i.issue).map((i) => pair(i.file.name, fileNote(i)));
    announce(filesLive, [err, ...notes].filter(Boolean).join(" ") || summaryText());
  }
  function renderFiles() {
    if (!fileInput || !fileList || !fileSummary) return;
    fileList.replaceChildren(
      ...items.map((it, i) => {
        const li = document.createElement("li");
        li.className = "lc-file-item";
        if (it.issue) li.dataset.issue = it.issue;
        const main = document.createElement("span");
        main.className = "lc-file-main";
        const name = document.createElement("span");
        name.className = "lc-file-name";
        name.dir = "auto";
        name.textContent = it.file.name;
        // the size goes under the name (not beside it), so at 320px the name keeps nearly the full width
        const size = document.createElement("span");
        size.className = "lc-file-size ltr";
        size.dir = "ltr";
        size.textContent = it.preparing ? "" : mb(it.file.size);
        main.append(name, size);
        const noteText = fileNote(it);
        if (noteText) {
          const note = document.createElement("span");
          note.className = "lc-file-note";
          note.textContent = noteText;
          main.append(note);
        }
        const rm = document.createElement("button");
        rm.type = "button";
        rm.className = "lc-file-remove";
        rm.setAttribute("aria-label", fmt(i18n.files.remove, { name: it.file.name }));
        rm.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
        rm.addEventListener("click", () => {
          items = items.filter((x) => x !== it);
          renderFiles();
          if (fileInput.getAttribute("aria-invalid") === "true" || submitted) show(fileInput, check(fileInput));
          announceFiles();
          (fileList.querySelectorAll<HTMLButtonElement>(".lc-file-remove")[Math.min(i, items.length - 1)] ?? fileInput).focus();
        });
        li.append(main, rm);
        return li;
      }),
    );
    fileSummary.textContent = summaryText();
    fileSummary.hidden = !items.length;
    if (chooseLabel) chooseLabel.textContent = items.length ? i18n.files.addMore : i18n.files.choose;
  }
  /** Adds picked or dropped files to the list (duplicates ignored), then checks and reduces them in the background. */
  function addFiles(list: FileList | File[] | null | undefined) {
    if (!fileInput) return;
    const known = new Set(items.map((i) => i.key));
    const added: Item[] = [];
    for (const file of [...(list ?? [])]) {
      if (!file.size || known.has(keyOf(file))) continue;
      known.add(keyOf(file));
      const it: Item = { file, key: keyOf(file) };
      if (badTypeNames([file]).length) it.issue = "type";
      added.push(it);
    }
    if (!added.length) return;
    items = [...items, ...added];
    for (const it of added) {
      if (it.issue) continue;
      it.preparing = true;
      const job = (async () => {
        const ok = await contentOk(it.file);
        if (ok === false) it.issue = "content";
        const small = ok ? await reduceImage(it.file) : null;
        if (small) {
          it.original = it.file.size;
          it.file = small;
        }
        it.preparing = false;
      })();
      pending.push(job);
      void job.then(() => {
        pending = pending.filter((p) => p !== job);
        if (!items.includes(it)) return;
        renderFiles();
        if (fileInput.getAttribute("aria-invalid") === "true" || submitted) show(fileInput, check(fileInput));
        if (!pending.length) announceFiles();
      });
    }
    renderFiles();
    show(fileInput, check(fileInput));
    if (!pending.length) announceFiles();
  }
  if (fileInput && fileList && fileSummary) {
    fileInput.addEventListener("change", () => {
      addFiles(fileInput.files);
      // the list (not the input) holds the files now: clearing lets the next pick add to it and re-pick a removed file
      fileInput.value = "";
    });
    // Desktop drag and drop on the attachments box; a near miss elsewhere on the page must not open the file in the tab.
    const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes("Files");
    if (fileZone) {
      for (const type of ["dragenter", "dragover"]) {
        fileZone.addEventListener(type, (e) => {
          const d = e as DragEvent;
          if (!hasFiles(d)) return;
          d.preventDefault();
          d.stopPropagation();
          if (d.dataTransfer) d.dataTransfer.dropEffect = "copy";
          fileZone.setAttribute("data-drag", "");
        });
      }
      fileZone.addEventListener("dragleave", (e) => {
        if (!fileZone.contains((e as DragEvent).relatedTarget as Node | null)) fileZone.removeAttribute("data-drag");
      });
      fileZone.addEventListener("drop", (e) => {
        const d = e as DragEvent;
        if (!hasFiles(d)) return;
        d.preventDefault();
        d.stopPropagation();
        fileZone.removeAttribute("data-drag");
        addFiles(d.dataTransfer?.files);
      });
    }
    window.addEventListener("dragover", (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "none";
    });
    window.addEventListener("drop", (e) => hasFiles(e) && e.preventDefault());
    renderFiles();
  }

  /* ---------- "machine stopped?" panel (+ the switch that marks the request urgent; UX2-06) ---------- */
  const timeline = select("timeline");
  if (urgent) {
    const update = () => {
      const on = URGENT_SERVICES.includes(select("service")?.value ?? "") || timeline?.value === URGENT_TIMELINE;
      urgent.hidden = !on;
      if (stopped) stopped.checked = timeline?.value === URGENT_TIMELINE;
    };
    select("service")?.addEventListener("change", update);
    timeline?.addEventListener("change", update);
    stopped?.addEventListener("change", () => {
      if (!timeline) return;
      if (stopped.checked) timeline.value = URGENT_TIMELINE;
      else if (timeline.value === URGENT_TIMELINE) timeline.value = "";
      touched.add("timeline");
      timeline.dispatchEvent(new Event("change", { bubbles: true }));
    });
    update();
  }

  /* ---------- alert panel ---------- */
  const fallback = $("[data-alert-fallback]")!;
  const retry = $<HTMLButtonElement>("[data-retry]")!;

  /** The visitor's request as plain text, to hand over to WhatsApp or email without retyping. */
  function handover(): string {
    const lines = [i18n.prefill.intro, ""];
    for (const el of controls(form)) {
      if (el.type === "checkbox" || el.type === "file") continue;
      const v = valueOf(el);
      if (v) lines.push(pair(labelOf(el), el.name === "message" && v.length > 700 ? `${v.slice(0, 700)}…` : v));
    }
    const files = items.map((i) => i.file.name);
    if (files.length) lines.push(fmt(i18n.prefill.files, { files: files.join(i18n.listSep) }));
    return lines.join("\n");
  }
  /** The WhatsApp / email hand-over links carry the request (templates from the server: data-href-tpl, slot {text}). */
  function fillFallback() {
    const text = handover();
    $$<HTMLAnchorElement>("a[data-href-tpl]").forEach((a) => (a.href = fillHref(a.dataset.hrefTpl!, { text })));
  }

  function alertShow(opts: { title: string; html?: string; list?: { el: Control; msg: string }[]; fallback?: boolean; retry?: boolean }) {
    $("[data-alert-title]")!.textContent = opts.title;
    const text = $("[data-alert-text]")!;
    text.innerHTML = opts.html ?? ""; // engine output from the page's own messages (errorsHtml), never visitor input
    text.hidden = !opts.html;
    alertList.replaceChildren(
      ...(opts.list ?? []).map(({ el, msg }) => {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = `#${el.id}`;
        a.textContent = el.type === "checkbox" ? msg : pair(labelOf(el), msg);
        a.addEventListener("click", (e) => {
          e.preventDefault();
          const inStep = Number(el.closest<HTMLElement>("fieldset[data-step]")?.dataset.step ?? step);
          if (inStep !== step) goTo(inStep, false);
          el.focus();
        });
        li.append(a);
        return li;
      }),
    );
    alertList.hidden = !opts.list?.length;
    if (opts.fallback) fillFallback();
    fallback.hidden = !opts.fallback;
    retry.hidden = !opts.retry;
    alertBox.hidden = false;
  }
  const alertHide = () => (alertBox.hidden = true);
  function focusAlert() {
    alertBox.focus({ preventScroll: true });
    alertBox.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
  }
  /** `detail`: another errors.* key for the text (verificationBlocked, timeout). */
  function serverError(code: string, detail?: string) {
    const c = (["invalid", "attachments", "verification", "send", "unknown"].includes(code) ? code : "unknown") as Code;
    alertShow({ title: i18n.errors.title!, html: i18n.errorsHtml[detail ?? c], fallback: true, retry: c === "verification" || c === "send" || c === "unknown" });
    focusAlert();
  }
  function invalid(bad: { el: Control; msg: string }[]) {
    alertShow({ title: fmt(i18n.validation.summaryCount!, { count: bad.length }), list: bad });
    bad[0]!.el.focus();
  }

  /* ---------- steps ---------- */
  /**
   * MOT2-24: one motion per step change. Already in view → no scroll; far away (more than a screen) or motion paused →
   * an instant jump, then the step slides in; close → a short smooth scroll, and the slide waits for it to end.
   */
  function bringIntoView(target: HTMLElement) {
    const top = target.getBoundingClientRect().top;
    const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
    if (top >= margin - 8 && top < innerHeight * 0.45) return;
    if (motionOff() || Math.abs(top) > innerHeight) {
      target.scrollIntoView({ behavior: "auto", block: "start" });
      return;
    }
    form.setAttribute("data-scrolling", "");
    let timer = 0;
    const done = () => {
      clearTimeout(timer);
      form.removeAttribute("data-scrolling");
    };
    addEventListener("scrollend", done, { once: true });
    timer = window.setTimeout(done, 700); // browsers without scrollend
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function goTo(n: number, focus = true) {
    if (n !== step) form.dataset.stepDir = n > step ? "next" : "prev"; // motion only (CSS), never on load
    step = n;
    panels.forEach((p) => p.toggleAttribute("data-active", Number(p.dataset.step) === n));
    tabs.forEach((tab) => {
      const i = Number(tab.dataset.stepTab);
      tab.toggleAttribute("data-active", i === n);
      tab.toggleAttribute("data-done", i < n);
      if (i === n) tab.setAttribute("aria-current", "step");
      else tab.removeAttribute("aria-current");
      const done = tab.querySelector<HTMLElement>("[data-done-text]");
      if (done) done.hidden = i >= n;
    });
    actions1.hidden = n !== 1;
    actions2.hidden = n !== 2;
    back.hidden = n !== 2;
    live.textContent = fmt(i18n.counter, { current: n, total: 2 });
    if (focus) {
      const legend = panels[n - 1]?.querySelector<HTMLElement>("legend");
      legend?.focus({ preventScroll: true });
      // landscape phones (short viewports): bring the step's first fields into view, not the form's title and stepper
      bringIntoView(innerHeight < 520 && legend ? legend : form);
    }
  }
  goTo(1, false);

  $("[data-next]")!.addEventListener("click", () => {
    loadTurnstile();
    const bad = validate(panels[0]!);
    if (bad.length) return invalid(bad);
    alertHide();
    goTo(2);
  });
  back.addEventListener("click", () => goTo(1));

  /* ---------- Turnstile: loaded on the first interaction, rendered explicitly ---------- */
  let tsState: "idle" | "loading" | "ready" | "failed" = "idle";
  let tsError = false;
  let widget: string | undefined;
  let token = "";
  /** One number per load attempt: a late error event or give-up timer of an earlier attempt never touches a newer
   *  one (CODE2-10: after "Try again", the first attempt's timer used to mark a healthy second load "failed"). */
  let tsAttempt = 0;
  let tsTimer = 0;

  function renderTurnstile() {
    const ts = window.turnstile;
    if (!ts) return;
    clearTimeout(tsTimer);
    if (widget !== undefined) {
      tsState = "ready";
      return;
    }
    try {
      widget = ts.render(tsSlot, {
        sitekey: tsSlot.dataset.sitekey,
        language: tsSlot.dataset.language,
        size: "flexible",
        appearance: "interaction-only",
        callback: (t: string) => ((token = t), (tsError = false)),
        "error-callback": () => ((token = ""), (tsError = true), true),
        "expired-callback": () => (token = ""),
        "before-interactive-callback": () => ($("[data-ts-label]")!.hidden = false),
      });
      tsState = "ready";
    } catch {
      tsState = "failed";
    }
  }
  function loadTurnstile() {
    if (tsState !== "idle") return;
    tsState = "loading";
    const attempt = ++tsAttempt;
    const stale = () => attempt !== tsAttempt || tsState !== "loading";
    // api.js is already here (an earlier render threw): render again, never load the script a second time
    if (window.turnstile) return renderTurnstile();
    window.lcTsLoaded = renderTurnstile;
    const s = document.createElement("script");
    s.src = TS_SRC;
    s.async = true;
    s.onerror = () => stale() || (tsState = "failed");
    document.head.append(s);
    // Blocked without an error event (some content blockers): give up after a while.
    clearTimeout(tsTimer);
    tsTimer = window.setTimeout(() => stale() || (tsState = "failed"), TS_GIVE_UP_MS);
  }
  for (const type of ["focusin", "pointerdown", "input"]) form.addEventListener(type, loadTurnstile, { once: true, passive: true });

  const currentToken = () =>
    token || (widget !== undefined ? window.turnstile?.getResponse(widget) : "") || $<HTMLInputElement>("input[name='cf-turnstile-response']")?.value || "";

  /** Waits for a token: silently for 3 s, then says so (with the hand-over links); gives up after 15 s or on error. */
  async function getToken(): Promise<string> {
    loadTurnstile();
    const start = Date.now();
    let warned = false;
    while (Date.now() - start < 15_000) {
      const t = currentToken();
      if (t) break;
      if (tsState === "failed" || (tsError && Date.now() - start > 2000)) break;
      if (!warned && Date.now() - start > 3000) {
        warned = true;
        fillFallback();
        tsStatus.hidden = false;
        live.textContent = i18n.waiting;
      }
      await sleep(200);
    }
    tsStatus.hidden = true;
    return currentToken();
  }
  function resetTurnstile() {
    token = "";
    if (widget !== undefined) window.turnstile?.reset(widget);
  }

  retry.addEventListener("click", () => {
    alertHide();
    if (tsState === "failed") {
      // start over: the next loadTurnstile() loads api.js again if it never arrived, or only renders again if it did
      tsState = "idle";
      token = "";
      if (widget !== undefined) {
        try {
          window.turnstile?.remove?.(widget);
        } catch {}
        widget = undefined;
      }
      if (window.turnstile) tsSlot.replaceChildren(); // whatever a render that threw may have left
      else document.querySelector(`script[src='${TS_SRC}']`)?.remove();
    } else resetTurnstile();
    tsError = false;
    form.requestSubmit(lastSubmitter instanceof HTMLButtonElement && form.contains(lastSubmitter) ? lastSubmitter : undefined);
  });

  /* ---------- submit ---------- */
  const setSending = (on: boolean) => {
    sending = on;
    form.toggleAttribute("data-sending", on);
    $$("[data-submit-label]").forEach((l, i) => (l.textContent = on ? i18n.sending : i === 0 ? i18n.sendNow : i18n.submit));
    $$("[data-submit]").forEach((b) => b.setAttribute("aria-disabled", String(on)));
    if (on) live.textContent = i18n.sending;
    if (!on && progress) progress.hidden = true;
  };
  /** Upload progress (only shown when files go with the request): button label + bar. */
  const setProgress = (fraction: number) => {
    if (!progress) return;
    const pct = Math.min(100, Math.round(fraction * 100));
    progress.hidden = false;
    const bar = progress.querySelector<HTMLElement>("[role='progressbar']");
    bar?.setAttribute("aria-valuenow", String(pct));
    bar?.style.setProperty("--p", `${pct}%`);
    const label = fmt(i18n.files.uploading, { percent: pct });
    $$("[data-submit-label]").forEach((l) => (l.textContent = label));
  };

  type Answer = { status: number; json: { ok?: boolean; error?: string; ref?: string; skipped?: string[]; problem?: FileProblem; files?: string[] } | null };
  /** POST with upload progress and a watchdog (UX2-04): a stalled or endless request rejects with "timeout". */
  function post(data: FormData, withFiles: boolean): Promise<Answer> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const start = Date.now();
      let last = start;
      let uploaded = !withFiles;
      const watchdog = window.setInterval(() => {
        const now = Date.now();
        if (now - start > TOTAL_MS || now - last > (uploaded ? AFTER_UPLOAD_MS : STALL_MS)) xhr.abort();
      }, 1000);
      const end = () => clearInterval(watchdog);
      xhr.open("POST", form.action);
      xhr.setRequestHeader("Accept", "application/json");
      if (withFiles) {
        xhr.upload.addEventListener("progress", (e) => {
          last = Date.now();
          if (e.lengthComputable && e.total) setProgress(e.loaded / e.total);
        });
        xhr.upload.addEventListener("load", () => {
          uploaded = true;
          last = Date.now();
          setProgress(1);
        });
      }
      xhr.addEventListener("load", () => {
        end();
        let json: Answer["json"] = null;
        try {
          json = JSON.parse(xhr.responseText);
        } catch {}
        resolve({ status: xhr.status, json });
      });
      xhr.addEventListener("error", () => (end(), reject(new Error("network"))));
      xhr.addEventListener("abort", () => (end(), reject(new Error("timeout"))));
      xhr.send(data);
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (sending) return;
    submitted = true;
    lastSubmitter = (e as SubmitEvent).submitter;
    phone.value = toLatinDigits(phone.value);

    if (pending.length) {
      setSending(true);
      await filesReady(); // photos still being reduced (usually a fraction of a second)
      setSending(false);
    }
    const bad = validate(form);
    if (bad.length) {
      const inStep = Number(bad[0]!.el.closest<HTMLElement>("fieldset[data-step]")?.dataset.step ?? step);
      if (inStep !== step) goTo(inStep, false);
      return invalid(bad);
    }
    alertHide();
    setSending(true);

    const t = await getToken();
    if (!t) {
      setSending(false);
      live.textContent = "";
      serverError("verification", tsState === "failed" ? "verificationBlocked" : "verification");
      return;
    }

    const data = new FormData(form);
    data.set("cf-turnstile-response", t);
    data.delete(RFQ_FILES.field);
    for (const it of items) data.append(RFQ_FILES.field, it.file, it.file.name);
    let answer: Answer;
    try {
      answer = await post(data, items.length > 0);
    } catch (err) {
      setSending(false);
      resetTurnstile();
      serverError("send", (err as Error).message === "timeout" ? "timeout" : undefined);
      return;
    }
    const json = answer.json;
    if (json?.ok) return succeed(json.ref ?? "", json.skipped ?? []);
    setSending(false);
    resetTurnstile();
    if (json?.error === "attachments" && json.problem && fileInput) {
      // per-file answer from the Worker: name the files and send the visitor to them (UX2-05)
      if (json.problem === "type") for (const it of items) if (json.files?.includes(it.file.name)) it.issue = "type";
      renderFiles();
      const msg = fileMessage(json.problem);
      show(fileInput, msg);
      if (step !== 2) goTo(2, false);
      alertShow({ title: i18n.errors.title!, list: [{ el: fileInput, msg }] });
      focusAlert();
      return;
    }
    serverError(json?.error ?? (answer.status >= 500 || answer.status === 0 ? "send" : "unknown"));
  });

  function succeed(ref: string, skipped: string[]) {
    sentOk = true;
    clearTimeout(draftTimer);
    store.set(RFQ_SESSION.draft, null);
    live.textContent = i18n.sent;
    const sent: RfqSent = {
      ref,
      name: valueOf($<HTMLInputElement>("[name='name']")!),
      company: valueOf($<HTMLInputElement>("[name='company']")!),
      need: valueOf(select("service")!),
      files: items.map((i) => i.file.name).filter((n) => !skipped.includes(n)),
      skipped,
      reply: (() => {
        const chip = $<HTMLInputElement>("input[name='reply']:checked");
        return chip ? valueOf(chip) : "";
      })(),
      urgent: urgencyOf({ timeline: timeline?.value ?? "", service: select("service")?.value ?? "" }),
    };
    store.set(RFQ_SESSION.sent, JSON.stringify(sent));
    if (ref) store.set(RFQ_SESSION.last, JSON.stringify({ ref, urgent: sent.urgent } satisfies RfqLast));
    document.dispatchEvent(new CustomEvent("lc:evt", { detail: { k: "form-sent", p: "form" } }));
    // MOT-27 / MOT2-16: the success badge morphs into the thanks page's check badge (BaseLayout/motion.css,
    // data-vt-success). The overlay covers the whole (tall) form: bring its badge into view first, without animation.
    try {
      sessionStorage.lcSuccess = "1";
    } catch {}
    const badge = success.querySelector<HTMLElement>(".lc-success-badge");
    if (badge) badge.style.viewTransitionName = "lc-success";
    success.hidden = false;
    body.inert = true;
    const r = badge?.getBoundingClientRect();
    if (badge && r && (r.top < 64 || r.bottom > innerHeight)) badge.scrollIntoView({ behavior: "auto", block: "center" });
    success.querySelector<HTMLElement>("[tabindex]")?.focus({ preventScroll: true });
    const query = ref ? `?ref=${encodeURIComponent(ref)}${skipped.length ? `&skipped=${skipped.length}` : ""}` : "";
    let gone = false;
    const go = () => {
      if (gone) return;
      gone = true;
      location.assign(i18n.thanks + query);
    };
    if (motionOff()) go();
    else {
      // leave when the check has drawn (~640 ms); the timeout covers browsers that skip the animation
      badge?.addEventListener("animationend", (ev) => (ev as AnimationEvent).animationName === "lc-check-draw" && go());
      setTimeout(go, 1200);
    }
  }

  /* ---------- Back from the thanks page (CODE2-05) ---------- */
  // Restored from the back/forward cache, the page is exactly as it was left: the "sent" overlay over an inert,
  // "Sending…" form whose Turnstile token is spent. The request is gone and its draft cleared, so the visitor gets a
  // fresh form: emptied first (Firefox would otherwise put the old values back into the reloaded page), then reloaded.
  // A send still under way when the page was hidden settles on its own (the upload watchdog).
  addEventListener("pageshow", (e) => {
    if (!(e as PageTransitionEvent).persisted || !sentOk) return;
    form.reset();
    setSending(false);
    success.hidden = true; // no "sent" overlay while the fresh page loads
    body.inert = false;
    location.reload();
  });

  /* ---------- ?error= from the no-JS round trip ---------- */
  const err = params.get("error");
  if (err) {
    loadTurnstile();
    serverError(err);
  }
}
