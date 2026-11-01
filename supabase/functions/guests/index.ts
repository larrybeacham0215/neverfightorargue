// =====================================================================
// guests — Never Fight or Argue Again
// Public list of launch registrations for the /guests/ page.
// Deploy:  supabase functions deploy guests --no-verify-jwt
// =====================================================================
// Public list (Larry, Oct 31 2026): no password.
// Hardened per Ray (Nov 1 2026): GET only, cached 5 min, and each row carries
// ONLY name (first name + last initial) and seats. v6 (Ray, Nov 1): per-row
// sponsor interest and pre-order counts removed (financial, identifying).
// Top-level totals only: parties, seats, preorder_copies. No emails, phones,
// notes, timestamps, IDs or addresses. Cancelled rows never leave the function.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://neverfightorargue.com";
const ALLOWED = [SITE_URL, "https://www.neverfightorargue.com"];

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const ok = origin && (ALLOWED.includes(origin) || origin.startsWith("http://localhost"));
  const base = { "Access-Control-Allow-Origin": ok ? origin! : SITE_URL, "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "content-type", "Vary": "Origin", "X-Robots-Tag": "noindex, nofollow" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: base });
  if (req.method !== "GET") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...base, "Allow": "GET, OPTIONS", "Content-Type": "application/json", "Cache-Control": "no-store" } });
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: rsvps } = await db.from("launch_rsvps").select("first_name,last_name,guests").is("cancelled_at", null).order("created_at", { ascending: false });
  const { data: pre } = await db.from("preorders").select("quantity").eq("status", "paid");
  const rows = (rsvps ?? []).map((r) => {
    const first = (r.first_name ?? "").trim(), last = (r.last_name ?? "").trim();
    return {
      name: [first, last ? last.charAt(0).toUpperCase() + "." : ""].filter(Boolean).join(" "),
      seats: r.guests ?? 0,
    };
  });
  return new Response(JSON.stringify({
    rows, parties: rows.length, seats: rows.reduce((a, r) => a + r.seats, 0),
    preorder_copies: (pre ?? []).reduce((a, p) => a + (p.quantity ?? 0), 0),
  }), { headers: { ...base, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" } });
});
