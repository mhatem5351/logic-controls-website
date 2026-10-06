// html-validate config for the built site: `npm run qa:html` (after `npm run build`).
// Off on purpose (not errors in this codebase):
//  - no-redundant-role / prefer-native-element: lists keep role="list" because Safari/VoiceOver drops list
//    semantics when list-style is none (Tailwind preflight).
//  - no-inline-style, attribute-boolean-style, attribute-empty-style, void-style, doctype-style,
//    no-trailing-whitespace, no-raw-characters, long-title: Astro output formatting / design tokens in style="".
//  - unique-landmark: responsive pairs share a name but only one is ever exposed to assistive tech at a time — the
//    header <nav> (≥1024px) and the drawer <nav> inside the closed <dialog>, and the privacy page's two tables of
//    contents (collapsible on phones, sticky from 1024px).
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
    "long-title": "off",
    "unique-landmark": "off",
  },
};
