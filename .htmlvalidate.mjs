// html-validate config for the built site: `npm run qa:html` (after `npm run build`).
// Off on purpose (not errors in this codebase):
//  - no-redundant-role / prefer-native-element: lists keep role="list" because Safari/VoiceOver drops list
//    semantics when list-style is none (Tailwind preflight).
//  - no-inline-style, attribute-boolean-style, attribute-empty-style, void-style, doctype-style,
//    no-trailing-whitespace, no-raw-characters: Astro output formatting / design tokens in style="".
//  - unique-landmark: the header <nav> (shown ≥1024px) and the drawer <nav> (inside the closed <dialog>, <1024px)
//    are one responsive pair with the same name ("Main"); only one is ever exposed to assistive tech at a time, so
//    a second name would only describe the layout. Every other landmark pair passes the rule (checked 2026-10).
// long-title stays on (longest built <title>: 62 characters, limit 70).
// Scoped, not off:
//  - tel-non-breaking ignores tel: links whose text is a call-to-action LABEL ("Call an engineer", "Call us"), not the
//    number: <Button> (.lc-btn) and links marked .lc-tel-label. Label words must be able to wrap (long tr/ar labels at
//    320px). Every rendered number comes from SITE.phone.display/local, which already uses U+00A0 (src/data/site.ts),
//    and all other tel: links (number as text) are still checked.
export default {
  extends: ["html-validate:recommended"],
  rules: {
    "no-redundant-role": "off",
    "prefer-native-element": "off",
    "no-inline-style": "off",
    "attribute-boolean-style": "off",
    "attribute-empty-style": "off",
    "void-style": "off",
    "doctype-style": "off",
    "no-trailing-whitespace": "off",
    "no-raw-characters": "off",
    "unique-landmark": "off",
    "tel-non-breaking": ["error", { ignoreClasses: ["lc-btn", "lc-tel-label"] }],
  },
};
