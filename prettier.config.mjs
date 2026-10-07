// Prettier: `npm run format` (write) / `npm run format:check`.
// printWidth 140 matches the codebase's long-line style (class lists, i18n calls). The Tailwind plugin sorts classes
// against the site's real theme (global.css) and must be the last plugin.
/** @type {import("prettier").Config} */
export default {
  printWidth: 140,
  plugins: ["prettier-plugin-astro", "prettier-plugin-tailwindcss"],
  tailwindStylesheet: "./src/styles/global.css",
  tailwindFunctions: ["clsx"],
  tailwindAttributes: ["class:list"],
  overrides: [{ files: "*.astro", options: { parser: "astro" } }],
};
