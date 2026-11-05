// =====================================================================
// guide - Companion Guide access for Event Bundle buyers
//   GET ?t=<pickup_token>  -> { ok, name, guide:{title, sections[]}, pdf_url } or 403
// Access = a paid, non-refunded event_bundle order for this token, OR an
// active (not revoked) "companion_guide" entitlement for that order's email.
// Later: a Supabase Auth My Library page calls the same check with the
// signed-in user's email instead of a token (see README).
// PDF: private Storage bucket "guides", object companion-guide.pdf, 10 min signed URL.
// Deploy: supabase functions deploy guide --no-verify-jwt
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GUIDE } from "./content.ts";

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://neverfightorargue.com";
const ALLOWED = [SITE_URL, "https://www.neverfightorargue.com"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRODUCT = "companion_guide";

function cors(origin: string | null) {
  const ok = origin && (ALLOWED.includes(origin) || origin.startsWith("http://localhost"));
  return { "Access-Control-Allow-Origin": ok ? origin! : SITE_URL, "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "content-type", "Content-Type": "application/json", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };
}

Deno.serve(async (req) => {
  const headers = cors(req.headers.get("origin"));
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "GET") return json({ error: "GET only" }, 405);
  const t = new URL(req.url).searchParams.get("t") ?? "";
  if (!UUID.test(t)) return json({ ok: false, error: "This guide link is not valid." }, 403);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: order } = await db.from("preorders").select("id, email, name, status, product").eq("pickup_token", t.toLowerCase()).maybeSingle();
  if (!order) return json({ ok: false, error: "This guide link is not valid." }, 403);
  let allowed = order.product === "event_bundle" && order.status === "paid";
  if (!allowed && order.email) {
    const { data: ent } = await db.from("entitlements").select("id").eq("email_lower", order.email.toLowerCase()).eq("product", PRODUCT).is("revoked_at", null).maybeSingle();
    allowed = !!ent && order.status !== "refunded";
  }
  if (!allowed) return json({ ok: false, error: "This order does not include the Companion Guide, or it was refunded." }, 403);
  const { data: signed } = await db.storage.from("guides").createSignedUrl("companion-guide.pdf", 600, { download: "Never-Fight-Companion-Guide.pdf" });
  return json({ ok: true, name: (order.name ?? "").split(" ")[0], guide: GUIDE, pdf_url: signed?.signedUrl ?? null });
});
