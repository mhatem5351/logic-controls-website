/**
 * Human-readable English labels for the select values the form posts (slugs), so the owner's email reads
 * "Retrofit or upgrade of an old machine", not "machine-retrofits". Single source: the English message files the
 * form itself renders from (bundled into the Worker by wrangler/esbuild; ~1 KB of strings are used).
 */
import contact from "../src/i18n/messages/en/contact.json";
import common from "../src/i18n/messages/en/common.json";

type Options = Record<string, string>;
const f = contact.form.fields;
const zones: Options = Object.fromEntries(Object.entries(common.zones.items).map(([slug, z]) => [slug, z.name]));

const LABELS: Record<"service" | "industry" | "timeline" | "location" | "reply", Options> = {
  service: f.need.options,
  industry: f.industry.options,
  timeline: f.timeline.options,
  location: { ...zones, otherEgypt: f.location.otherEgypt, outsideEgypt: f.location.outsideEgypt },
  reply: f.contactPreference.options,
};

/** The English label for a posted select value, or null when the value is not one the form offers. */
export function optionLabel(field: string, value: string): string | null {
  const map = (LABELS as Record<string, Options | undefined>)[field];
  return (map && Object.hasOwn(map, value) && map[value]) || null;
}
