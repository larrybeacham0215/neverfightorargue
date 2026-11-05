// =====================================================================
// event-checkout - event weekend Nov 6-7, 2026
//   GET  -> inventory
//   POST { bundles, singles, name, email } OR legacy { item, quantity }
//        -> { clientSecret }  (or validate_only plan, no Stripe)
// books_pickup = 2*bundles + singles; guide only if bundles >= 1
// Flag EVENT_SALES_ON=1 required for real sessions (default off).
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { BUNDLE_CENTS, planOrder, clientMoneyTamperFields, inventory } from "./order-math.ts";

const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://neverfightorargue.com";
const ON = Deno.env.get("EVENT_SALES_ON") === "1";
const ALLOWED = [SITE_URL, "https://www.neverfightorargue.com"];
const EVENT_START = "2026-11-06T00:00:00-05:00";
const EVENT_PRICE = "price_1UIqyGLCCdJWrOprR9a0889s";
const BUNDLE_PRICE = Deno.env.get("EVENT_BUNDLE_PRICE_ID") || "price_1UYSscLCCdJWrOprCWbRUsed";
const BUNDLE_NAME = "Event Bundle: 2 Signed Books + Companion Guide";
const SINGLE_NAME = "Signed book — Never Fight or Argue Again";
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
  const res = await fetch("https://api.stripe.com/v1/" + path, {
    method: "POST",
    headers: { Authorization: `Bearer ${STRIPE_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  return { ok: res.ok, data: await res.json() };
}

Deno.serve(async (req) => {
  const headers = cors(req.headers.get("origin"));
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: c } = await db.rpc("event_books_sold", { p_since: EVENT_START });
  const row = Array.isArray(c) ? c[0] : c;
  const booksSold = row?.books ?? 0, bundlesSold = row?.bundles ?? 0;
  const stock = inventory(booksSold, bundlesSold);
  const status = { open: ON, books: stock.books, bundles: stock.bundles, books_left: stock.books_left, bundles_left: stock.bundles_left, sold_out_single: stock.sold_out_single, sold_out_bundle: stock.sold_out_bundle };

  if (req.method === "GET") return json(status);
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const test = !!TEST_HASH && typeof body.test_token === "string" && (await sha256(body.test_token)) === TEST_HASH;
  const validateOnly = body.validate_only === true;
  if (!ON && !test && !validateOnly) return json({ error: "Event sales are not open yet." }, 503);

  const tamper = clientMoneyTamperFields(body);
  const plan = planOrder({
    item: body.item,
    quantity: body.quantity,
    bundles: body.bundles,
    singles: body.singles,
    booksSold,
    bundlesSold,
    email: String(body.email ?? ""),
    name: String(body.name ?? ""),
    test,
  });
  if (!plan.ok) {
    const code = plan.sold_out ? 409 : 400;
    return json({ error: plan.error, sold_out: !!plan.sold_out, ...status, ignored_client_money_fields: tamper }, code);
  }

  if (validateOnly) {
    return json({
      ok: true,
      validate_only: true,
      bundle_qty: plan.bundle_qty,
      single_qty: plan.single_qty,
      books_pickup: plan.books_pickup,
      amount_cents: plan.amount_cents,
      grant_guide: plan.grant_guide,
      kind: plan.kind,
      metadata: plan.metadata,
      ignored_client_money_fields: tamper,
      ...status,
    });
  }

  const p: Record<string, string> = {
    mode: "payment",
    ui_mode: test ? "hosted" : "embedded",
    submit_type: "pay",
    expires_at: String(Math.floor(Date.now() / 1000) + (test ? 23 * 3600 : 30 * 60)),
    "metadata[project]": "nfoaa",
    "metadata[channel]": "event",
    "custom_fields[0][key]": "full_name",
    "custom_fields[0][label][type]": "custom",
    "custom_fields[0][label][custom]": "Full name",
    "custom_fields[0][type]": "text",
    "custom_fields[0][optional]": "false",
    "custom_fields[1][key]": "inscription",
    "custom_fields[1][label][type]": "custom",
    "custom_fields[1][label][custom]": "Sign it to (names, optional)",
    "custom_fields[1][type]": "text",
    "custom_fields[1][optional]": "true",
  };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(plan.email) && plan.email.length < 200) p["customer_email"] = plan.email;
  if (plan.name) p["metadata[buyer_name]"] = plan.name;
  for (const [k, v] of Object.entries(plan.metadata)) {
    p[`metadata[${k}]`] = v;
    if (plan.grant_guide) p[`payment_intent_data[metadata][${k}]`] = v;
  }

  // Line items: bundles and/or singles (server prices only)
  let li = 0;
  if (plan.bundle_qty > 0) {
    if (test) {
      p[`line_items[${li}][price_data][currency]`] = "usd";
      p[`line_items[${li}][price_data][unit_amount]`] = "100";
      p[`line_items[${li}][price_data][product_data][name]`] = "TEST " + BUNDLE_NAME + " ($1 test, refund after)";
      p[`line_items[${li}][quantity]`] = "1";
    } else if (BUNDLE_PRICE) {
      p[`line_items[${li}][price]`] = BUNDLE_PRICE;
      p[`line_items[${li}][quantity]`] = String(plan.bundle_qty);
    } else {
      p[`line_items[${li}][price_data][currency]`] = "usd";
      p[`line_items[${li}][price_data][unit_amount]`] = String(BUNDLE_CENTS);
      p[`line_items[${li}][price_data][product_data][name]`] = BUNDLE_NAME;
      p[`line_items[${li}][quantity]`] = String(plan.bundle_qty);
    }
    li++;
  }
  if (plan.single_qty > 0 && !test) {
    p[`line_items[${li}][price]`] = EVENT_PRICE;
    p[`line_items[${li}][quantity]`] = String(plan.single_qty);
    li++;
  } else if (plan.single_qty > 0 && test && plan.bundle_qty < 1) {
    p[`line_items[0][price_data][currency]`] = "usd";
    p[`line_items[0][price_data][unit_amount]`] = "100";
    p[`line_items[0][price_data][product_data][name]`] = "TEST " + SINGLE_NAME;
    p[`line_items[0][quantity]`] = "1";
  }

  const parts: string[] = [];
  if (plan.bundle_qty) parts.push(`${plan.bundle_qty} bundle${plan.bundle_qty === 1 ? "" : "s"}`);
  if (plan.single_qty) parts.push(`${plan.single_qty} single${plan.single_qty === 1 ? "" : "s"}`);
  p["custom_text[submit][message]"] =
    `**Pick up at the book table.** ${parts.join(" + ")} = ${plan.books_pickup} signed book${plan.books_pickup === 1 ? "" : "s"}` +
    (plan.grant_guide ? " plus the Companion Guide." : ".") +
    ` Total $${(plan.amount_cents / 100).toFixed(0)}.`;

  if (plan.grant_guide) {
    p[test ? "success_url" : "return_url"] = `${SITE_URL}/event-thank-you/?session_id={CHECKOUT_SESSION_ID}`;
  } else {
    p["return_url"] = `${SITE_URL}/preorder-thank-you/?src=event&session_id={CHECKOUT_SESSION_ID}`;
  }

  const r = await stripe("checkout/sessions", p);
  if (!r.ok) { console.error("stripe error", r.data?.error?.message); return json({ error: "Could not start checkout. Please try again." }, 502); }
  return json(test
    ? { url: r.data.url, id: r.data.id, books_pickup: plan.books_pickup, amount_cents: plan.amount_cents, bundle_qty: plan.bundle_qty, single_qty: plan.single_qty, grant_guide: plan.grant_guide }
    : { clientSecret: r.data.client_secret, books_pickup: plan.books_pickup, amount_cents: plan.amount_cents, bundle_qty: plan.bundle_qty, single_qty: plan.single_qty, grant_guide: plan.grant_guide });
});
