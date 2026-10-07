/**
 * Quote form (RfqForm.astro), progressive enhancement. Without this script the form is one long page that posts
 * natively (multipart, attachments included) and the Worker answers 303 → thanks / ?error=…#rfq-error-….
 *
 * With it: two steps, localized inline validation with a linked error summary, attachments list with limits,
 * "machine stopped? call now" panel, Turnstile loaded on the first interaction (explicit render), JSON submit with
 * a live "sending" announcement, and a recovery path when the security check or the server fails: the visitor's
 * request is handed over pre-filled to WhatsApp (not on zh) or email, plus "Try again".
 * Limits and validation rules come from src/lib/rfq-rules.ts (the Worker uses the same module).
 * The typed values (not files, not consent) are kept as a draft in sessionStorage, so switching the page language
 * keeps them; on success the draft is cleared and {name, company, need, ref} is handed to the thanks page.
 */
import {
  RFQ_FILES,
  RFQ_MAX,
  RFQ_NAME_MIN,
  URGENT_SERVICES,
  URGENT_TIMELINE,
  checkFiles,
  isValidEmail,
  isValidPhone,
  toLatinDigits,
  type FileProblem,
} from "~/lib/rfq-rules";
import { motionOff } from "~/scripts/motion/motion-pref";

type Code = "invalid" | "attachments" | "verification" | "send" | "unknown";
type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export interface RfqI18n {
  validation: Record<string, string>;
  errors: Record<string, string>;
  counter: string;
  sending: string;
  submit: string;
  sendNow: string;
  sent: string;
  waiting: string;
  thanks: string;
  files: { remove: string; summary: string };
  prefill: { intro: string; subject: string; files: string };
  whatsapp: string | null;
  email: string;
}

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  getResponse: (id?: string) => string | undefined;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
    lcTsLoaded?: () => void;
  }
}

