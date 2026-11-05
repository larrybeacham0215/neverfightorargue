// =====================================================================
// guide - Companion Guide for Event Bundle buyers (interactive)
//   GET  ?t=<pickup_token|claim_token> -> { ok, name, guide, answers, pdf_url }
//   POST ?t=<pickup_token|claim_token> {answers:{field_id: value}} -> { ok, saved }
//   POST ?t=<pickup_token|claim_token> {set_password}  -> first visit: creates the Supabase
//        Auth user for the order email (server side, verified by token + paid
//        order + active entitlement), links entitlements.user_id and moves the
//        token-keyed answers to 'usr:<user id>'.
//   POST ?t=... {welcome_video_seen:true} -> { ok, welcome_video_seen_at } (public.guide_state)
//   GET also returns welcome_video_seen_at (null if unseen or table missing).
//   GET/POST with "Authorization: Bearer <user access token>" and no ?t
//        -> same guide for a signed-in member (/members/).
// Access = a paid, non-refunded event_bundle order for this pickup token, OR an
// active companion_guide entitlement for that order's email, OR an active
// entitlement whose claim_token matches (past-buyer gift; no preorder).
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
  return { "Access-Control-Allow-Origin": ok ? origin! : SITE_URL, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "content-type, authorization", "Content-Type": "application/json", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };
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
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  let owner = "", entId: string | null = null, orderId: string | null = null, userId: string | null = null;
  let name = "", email = "", hasAccount = false, canClaim = false;
  if (t) {
    if (!UUID.test(t)) return json({ ok: false, error: "This guide link is not valid." }, 403);
    if (req.method === "POST" && limited(t)) return json({ ok: false, error: "Saving too fast. Try again in a minute." }, 429);
    // Pickup token (event bundle / preorder) OR claim_token (past-buyer gift, no preorder).
    const { data: order } = await db.from("preorders").select("id, email, name, status, product").eq("pickup_token", t).maybeSingle();
    if (order) {
      let ent: { id: string; user_id: string | null } | null = null;
      if (order.email) {
        const r = await db.from("entitlements").select("id, user_id").eq("email_lower", order.email.toLowerCase()).eq("product", PRODUCT).is("revoked_at", null).maybeSingle();
        ent = r.data;
      }
      const allowed = order.status !== "refunded" && ((order.product === "event_bundle" && order.status === "paid") || !!ent);
      if (!allowed) return json({ ok: false, error: "This order does not include the Companion Guide, or it was refunded." }, 403);
      orderId = order.id; entId = ent?.id ?? null; userId = ent?.user_id ?? null;
      name = (order.name ?? "").split(" ")[0]; email = (order.email ?? "").toLowerCase();
      hasAccount = !!userId; canClaim = !!ent && !userId && !!email;
      owner = userId ? `usr:${userId}` : ent ? `ent:${ent.id}` : `ord:${order.id}`;
    } else {
      const { data: ent } = await db.from("entitlements").select("id, email_lower, user_id, revoked_at").eq("claim_token", t).eq("product", PRODUCT).is("revoked_at", null).maybeSingle();
      if (!ent) return json({ ok: false, error: "This guide link is not valid." }, 403);
      entId = ent.id; userId = ent.user_id ?? null; orderId = null;
      email = (ent.email_lower ?? "").toLowerCase();
      name = "";
      const { data: st } = await db.from("guide_sequence_state").select("buyer_name").eq("entitlement_id", ent.id).maybeSingle();
      if (st?.buyer_name) name = String(st.buyer_name).split(" ")[0];
      hasAccount = !!userId; canClaim = !userId && !!email;
      owner = userId ? `usr:${userId}` : `ent:${ent.id}`;
    }
  } else if (bearer) {
    const { data: u } = await db.auth.getUser(bearer);
    if (!u?.user) return json({ ok: false, signed_out: true, error: "Please sign in again." }, 401);
    if (req.method === "POST" && limited(u.user.id)) return json({ ok: false, error: "Saving too fast. Try again in a minute." }, 429);
    email = (u.user.email ?? "").toLowerCase(); userId = u.user.id;
    const { data: ents } = await db.from("entitlements").select("id, user_id, preorder_id").eq("product", PRODUCT).is("revoked_at", null).or(`user_id.eq.${userId},email_lower.eq."${email}"`).limit(1);
    const ent = ents?.[0];
    if (!ent) return json({ ok: false, error: "Your account does not include the Companion Guide, or it was refunded." }, 403);
    if (!ent.user_id && email) await db.from("entitlements").update({ user_id: userId }).eq("email_lower", email).is("user_id", null);
    entId = ent.id; orderId = ent.preorder_id; hasAccount = true; owner = `usr:${userId}`;
    name = String(u.user.user_metadata?.name ?? "").split(" ")[0];
  } else return json({ ok: false, error: "This guide link is not valid." }, 403);

  if (req.method === "POST") {
    const raw = await req.text();
    if (raw.length > MAX_BODY) return json({ ok: false, error: "Too much at once." }, 413);
    let body: { answers?: Record<string, unknown>; set_password?: unknown; welcome_video_seen?: unknown };
    try { body = JSON.parse(raw); } catch { return json({ ok: false, error: "Bad request" }, 400); }

    if (body.set_password !== undefined) {
      if (!t) return json({ ok: false, error: "Bad request" }, 400);
      if (hasAccount) return json({ ok: false, has_account: true, email, error: "You already created a password. Sign in at the members page." }, 409);
      if (!canClaim) return json({ ok: false, error: "We could not set up an account for this order. Email hello@neverfightorargue.com." }, 403);
      const pw = String(body.set_password);
      if (pw.length < 8 || pw.length > 72) return json({ ok: false, error: "Use at least 8 characters." }, 400);
      const { data: cu, error: ce } = await db.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { name } });
      if (ce || !cu?.user) {
        const exists = /already|registered|exists/i.test(ce?.message ?? "");
        return json({ ok: false, has_account: exists, email, error: exists ? "An account already exists for this email. Sign in at the members page." : "Could not create your account. Please try again." }, exists ? 409 : 500);
      }
      const uid = cu.user.id;
      await db.from("entitlements").update({ user_id: uid }).eq("email_lower", email).is("user_id", null);
      // Move token-keyed answers (entitlement or order key) to the account; newest value wins.
      const keys = [entId ? `ent:${entId}` : "", `ord:${orderId}`].filter(Boolean);
      const { data: old } = await db.from("guide_answers").select("field_id, value, updated_at, entitlement_id, preorder_id").in("owner_key", keys).limit(1000);
      const best: Record<string, any> = {};
      for (const a of old ?? []) if (!best[a.field_id] || a.updated_at > best[a.field_id].updated_at) best[a.field_id] = a;
      const rows = Object.values(best).map((a) => ({ ...a, owner_key: `usr:${uid}`, user_id: uid }));
      if (rows.length) {
        const { error } = await db.from("guide_answers").upsert(rows, { onConflict: "owner_key,field_id" });
        if (!error) await db.from("guide_answers").delete().in("owner_key", keys);
        else console.error("move failed", error.message);
      }
      return json({ ok: true, created: true, email, moved: rows.length });
    }

    if (body.welcome_video_seen === true) {
      const now = new Date().toISOString();
      const { error } = await db.from("guide_state").upsert({ owner_key: owner, user_id: userId, entitlement_id: entId, preorder_id: orderId, welcome_video_seen_at: now, updated_at: now }, { onConflict: "owner_key" });
      if (error) { console.error("state failed", error.message); return json({ ok: false, error: "Could not save." }, 500); }
      return json({ ok: true, welcome_video_seen_at: now });
    }

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
      rows.push({ owner_key: owner, user_id: userId, entitlement_id: entId, preorder_id: orderId, field_id: id, value, updated_at: now });
    }
    const { error } = await db.from("guide_answers").upsert(rows, { onConflict: "owner_key,field_id" });
    if (error) { console.error("save failed", error.message); return json({ ok: false, error: "Could not save. Your answers are still on this device." }, 500); }
    return json({ ok: true, saved: rows.length, at: now });
  }

  const { data: ans } = await db.from("guide_answers").select("field_id, value, updated_at").eq("owner_key", owner).limit(500);
  const answers: Record<string, string> = {}; let last = "";
  for (const a of ans ?? []) { answers[a.field_id] = a.value; if (a.updated_at > last) last = a.updated_at; }
  // Seen on any key this buyer has used (account, entitlement or order), so it survives the password claim.
  let seenAt: string | null = null;
  try {
    const keys = [owner, entId ? `ent:${entId}` : "", orderId ? `ord:${orderId}` : ""].filter(Boolean);
    const { data: gs, error: ge } = await db.from("guide_state").select("welcome_video_seen_at").in("owner_key", keys).not("welcome_video_seen_at", "is", null).limit(1);
    if (!ge) seenAt = gs?.[0]?.welcome_video_seen_at ?? null;
  } catch { /* table missing: treat as unseen */ }
  const { data: signed } = await db.storage.from("guides").createSignedUrl("companion-guide.pdf", 600, { download: "Never-Fight-Companion-Guide.pdf" });
  return json({ ok: true, name, email, has_account: hasAccount, can_set_password: canClaim, guide: GUIDE, answers, answers_updated_at: last || null, welcome_video_seen_at: seenAt, pdf_url: signed?.signedUrl ?? null });
});
