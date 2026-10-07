/**
 * Bidi isolation + no-wrap glue for numbers with units inside localized sentences ("72.0 °C", "≥ 15 s", "3000 L/h",
 * "10.1″"), for the strings the HMI controller writes at runtime (textContent; the text engine in ~/lib/text is
 * server-side only):
 *  - each number run is wrapped in LRI…PDI (U+2066 … U+2069) so it stays one left-to-right piece inside Arabic text;
 *  - the spaces inside the run become NO-BREAK SPACEs: an isolate does not stop a line break inside it ("2 | s");
 *  - tag / standard codes ("TT-102", "ISA-101", "B-1042") get a WORD JOINER after the hyphen, so they never split.
 * Digits that belong to codes are not isolated as numbers. Idempotent.
 */
const LRI = String.fromCharCode(0x2066);
const PDI = String.fromCharCode(0x2069);
const WJ = String.fromCharCode(0x2060);
const NBSP = String.fromCharCode(0xa0);
// a decimal comma counts too (Turkish "72,0 °C"), so the number and its unit stay one run
const RUN = /(?<![\w.,\-⁠])(?:[≥≤]\s?)?-?\d+(?:[.,]\d+)?(?:\s?(?:°C|bar|L\/h|ms|s|%|L|Hz|mA)\b|\s?°C|″)?/g;
const CODE = /\b([A-Z]{1,5})-(?=\d)/g;
const CONTROLS = /[⁠⁦-⁩]/g;

export const iso = (s: string): string =>
  s
    .replace(CONTROLS, "")
    .replace(RUN, (m) => LRI + m.replace(/\s/g, NBSP) + PDI)
    .replace(CODE, `$1-${WJ}`);
