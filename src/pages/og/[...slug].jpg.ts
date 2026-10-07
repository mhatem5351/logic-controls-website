/**
 * Open Graph cards (case studies, with the cover photo: JPEG), one per page and locale: /og/<locale>/<path>.jpg.
 * Registry: src/lib/og.ts · drawing: src/lib/og-render.ts. Prerendered at build; rendered on request in `astro dev`.
 */
import type { APIRoute, GetStaticPaths } from "astro";
import { ogExt, ogSlug, ogSpecs } from "~/lib/og";
import { renderOgCard } from "~/lib/og-render";

const specs = () => [...ogSpecs().values()].filter((s) => ogExt(s) === "jpg");

export const getStaticPaths = (() => specs().map((s) => ({ params: { slug: ogSlug(s) } }))) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ params }) => {
  const spec = specs().find((s) => ogSlug(s) === params.slug);
  if (!spec) return new Response(null, { status: 404 });
  const { body, type } = await renderOgCard(spec);
  return new Response(new Uint8Array(body), { headers: { "Content-Type": type } });
};
