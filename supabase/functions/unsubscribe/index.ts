// =====================================================================
// Never Fight or Argue Again — unsubscribe function
//
// GitHub Pages cannot do server-side redirects, so this returns JSON
// and the page at /unsubscribe/ on your own site displays the result.
// The reader never sees a supabase.co address.
//
// Deploy:  Edge Functions > Deploy a new function > name it "unsubscribe"
//          and turn OFF "Verify JWT"
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_ORIGINS = [
  "https://neverfightorargue.com",
  "https://www.neverfightorargue.com",
];

function corsHeaders(origin: string | null) {
  const ok =
    origin &&
    (ALLOWED_ORIGINS.includes(origin) ||
      origin.endsWith(".github.io") ||
      origin.startsWith("http://localhost"));
  return {
    "Access-Control-Allow-Origin": ok ? origin! : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") return new Response("ok", { headers });

  // Accept the token from the query string or a POST body, whichever is easier.
  let token = new URL(req.url).searchParams.get("t") ?? "";
  if (!token && req.method === "POST") {
    try {
      const body = await req.json();
      token = typeof body.t === "string" ? body.t : "";
    } catch { /* ignore */ }
  }

  if (!token) {
    return new Response(JSON.stringify({ ok: false, reason: "missing" }), { status: 400, headers });
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data, error } = await db
    .from("subscribers")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("unsubscribe_token", token)
    .select("email")
    .maybeSingle();

  if (error || !data) {
    return new Response(JSON.stringify({ ok: false, reason: "not-found" }), { status: 404, headers });
  }

  return new Response(JSON.stringify({ ok: true, email: data.email }), { headers });
});
