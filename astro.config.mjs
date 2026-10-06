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
      filter: (page) => !page.includes("/thanks/") && !page.includes("/styleguide/") && !page.includes("/lab/") && page !== "https://logic-controls.com/",
    }),
  ],
  // Fallbacks: metric-matched local faces defined in src/styles/global.css ("metric-matched font fallbacks"), one size
  // per weight band and script, so the font swap does not re-wrap text (CLS). Astro's generated fallback is turned off:
  // it used a single size for every weight and Latin metrics for Arabic.
  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: "Montserrat",
      cssVariable: "--font-latin",
      weights: ["300 900"],
      styles: ["normal", "italic"],
      subsets: ["latin", "latin-ext"],
      fallbacks: ["LC Montserrat Fallback", "system-ui", "sans-serif"],
      optimizedFallbacks: false,
    },
    {
      provider: fontProviders.fontsource(),
      name: "Alexandria",
      cssVariable: "--font-arabic",
      weights: ["300 900"],
      styles: ["normal"],
      subsets: ["arabic", "latin"],
      fallbacks: ["LC Alexandria Fallback", "Segoe UI", "Tahoma", "sans-serif"],
      optimizedFallbacks: false,
    },
  ],
  image: { layout: "constrained", responsiveStyles: true },
  vite: { plugins: [tailwindcss()] },
});
