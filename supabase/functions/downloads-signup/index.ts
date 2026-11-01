// downloads-signup: opt-in on neverfightorargue.com/downloads (QR stickers).
// Adds the person to the EXISTING subscribers list (the one /readers/ shows).
// Dedupe: email is lowercased and subscribers.email is unique, so the same
// person twice = one row. Existing people just get the "downloads-qr" tag.
// Sends NO email. New rows have chapters_sent_at = null, so the free-chapter
// drip (which needs chapters_sent_at) does not pick them up.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED = ["https://neverfightorargue.com", "https://www.neverfightorargue.com"];
function cors(origin: string | null) {
  const ok = origin && (ALLOWED.includes(origin) || origin.endsWith(".github.io") || origin.startsWith("http://localhost"));
  return {
    "Access-Control-Allow-Origin": ok ? origin! : ALLOWED[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clean = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
async function hashIp(ip: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip + "|nfoaa"));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}
Deno.serve(async (req) => {
  const headers = cors(req.headers.get("origin"));
  const out = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers });
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return out({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json();
    if (clean(body["company-website"])) return out({ ok: true }); // honeypot
    const email = clean(body.email).toLowerCase();
    const first_name = clean(body.first_name, 100);
    if (!EMAIL_RE.test(email)) return out({ error: "Please enter a valid email address." }, 400);
    if (!first_name) return out({ error: "Please enter your name." }, 400);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "";
    const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data, error } = await db.rpc("nfoa_downloads_signup", {
      p_email: email, p_first_name: first_name, p_ip_hash: ip ? await hashIp(ip) : null, p_tag: "downloads-qr",
    });
    if (error) { console.error(error); return out({ error: "Something went wrong. Please try again." }, 500); }
    return out({ ok: true, new: !!data?.[0]?.inserted });
  } catch (e) {
    console.error(e);
    return out({ error: "Something went wrong. Please try again." }, 500);
  }
});
