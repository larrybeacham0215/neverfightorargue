// =====================================================================
// guide - Companion Guide for Event Bundle buyers (interactive)
//   GET  ?t=<pickup_token>            -> { ok, name, guide, answers, pdf_url }
//   POST ?t=<pickup_token> {answers:{field_id: value}} -> { ok, saved }
// Access = a paid, non-refunded event_bundle order for this token, OR an
// active (not revoked) "companion_guide" entitlement for that order's email.
// Answers live in public.guide_answers (RLS on, no policies), keyed by the
// entitlement ('ent:<id>') when there is one, else the order ('ord:<id>'), so
// they follow the buyer to any device that has the link.
// Limits: known field ids only, 4000 chars per value, 160 fields and 256 KB per
// POST, 40 POSTs per minute per token (per instance).
// Blank PDF: private bucket "guides", object companion-guide.pdf, 10 min signed URL.
// Deploy: supabase functions deploy guide --no-verify-jwt
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GUIDE } from "./content.ts";

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://neverfightorargue.com";
const ALLOWED = [SITE_URL, "https://www.neverfightorargue.com"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRODUCT = "companion_guide";
const FIELDS = GUIDE.fields as Record<string, string>;
const MAX_VAL = 4000, MAX_FIELDS = 160, MAX_BODY = 256 * 1024, RATE = 40;
const hits = new Map<string, number[]>();

function cors(origin: string | null) {
  const ok = origin && (ALLOWED.includes(origin) || origin.startsWith("http://localhost"));
  return { "Access-Control-Allow-Origin": ok ? origin! : SITE_URL, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "content-type", "Content-Type": "application/json", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };
}
function limited(t: string) {
  const now = Date.now(); const a = (hits.get(t) ?? []).filter((x) => now - x < 60000);
  a.push(now); hits.set(t, a); if (hits.size > 5000) hits.clear();
  return a.length > RATE;
}

Deno.serve(async (req) => {
  const headers = cors(req.headers.get("origin"));
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "GET" && req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const t = (new URL(req.url).searchParams.get("t") ?? "").toLowerCase();
  if (!UUID.test(t)) return json({ ok: false, error: "This guide link is not valid." }, 403);
  if (req.method === "POST" && limited(t)) return json({ ok: false, error: "Saving too fast. Try again in a minute." }, 429);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: order } = await db.from("preorders").select("id, email, name, status, product").eq("pickup_token", t).maybeSingle();
  if (!order) return json({ ok: false, error: "This guide link is not valid." }, 403);
  let ent: { id: string } | null = null;
  if (order.email) {
    const r = await db.from("entitlements").select("id").eq("email_lower", order.email.toLowerCase()).eq("product", PRODUCT).is("revoked_at", null).maybeSingle();
    ent = r.data;
  }
  const allowed = order.status !== "refunded" && ((order.product === "event_bundle" && order.status === "paid") || !!ent);
  if (!allowed) return json({ ok: false, error: "This order does not include the Companion Guide, or it was refunded." }, 403);
  const owner = ent ? `ent:${ent.id}` : `ord:${order.id}`;

  if (req.method === "POST") {
    const raw = await req.text();
    if (raw.length > MAX_BODY) return json({ ok: false, error: "Too much at once." }, 413);
    let body: { answers?: Record<string, unknown> };
    try { body = JSON.parse(raw); } catch { return json({ ok: false, error: "Bad request" }, 400); }
    const entries = Object.entries(body.answers ?? {});
    if (!entries.length) return json({ ok: true, saved: 0 });
    if (entries.length > MAX_FIELDS) return json({ ok: false, error: "Too many fields." }, 413);
    const now = new Date().toISOString();
    const rows = [];
    for (const [id, v] of entries) {
      const type = FIELDS[id];
      if (!type) return json({ ok: false, error: `Unknown field ${id.slice(0, 60)}` }, 400);
      let value = typeof v === "string" ? v : v === true ? "1" : "";
      if (type === "checkbox") value = value === "1" ? "1" : "";
      if (value.length > MAX_VAL) return json({ ok: false, error: "An answer is too long." }, 413);
      rows.push({ owner_key: owner, entitlement_id: ent?.id ?? null, preorder_id: order.id, field_id: id, value, updated_at: now });
    }
    const { error } = await db.from("guide_answers").upsert(rows, { onConflict: "owner_key,field_id" });
    if (error) { console.error("save failed", error.message); return json({ ok: false, error: "Could not save. Your answers are still on this device." }, 500); }
    return json({ ok: true, saved: rows.length, at: now });
  }

  const { data: ans } = await db.from("guide_answers").select("field_id, value, updated_at").eq("owner_key", owner).limit(500);
  const answers: Record<string, string> = {}; let last = "";
  for (const a of ans ?? []) { answers[a.field_id] = a.value; if (a.updated_at > last) last = a.updated_at; }
  const { data: signed } = await db.storage.from("guides").createSignedUrl("companion-guide.pdf", 600, { download: "Never-Fight-Companion-Guide.pdf" });
  return json({ ok: true, name: (order.name ?? "").split(" ")[0], guide: GUIDE, answers, answers_updated_at: last || null, pdf_url: signed?.signedUrl ?? null });
});
