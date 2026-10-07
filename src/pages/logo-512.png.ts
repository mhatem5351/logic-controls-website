/** /logo-512.png: the full horizontal logo on a 512×512 white square, for Organization.logo in structured data. */
import type { APIRoute } from "astro";
import { renderSquareLogo } from "~/lib/og-render";

export const GET: APIRoute = async () => new Response(new Uint8Array(await renderSquareLogo()), { headers: { "Content-Type": "image/png" } });
