/**
 * Small isomorphic string helpers (importable from Astro frontmatter and from client <script>s, which Astro bundles).
 * One placeholder engine for the whole site: `{name}` tokens, every occurrence replaced, explicit missing-key policy.
 */

export interface FmtOptions {
  /** What a placeholder without a value becomes: "keep" leaves `{name}` visible (default), "empty" removes it. */
  missing?: "keep" | "empty";
}

/** Replace every `{placeholder}` in a message: fmt("{n} / {total}", { n: 1, total: 4 }) → "1 / 4". */
export function fmt(template: string, vars: Record<string, string | number | undefined>, options: FmtOptions = {}): string {
  const keep = (options.missing ?? "keep") === "keep";
  return template.replace(/\{(\w+)\}/g, (token, k: string) => {
    const v = vars[k];
    return v === undefined || v === null ? (keep ? token : "") : String(v);
  });
}

/** Two-digit technical index used by section headings, steps and lists: pad2(3) → "03". */
export const pad2 = (n: number): string => String(n).padStart(2, "0");
