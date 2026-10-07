/**
 * Bidi isolation for numbers with units inside localized sentences ("72.0 °C", "≥ 15 s", "3000 L/h", "10.1″").
 * Wraps each run in LRI…PDI (U+2066 … U+2069) so it stays one left-to-right piece inside Arabic text.
 * Skips digits that belong to tags/standards ("TT-102", "ISA-18.2"). Idempotent.
 */
const LRI = String.fromCharCode(0x2066);
const PDI = String.fromCharCode(0x2069);
// a decimal comma counts too (Turkish "72,0 °C"), so the number and its unit stay one run
const RUN = /(?<![\w.,-])(?:[≥≤]\s?)?-?\d+(?:[.,]\d+)?(?:\s?(?:°C|bar|L\/h|ms|s|%|L|Hz|mA)\b|\s?°C|″)?/g;

export const iso = (s: string): string => s.split(LRI).join("").split(PDI).join("").replace(RUN, (m) => LRI + m + PDI);
