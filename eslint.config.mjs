// ESLint (flat config): `npm run lint`.
// JS recommended + typescript-eslint recommended (not type-aware: `astro check` and `tsc -p worker` already type-check,
// and type-aware linting of .astro files is slow) + eslint-plugin-astro recommended + its jsx-a11y recommended rules
// (through eslint-plugin-jsx-a11y-x: the original eslint-plugin-jsx-a11y does not support ESLint 10 yet).
// Rules that find real bugs stay errors; anything turned off or scoped below says why.
import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import astro from "eslint-plugin-astro";
import globals from "globals";

export default defineConfig(
  {
    ignores: [
      "dist/**",
      ".astro/**",
      ".wrangler/**",
      "node_modules/**",
      "research/**",
      "client-data/**",
      "public/**",
      "test-results/**",
      "playwright-report/**",
      "playwright-report-json/**",
      "blob-report/**",
      ".lighthouseci/**",
      ".playwright-mcp/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs["flat/recommended"],
  ...astro.configs["flat/jsx-a11y-recommended"],
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // `_`-prefixed names are intentionally unused (destructuring placeholders, callback signatures).
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
      // `try { localStorage… } catch {}`: storage and clipboard APIs throw in private modes; ignoring that is the intent.
      "no-empty": ["error", { allowEmptyCatch: true }],
      // The text engine and i18n helpers match and insert NBSP / ideographic space / bidi marks on purpose.
      "no-irregular-whitespace": ["error", { skipStrings: true, skipComments: true, skipRegExps: true, skipTemplates: true }],
      // Lists keep role="list": Safari/VoiceOver drops list semantics when list-style is none (see .htmlvalidate.mjs).
      "astro/jsx-a11y/no-redundant-roles": ["error", { ul: ["list"], ol: ["list"] }],
    },
  },
  // <dialog> close buttons use `autofocus`: the HTML spec's way to set a modal dialog's initial focus.
  {
    files: ["src/components/Gallery.astro", "src/components/Header.astro", "src/components/HeaderDrawer.astro"],
    rules: { "astro/jsx-a11y/no-autofocus": "off" },
  },
  // One source of truth for "is motion off?" (CODE2-06): the OS setting AND the site's pause toggle. Scripts use
  // motionOff() / scrollBehavior() / onMotionChange from ~/scripts/motion/motion-pref (or html[data-motion="off"],
  // which the head script sets for both); a raw matchMedia("(prefers-reduced-motion…)") ignores the toggle.
  // CSS @media blocks are not affected. Exempt: motion-pref.ts itself and BaseLayout's pre-paint head script.
  {
    files: ["src/**/*.{ts,astro,mjs,js}"],
    ignores: ["src/scripts/motion/motion-pref.ts", "src/layouts/BaseLayout.astro", "src/layouts/BaseLayout.astro/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name='matchMedia'] Literal[value=/prefers-reduced-motion/]",
          message: "Use motionOff() / scrollBehavior() from ~/scripts/motion/motion-pref (they also honour the 'Pause animations' toggle).",
        },
        {
          selector: "CallExpression[callee.property.name='matchMedia'] Literal[value=/prefers-reduced-motion/]",
          message: "Use motionOff() / scrollBehavior() from ~/scripts/motion/motion-pref (they also honour the 'Pause animations' toggle).",
        },
        {
          selector: "CallExpression[callee.name='matchMedia'] TemplateElement[value.raw=/prefers-reduced-motion/]",
          message: "Use motionOff() / scrollBehavior() from ~/scripts/motion/motion-pref (they also honour the 'Pause animations' toggle).",
        },
        {
          selector: "CallExpression[callee.property.name='matchMedia'] TemplateElement[value.raw=/prefers-reduced-motion/]",
          message: "Use motionOff() / scrollBehavior() from ~/scripts/motion/motion-pref (they also honour the 'Pause animations' toggle).",
        },
      ],
    },
  },
  // Case-study clips have their audio stripped and a visible text description (videoDescription): nothing to caption.
  {
    files: ["src/components/VideoPlayer.astro"],
    rules: { "astro/jsx-a11y/media-has-caption": "off" },
  },
  // Dev-only lab pages (never built for production): scrollable demo strips are focusable so they scroll by keyboard.
  {
    files: ["src/pages/[[]lang]/lab/**"],
    rules: { "astro/jsx-a11y/no-noninteractive-tabindex": "off" },
  },
  // CommonJS tools (brand asset generators): `require` is the module system there.
  {
    files: ["**/*.cjs"],
    languageOptions: { sourceType: "commonjs" },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  // Cloudflare Worker: Workers runtime globals, no DOM.
  {
    files: ["worker/**/*.ts"],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
);
