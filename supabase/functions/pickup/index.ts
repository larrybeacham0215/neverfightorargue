// =====================================================================
// pickup — Never Fight or Argue Again  (v2: event sales + partial handouts)
// Pre-order pickup passes, event-night book-table receipts, and the
// express-table check-in list.
//   GET  ?session=cs_…   → the buyer's pass, by Stripe session (thank-you page)
//   GET  ?t=<token>      → the buyer's pass, by pickup token (QR / email link)
//   POST {pin, action:"verify"}                         → check the PIN
//   POST {pin, action:"list"}                           → every paid order (volunteers)
//   POST {pin, action:"lookup", token|id}               → verdict for a scanned QR
//   POST {pin, action:"handout", token|id, qty, staff}  → hand out qty copies (atomic)
//   POST {pin, action:"undo", id|token, qty?, staff}    → undo handouts (logged)
//   POST {pin, action:"mark", id|token, picked}         → legacy: all copies / undo all
// Deploy:  supabase functions deploy pickup --no-verify-jwt
// v3 (repo only, NOT deployed): PIN attempt limit, 5 wrong tries per IP per
// 15 minutes and 30 per hour in total (same pattern as /readers/). Needs
// supabase/sql/2026-11-02-express-pin-limit.sql applied first.
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PIN = Deno.env.get("EXPRESS_PIN") ?? "";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://neverfightorargue.com";
const ALLOWED = [SITE_URL, "https://www.neverfightorargue.com"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cors(origin: string | null) {
  const ok = origin && (ALLOWED.includes(origin) || origin.startsWith("http://localhost"));
  return { "Access-Control-Allow-Origin": ok ? origin! : SITE_URL, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "content-type", "Content-Type": "application/json", "Cache-Control": "no-store" };
}
const ticket = (r: any) => ({ token: r.pickup_token, name: r.name, email: r.email, quantity: r.quantity, inscription: r.inscription, picked_up_at: r.picked_up_at, created_at: r.created_at, channel: r.channel ?? "preorder", redeemed_qty: r.redeemed_qty ?? 0, left: Math.max(0, (r.quantity ?? 0) - (r.redeemed_qty ?? 0)) });

// Constant-time string compare (no early exit on the first wrong digit).
function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}

// Accept a raw token, a pickup URL (…?t=uuid), or "NFOAA:uuid".
function parseToken(v: unknown): string | null {
  const s = String(v ?? "").trim();
  const m = s.match(/[?&]t=([^&#\s]+)/) || s.match(/^NFOAA:(.+)$/);
  const t = decodeURIComponent(m ? m[1] : s);
  return UUID.test(t) ? t.toLowerCase() : null;
}

Deno.serve(async (req) => {
  const headers = cors(req.headers.get("origin"));
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const url = new URL(req.url);

  if (req.method === "GET") {
    const session = url.searchParams.get("session"), t = url.searchParams.get("t");
    let q = db.from("preorders").select("*").eq("status", "paid");
    if (session) q = q.eq("stripe_session", session);
    else if (t && UUID.test(t)) q = q.eq("pickup_token", t);
    else if (t) return json({ pending: true }, 202);
    else return json({ error: "missing" }, 400);
    const { data } = await q.maybeSingle();
    if (!data) return json({ pending: true }, 202);
    return json(ticket(data));
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const ip = req.headers.get("cf-connecting-ip") ?? ((req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown");
  const { data: lock, error: lockErr } = await db.rpc("nfoa_attempt_locked", { p_ip: ip, p_scope: "express" });
  if (lockErr) return json({ error: "Could not check the PIN." }, 503);
  if (lock === true) return json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
  const okPin = !!PIN && safeEqual(String(body.pin ?? "").slice(0, 50), PIN);
  await db.rpc("nfoa_attempt_log", { p_ip: ip, p_scope: "express", p_ok: okPin });
  if (!okPin) { await new Promise((r) => setTimeout(r, 800)); return json({ error: "Wrong PIN." }, 401); }
  const staff = String(body.staff ?? "").slice(0, 60) || "Staff";

  if (body.action === "verify") return json({ ok: true });

  if (body.action === "list") {
    const { data } = await db.from("preorders").select("*").eq("status", "paid").order("name");
    const rows = (data ?? []).map((r) => ({ id: r.id, ...ticket(r) }));
    return json({ rows, copies: rows.reduce((a, r) => a + r.quantity, 0), picked: rows.filter((r) => r.picked_up_at).length });
  }

  // Find the row for a scanned token or a list id (any status, so we can say "payment not finished").
  async function find(): Promise<any | null> {
    if (body.id && UUID.test(String(body.id))) { const { data } = await db.from("preorders").select("*").eq("id", body.id).maybeSingle(); return data; }
    const t = parseToken(body.token);
    if (!t) return null;
    const { data } = await db.from("preorders").select("*").eq("pickup_token", t).maybeSingle();
    return data;
  }
  async function verdict(row: any, extra: Record<string, unknown> = {}) {
    if (!row) return json({ verdict: "INVALID", ...extra });
    if (row.status !== "paid") return json({ verdict: "PENDING", ...extra });
    const { data: log } = await db.from("preorder_redemptions").select("action, qty, staff, created_at").eq("preorder_id", row.id).order("created_at");
    const t = { id: row.id, ...ticket(row) };
    return json({ verdict: t.left > 0 ? "VALID" : "ALREADY_REDEEMED", order: t, log: log ?? [], ...extra });
  }

  if (body.action === "lookup") return verdict(await find());

  if (body.action === "handout" || (body.action === "mark" && body.picked !== false)) {
    const row = await find();
    if (!row || row.status !== "paid") return verdict(row, { ok: false });
    const left = row.quantity - (row.redeemed_qty ?? 0);
    const qty = body.action === "mark" ? left : Math.max(1, parseInt(String(body.qty ?? "1"), 10) || 1);
    if (left <= 0 || qty > left) return verdict(row, { ok: false, error: left <= 0 ? "All copies already handed out." : `Only ${left} left on this receipt.` });
    const { data, error } = await db.rpc("preorder_handout", { p_id: row.id, p_qty: qty, p_staff: staff });
    const upd = Array.isArray(data) ? data[0] : data;
    if (error || !upd) { // someone else got there first: re-read and report
      const { data: fresh } = await db.from("preorders").select("*").eq("id", row.id).maybeSingle();
      return verdict(fresh, { ok: false, error: "This receipt just changed on another phone. Check the numbers below." });
    }
    if (body.action === "mark") return json({ ok: true, id: upd.id, ...ticket(upd) });
    return verdict(upd, { ok: true, handed: qty });
  }

  if (body.action === "undo" || (body.action === "mark" && body.picked === false)) {
    const row = await find();
    if (!row) return verdict(null, { ok: false });
    const { data, error } = await db.rpc("preorder_undo", { p_id: row.id, p_qty: body.action === "undo" ? (parseInt(String(body.qty ?? "0"), 10) || null) : null, p_staff: staff });
    const upd = (Array.isArray(data) ? data[0] : data) ?? row;
    if (error) return json({ ok: false, error: "Could not undo." }, 500);
    if (body.action === "mark") return json({ ok: true, id: upd.id, ...ticket(upd) });
    return verdict(upd, { ok: true, undone: true });
  }

  return json({ error: "Unknown action." }, 400);
});
