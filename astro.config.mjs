// @ts-check
import { defineConfig, fontProviders } from "astro/config";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://logic-controls.com",
  trailingSlash: "always",
  build: { format: "directory" },
  i18n: {
    locales: ["en", "ar", "zh", "tr"],
    defaultLocale: "en",
    routing: { prefixDefaultLocale: true, redirectToDefaultLocale: false },
  },
  integrations: [
    sitemap({
      i18n: { defaultLocale: "en", locales: { en: "en", ar: "ar", zh: "zh-Hans", tr: "tr" } },
      filter: (page) => !page.includes("/thanks/") && !page.includes("/styleguide/") && page !== "https://logic-controls.com/",
    }),
  ],
  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: "Montserrat",
      cssVariable: "--font-latin",
      weights: ["300 900"],
      styles: ["normal", "italic"],
      subsets: ["latin", "latin-ext"],
      fallbacks: ["system-ui", "sans-serif"],
    },
    {
      provider: fontProviders.fontsource(),
      name: "Alexandria",
      cssVariable: "--font-arabic",
      weights: ["300 900"],
      styles: ["normal"],
      subsets: ["arabic"],
      fallbacks: ["Segoe UI", "Tahoma", "sans-serif"],
    },
  ],
  image: { layout: "constrained", responsiveStyles: true },
  vite: { plugins: [tailwindcss()] },
});
