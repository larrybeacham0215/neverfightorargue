// =====================================================================
// guests — Never Fight or Argue Again
// Password-protected list of launch registrations for the /guests/ page.
// Names, seats, dates and pre-order status only — no emails or phones.
// Deploy:  supabase functions deploy guests --no-verify-jwt
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://neverfightorargue.com";
const ALLOWED = [SITE_URL, "https://www.neverfightorargue.com"];

// Every request must carry the list password (POST {"password": "..."}).
// It's checked in the database against a bcrypt hash (see supabase/admin-lists.sql),
// with per-IP and global attempt limits. Nothing secret lives in this file.
async function gate(db: any, req: Request, scope: string, headers: Record<string, string>): Promise<Response | null> {
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Password required." }), { status: 401, headers });
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const password = String(body?.password ?? "").slice(0, 200);
  if (!password) return new Response(JSON.stringify({ error: "Password required." }), { status: 401, headers });
  const ip = req.headers.get("cf-connecting-ip") ?? (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ?? "unknown";
  const { data, error } = await db.rpc("nfoa_admin_check", { p_password: password, p_ip: ip || "unknown", p_scope: scope });
  if (error) return new Response(JSON.stringify({ error: "Could not check the password." }), { status: 503, headers });
  if (data === "ok") return null;
  if (data === "locked") return new Response(JSON.stringify({ error: "Too many attempts. Try again in 15 minutes." }), { status: 429, headers });
  if (data === "wrong") {
    await new Promise((r) => setTimeout(r, 800));
    return new Response(JSON.stringify({ error: "Wrong password." }), { status: 401, headers });
  }
  return new Response(JSON.stringify({ error: "Could not check the password." }), { status: 503, headers });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const ok = origin && (ALLOWED.includes(origin) || origin.startsWith("http://localhost"));
  const headers = { "Access-Control-Allow-Origin": ok ? origin! : SITE_URL, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type", "Content-Type": "application/json", "Cache-Control": "no-store" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const denied = await gate(db, req, "guests", headers);
  if (denied) return denied;
  const { data: rsvps } = await db.from("launch_rsvps").select("first_name,last_name,email,guests,sponsor_interest,notes,created_at,cancelled_at").order("created_at", { ascending: false });
  const { data: pre } = await db.from("preorders").select("email,quantity").eq("status", "paid");
  const copies: Record<string, number> = {};
  for (const p of pre ?? []) copies[p.email.toLowerCase()] = (copies[p.email.toLowerCase()] ?? 0) + p.quantity;
  const rows = (rsvps ?? []).map((r) => ({
    name: `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim(),
    seats: r.guests, sponsor: !!r.sponsor_interest, registered_at: r.created_at, cancelled: !!r.cancelled_at, note: (r.notes ?? "").trim(),
    preordered: copies[(r.email ?? "").toLowerCase()] ?? 0,
  }));
  const active = rows.filter((r) => !r.cancelled);
  return new Response(JSON.stringify({
    rows, parties: active.length, seats: active.reduce((a, r) => a + r.seats, 0), cancelled: rows.length - active.length,
    preorders: (pre ?? []).length, preorder_copies: (pre ?? []).reduce((a, p) => a + p.quantity, 0),
    updated: new Date().toISOString(),
  }), { headers });
});