const TS_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=lcTsLoaded";
const DRAFT_KEY = "lcRfqDraft";
/** Read by the thanks page (contact/thanks/index.astro) for the pre-filled "send the drawings" messages. */
const SENT_KEY = "lcRfqSent";
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
const fmt = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? `{${k}}`));
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
/** "614 KB", "1.9 MB", "4 MB", as an LTR isolate (Arabic text would otherwise show "MB 4"). */
const LRI = String.fromCharCode(0x2066);
const PDI = String.fromCharCode(0x2069);
const mb = (n: number) =>
  LRI + (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1).replace(/\.0$/, "")} MB`) + PDI;

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
  const fileList = $<HTMLUListElement>("[data-files-list]");
  const fileSummary = $("[data-files-summary]");
  const urgent = $("[data-urgent]");
  let step = 1;
  let submitted = false;
  let sending = false;
  let lastSubmitter: HTMLElement | null = null;

  /* ---------- progressive enhancement ---------- */
  form.noValidate = true;
  form.setAttribute("data-enhanced", "");
  $("[data-stepper]")!.hidden = false;
  message.removeAttribute("maxlength"); // the counter + validation message replace the hard stop (paste stays visible)

  const controls = (scope: ParentNode) =>
    [...scope.querySelectorAll<Control>("input:not([type=hidden]):not([name=lc_hp]), select, textarea")].filter(
      (el) => !el.closest("[data-turnstile]"),
    );

  // Context: the page that sent the visitor here, and ?service= / ?industry= / ?location= / ?timeline= preselection.
  const params = new URLSearchParams(location.search);
  const pageField = $<HTMLInputElement>("[data-page-field]")!;
  try {
    const ref = document.referrer ? new URL(document.referrer) : null;
    pageField.value = ref && ref.origin === location.origin && ref.pathname !== location.pathname ? ref.pathname : location.pathname + location.search;
  } catch {
    /* keep the server-rendered value */
  }
  const select = (name: string) => $<HTMLSelectElement>(`select[name='${name}']`);

  /* ---------- draft: survives a language switch (same tab); never files or consent ---------- */
  const draftable = () => controls(form).filter((el) => el.type !== "file" && el.type !== "checkbox");
  try {
    const draft = JSON.parse(store.get(DRAFT_KEY) ?? "{}") as Record<string, string>;
    for (const el of draftable()) {
      const v = draft[el.name];
      if (v === undefined) continue;
      if (el instanceof HTMLInputElement && el.type === "radio") el.checked = el.value === v;
      else if (el instanceof HTMLSelectElement) {
        if ([...el.options].some((o) => o.value === v)) el.value = v;
      } else if (!el.value) el.value = v;
    }
  } catch {
    /* no or broken draft */
  }
  let draftTimer = 0;
  const saveDraft = () => {
    clearTimeout(draftTimer);
    draftTimer = window.setTimeout(() => {
      const draft: Record<string, string> = {};
      for (const el of draftable()) {
        if (el instanceof HTMLInputElement && el.type === "radio") {
          if (el.checked) draft[el.name] = el.value;
        } else if (el.value.trim()) draft[el.name] = el.value;
      }
      store.set(DRAFT_KEY, Object.keys(draft).length ? JSON.stringify(draft) : null);
    }, 300);
  };
  form.addEventListener("input", saveDraft);
  form.addEventListener("change", saveDraft);

  // ?service= / ?industry= / ?location= / ?timeline= from the page that linked here win over the draft
  for (const name of ["service", "industry", "location", "timeline"]) {
    const sel = select(name);
    const value = params.get(name);
    if (sel && value && [...sel.options].some((o) => o.value === value)) sel.value = value;
  }

  /* ---------- labels (for the error summary and the hand-over message) ---------- */
  const labelOf = (el: Control) => {
    const label = form.querySelector<HTMLElement>(`label[for='${el.id}'] > span:first-child`);
    return (label?.textContent ?? el.name).trim();
  };
  const valueOf = (el: Control) =>
    el instanceof HTMLSelectElement ? (el.value ? (el.selectedOptions[0]?.textContent?.trim() ?? "") : "") : el.value.trim();

  /* ---------- validation ---------- */
  const fileMessage: Record<FileProblem, string> = {
    type: i18n.validation.filesType!,
    count: fmt(i18n.validation.filesCount!, { max: RFQ_FILES.maxCount }),
    size: fmt(i18n.validation.filesSize!, { max: mb(RFQ_FILES.maxTotal) }),
  };

  const replyByEmail = () => $<HTMLInputElement>("input[name='reply']:checked")?.value === "email";
  // choosing "email" makes the email field required (and choosing something else releases it)
  form.addEventListener("change", (e) => {
    const email = $<HTMLInputElement>("[data-email]");
    if (e.target instanceof HTMLInputElement && e.target.name === "reply" && email && (submitted || email.getAttribute("aria-invalid") === "true"))
      show(email, check(email));
  });

  function check(el: Control): string {
    if (el instanceof HTMLInputElement && el.type === "checkbox") return el.checked || !el.required ? "" : i18n.validation.consent!;
    if (el instanceof HTMLInputElement && el.type === "file") {
      const problem = checkFiles([...(el.files ?? [])]);
      return problem ? fileMessage[problem] : "";
    }
    const v = el.value.trim();
    if (el.name === "phone") {
      if (!v) return el.required ? i18n.validation.required! : "";
      return isValidPhone(v) ? "" : i18n.validation.phone!;
    }
    if (el.name === "email") {
      if (!v) return el.required ? i18n.validation.required! : replyByEmail() ? i18n.validation.emailForReply! : "";
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
  for (const el of controls(form)) {
    el.addEventListener("blur", () => {
      if (el.name === "phone" && el.value) el.value = toLatinDigits(el.value);
      if (el.type !== "file" && (submitted || el.value.trim())) show(el, check(el));
    });
    const live = el instanceof HTMLSelectElement || el.type === "checkbox" || el.type === "file" ? "change" : "input";
    el.addEventListener(live, () => {
      if (el.getAttribute("aria-invalid") === "true") show(el, check(el));
    });
  }

  // Character counter for the description (only shown near the limit).
  message.addEventListener("input", () => {
    const n = message.value.length;
    count.hidden = n < RFQ_MAX.message * 0.8;
    count.textContent = `${n} / ${RFQ_MAX.message}`;
    count.toggleAttribute("data-over", n > RFQ_MAX.message);
  });

  // Enter in a step-1 field continues to step 2 (the form's default button would otherwise be "Skip and send now").
  panels[0]!.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && step === 1 && e.target instanceof HTMLInputElement && !e.isComposing) {
      e.preventDefault();
      $<HTMLButtonElement>("[data-next]")!.click();
    }
  });

  /* ---------- attachments ---------- */
  if (fileInput && fileList && fileSummary) {
    const render = () => {
      const files = [...(fileInput.files ?? [])];
      fileList.replaceChildren(
        ...files.map((f, i) => {
          const li = document.createElement("li");
          li.className = "lc-file-item";
          const name = document.createElement("span");
          name.className = "lc-file-name";
          name.dir = "auto";
          name.textContent = f.name;
          const size = document.createElement("span");
          size.className = "lc-file-size ltr";
          size.dir = "ltr";
          size.textContent = mb(f.size);
          const rm = document.createElement("button");
          rm.type = "button";
          rm.className = "lc-file-remove";
          rm.setAttribute("aria-label", fmt(i18n.files.remove, { name: f.name }));
          rm.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
          rm.addEventListener("click", () => {
            const dt = new DataTransfer();
            files.forEach((file, j) => j !== i && dt.items.add(file));
            fileInput.files = dt.files;
            render();
            if (fileInput.getAttribute("aria-invalid") === "true" || submitted) show(fileInput, check(fileInput));
            (fileList.querySelectorAll<HTMLButtonElement>(".lc-file-remove")[Math.min(i, files.length - 2)] ?? fileInput).focus();
          });
          li.append(name, size, rm);
          return li;
        }),
      );
      const total = files.reduce((n, f) => n + f.size, 0);
      fileSummary.hidden = files.length === 0;
      fileSummary.textContent = fmt(i18n.files.summary, { count: files.length, max: RFQ_FILES.maxCount, size: mb(total), maxSize: mb(RFQ_FILES.maxTotal) });
    };
    fileInput.addEventListener("change", () => {
      render();
      show(fileInput, check(fileInput));
    });
    render();
  }

  /* ---------- "machine stopped?" panel ---------- */
  if (urgent) {
    const update = () => {
      const on = URGENT_SERVICES.includes(select("service")?.value ?? "") || select("timeline")?.value === URGENT_TIMELINE;
      urgent.hidden = !on;
    };
    select("service")?.addEventListener("change", update);
    select("timeline")?.addEventListener("change", update);
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
      if (el instanceof HTMLInputElement && el.type === "radio") {
        if (el.checked) lines.push(`${el.closest("fieldset")?.querySelector("legend > span")?.textContent?.trim() ?? el.name}: ${labelOf(el)}`);
        continue;
      }
      const v = valueOf(el);
      if (v) lines.push(`${labelOf(el)}: ${el.name === "message" && v.length > 700 ? `${v.slice(0, 700)}…` : v}`);
    }
    const files = [...(fileInput?.files ?? [])].map((f) => f.name);
    if (files.length) lines.push(fmt(i18n.prefill.files, { files: files.join(", ") }));
    return lines.join("\n");
  }
  function fillFallback() {
    const text = handover();
    if (i18n.whatsapp) {
      const href = `https://wa.me/${i18n.whatsapp}?text=${encodeURIComponent(text)}`;
      $$<HTMLAnchorElement>("[data-fallback='whatsapp']").forEach((a) => (a.href = href));
    }
    const mailto = `mailto:${i18n.email}?subject=${encodeURIComponent(i18n.prefill.subject)}&body=${encodeURIComponent(text.replace(/\n/g, "\r\n"))}`;
    $$<HTMLAnchorElement>("[data-fallback='email']").forEach((a) => (a.href = mailto));
  }

  function alertShow(opts: { title: string; text?: string; list?: { el: Control; msg: string }[]; fallback?: boolean; retry?: boolean }) {
    $("[data-alert-title]")!.textContent = opts.title;
    const text = $("[data-alert-text]")!;
    text.textContent = opts.text ?? "";
    text.hidden = !opts.text;
    alertList.replaceChildren(
      ...(opts.list ?? []).map(({ el, msg }) => {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = `#${el.id}`;
        a.textContent = el.type === "checkbox" ? msg : `${labelOf(el)}: ${msg}`;
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
    alertBox.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "center" });
  }
  function serverError(code: string, detail?: string) {
    const c = (["invalid", "attachments", "verification", "send", "unknown"].includes(code) ? code : "unknown") as Code;
    alertShow({ title: i18n.errors.title!, text: detail ?? i18n.errors[c], fallback: true, retry: c === "verification" || c === "send" || c === "unknown" });
    focusAlert();
  }
  function invalid(bad: { el: Control; msg: string }[]) {
    alertShow({ title: fmt(i18n.validation.summaryCount!, { count: bad.length }), list: bad });
    bad[0]!.el.focus();
  }

  /* ---------- steps ---------- */
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
      (innerHeight < 520 && legend ? legend : form).scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
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

  function renderTurnstile() {
    const ts = window.turnstile;
    if (!ts || widget !== undefined) return;
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
    window.lcTsLoaded = renderTurnstile;
    const s = document.createElement("script");
    s.src = TS_SRC;
    s.async = true;
    s.onerror = () => (tsState = "failed");
    document.head.append(s);
    // Blocked without an error event (some content blockers): give up after 12 s.
    setTimeout(() => tsState === "loading" && (tsState = "failed"), 12_000);
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
      tsState = "idle";
      widget = undefined;
      document.querySelector(`script[src='${TS_SRC}']`)?.remove();
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
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (sending) return;
    submitted = true;
    lastSubmitter = (e as SubmitEvent).submitter;
    const phone = $<HTMLInputElement>("[data-phone]")!;
    phone.value = toLatinDigits(phone.value);

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
      serverError("verification", tsState === "failed" ? i18n.errors.verificationBlocked : i18n.errors.verification);
      return;
    }

    const data = new FormData(form);
    data.set("cf-turnstile-response", t);
    let res: Response | undefined;
    let json: { ok?: boolean; error?: string; ref?: string } | null;
    try {
      res = await fetch(form.action, { method: "POST", body: data, headers: { Accept: "application/json" } });
      json = await res.json().catch(() => null);
    } catch {
      setSending(false);
      resetTurnstile();
      serverError("send");
      return;
    }
    if (json?.ok) {
      live.textContent = i18n.sent;
      // MOT-27: the success badge morphs into the thanks page's check badge (BaseLayout/motion.css, data-vt-success).
      try {
        sessionStorage.lcSuccess = "1";
      } catch {}
      const badge = success.querySelector<HTMLElement>(".lc-success-badge");
      if (badge) badge.style.viewTransitionName = "lc-success";
      success.hidden = false;
      body.inert = true;
      success.querySelector<HTMLElement>("[tabindex]")?.focus({ preventScroll: true });
      const ref = json.ref ? `?ref=${encodeURIComponent(json.ref)}` : "";
      store.set(DRAFT_KEY, null);
      store.set(
        SENT_KEY,
        JSON.stringify({ ref: json.ref ?? "", name: valueOf($<HTMLInputElement>("[name='name']")!), company: valueOf($<HTMLInputElement>("[name='company']")!), need: valueOf(select("service")!) }),
      );
      let gone = false;
      const go = () => {
        if (gone) return;
        gone = true;
        location.assign(i18n.thanks + ref);
      };
      if (motionOff()) go();
      else {
        // leave when the check has drawn (~640 ms); the timeout covers browsers that skip the animation
        badge?.addEventListener("animationend", (ev) => (ev as AnimationEvent).animationName === "lc-check-draw" && go());
        setTimeout(go, 1200);
      }
      return;
    }
    setSending(false);
    resetTurnstile();
    serverError(json?.error ?? (res && res.status >= 500 ? "send" : "unknown"));
  });

  /* ---------- ?error= from the no-JS round trip ---------- */
  const err = params.get("error");
  if (err) {
    loadTurnstile();
    serverError(err);
  }
}
