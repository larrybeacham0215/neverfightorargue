// =====================================================================
// event-checkout - Never Fight or Argue Again, event weekend Nov 6-7, 2026
// Side-by-side with the live `checkout` function (which is NOT changed).
//   GET                      -> { open, books, bundles, books_left, bundles_left, sold_out_single, sold_out_bundle }
//   POST {item:"single"|"bundle", quantity, name, email} -> { clientSecret }
// Flag: EVENT_SALES_ON must be "1" or POST returns 503 (default off).
// Cap: 100 books total (single = 1 book, bundle = 2 books), max 50 bundles.
// Singles keep metadata kind=preorder, channel=event, so the live
// stripe-webhook records them exactly as on launch night.
// Bundles use metadata kind=event_bundle and are handled by event-bundle-webhook.
// Deploy: supabase functions deploy event-checkout --no-verify-jwt
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://neverfightorargue.com";
const ON = Deno.env.get("EVENT_SALES_ON") === "1";
const ALLOWED = [SITE_URL, "https://www.neverfightorargue.com"];
const EVENT_START = "2026-11-06T00:00:00-05:00";
const BOOK_CAP = 100, BUNDLE_CAP = 50;
const EVENT_PRICE = "price_1UIqyGLCCdJWrOprR9a0889s"; // $20, same as launch night
// Set after Larry creates the Stripe product. Until then, inline price_data at $50.
const BUNDLE_PRICE = Deno.env.get("EVENT_BUNDLE_PRICE_ID") ?? "";
const BUNDLE_NAME = "Event Bundle: 2 Signed Books + Companion Guide";
// Token-gated $1 test path: sha256 hex of a one-time token. Empty = disabled.
const TEST_HASH = "";

function cors(origin: string | null) {
  const ok = origin && (ALLOWED.includes(origin) || origin.startsWith("http://localhost"));
  return { "Access-Control-Allow-Origin": ok ? origin! : SITE_URL, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "content-type", "Content-Type": "application/json", "Cache-Control": "no-store" };
}
async function sha256(s: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function stripe(path: string, params: Record<string, string>) {
  const res = await fetch("https://api.stripe.com/v1/" + path, { method: "POST", headers: { Authorization: `Bearer ${STRIPE_KEY}`, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params).toString() });
  return { ok: res.ok, data: await res.json() };
}

Deno.serve(async (req) => {
  const headers = cors(req.headers.get("origin"));
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: c } = await db.rpc("event_books_sold", { p_since: EVENT_START });
  const row = Array.isArray(c) ? c[0] : c;
  const books = row?.books ?? 0, bundles = row?.bundles ?? 0;
  const booksLeft = Math.max(0, BOOK_CAP - books), bundlesLeft = Math.max(0, Math.min(BUNDLE_CAP - bundles, Math.floor(booksLeft / 2)));
  const status = { open: ON, books, bundles, books_left: booksLeft, bundles_left: bundlesLeft, sold_out_single: booksLeft < 1, sold_out_bundle: bundlesLeft < 1 };
  if (req.method === "GET") return json(status);
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const test = !!TEST_HASH && typeof body.test_token === "string" && (await sha256(body.test_token)) === TEST_HASH;
  if (!ON && !test) return json({ error: "Event sales are not open yet." }, 503);

  const item = body.item === "bundle" ? "bundle" : "single";
  const max = item === "bundle" ? Math.min(5, bundlesLeft) : Math.min(10, booksLeft);
  if (max < 1 && !test) return json({ error: "Sold out.", sold_out: true, ...status }, 409);
  const q = Math.max(1, Math.min(test ? 1 : max, parseInt(String(body.quantity ?? "1"), 10) || 1));
  const email = String(body.email ?? "").trim();
  const nm = String(body.name ?? "").trim().slice(0, 100);

  const p: Record<string, string> = {
    "mode": "payment",
    "ui_mode": test ? "hosted" : "embedded",
    "submit_type": "pay",
    "expires_at": String(Math.floor(Date.now() / 1000) + 30 * 60),
    "metadata[project]": "nfoaa",
    "metadata[channel]": "event",
    "line_items[0][quantity]": String(q),
    "custom_fields[0][key]": "inscription",
    "custom_fields[0][label][type]": "custom",
    "custom_fields[0][label][custom]": "Sign it to (names, optional)",
    "custom_fields[0][type]": "text",
    "custom_fields[0][optional]": "true",
  };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length < 200) p["customer_email"] = email;
  if (nm) p["metadata[buyer_name]"] = nm;

  if (item === "single") {
    p["line_items[0][price]"] = EVENT_PRICE;
    p["metadata[kind]"] = "preorder";
    p["metadata[quantity]"] = String(q);
    p["metadata[unit]"] = "2000";
    p["custom_text[submit][message]"] = `**Pick up at the book table now.** ${q} signed cop${q === 1 ? "y" : "ies"} at $20 per book, $${q * 20} total. After you pay, show your receipt QR at the book table.`;
    p["return_url"] = `${SITE_URL}/preorder-thank-you/?src=event&session_id={CHECKOUT_SESSION_ID}`;
  } else {
    if (test) {
      p["line_items[0][price_data][currency]"] = "usd";
      p["line_items[0][price_data][unit_amount]"] = "100";
      p["line_items[0][price_data][product_data][name]"] = "TEST " + BUNDLE_NAME + " ($1 test, refund after)";
    } else if (BUNDLE_PRICE) {
      p["line_items[0][price]"] = BUNDLE_PRICE;
    } else {
      p["line_items[0][price_data][currency]"] = "usd";
      p["line_items[0][price_data][unit_amount]"] = "5000";
      p["line_items[0][price_data][product_data][name]"] = BUNDLE_NAME;
    }
    for (const [k, v] of Object.entries({ kind: "event_bundle", bundle: "1", bundles: String(q), books: String(q * 2), channel: "event", ...(test ? { test_run: "event_bundle_test" } : {}) })) {
      p[`metadata[${k}]`] = v;
      p[`payment_intent_data[metadata][${k}]`] = v; // so charge.refunded carries it too
    }
    p["custom_text[submit][message]"] = `**Pick up at the book table.** ${q} bundle${q === 1 ? "" : "s"}: ${q * 2} signed books plus the Companion Guide. Your pickup QR and guide link appear right after you pay.`;
    p[test ? "success_url" : "return_url"] = `${SITE_URL}/event-thank-you/?session_id={CHECKOUT_SESSION_ID}`;
  }

  const r = await stripe("checkout/sessions", p);
  if (!r.ok) { console.error("stripe error", r.data?.error?.message); return json({ error: "Could not start checkout. Please try again." }, 502); }
  return json(test ? { url: r.data.url, id: r.data.id } : { clientSecret: r.data.client_secret });
});
