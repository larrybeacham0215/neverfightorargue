// HELD VARIANT (not deployed). Ray Round 2: card-save disclosure or opt-in, plus optional_items.
// book-checkout: Never Fight or Argue Again, signed copy shipped to the buyer.
// POST /functions/v1/book-checkout {quantity} -> {url}   (POST only; 405 otherwise. GET links were retired Nov 2, 2026.)
// Round 2: a missing Origin is refused; rate-limit IP from cf-connecting-ip or the last proxy hop; fail-open is logged.
// Security (Ray's review, Nov 2, 2026): CORS limited to the site (+ localhost:8787 preview), 10 sessions per IP per 10 minutes.
// Collects: US shipping address, phone, quantity (1-20), name to sign to, gift note, email opt-in.
// Card is saved for off-session use so /order-thank-you/ add-ons charge in one click (book-upsell).
// The paid session is handled by stripe-webhook -> book-order-webhook (metadata.kind = book_order).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://neverfightorargue.com";
const UNIT = 2000; // $20 per signed copy (same as the launch price)
// Shipping: $8 flat per order (Larry, Nov 2, 2026).

const ALLOWED_ORIGINS = ["https://neverfightorargue.com", "https://www.neverfightorargue.com", "http://localhost:8787"];
function corsFor(req: Request) {
  const o = req.headers.get("origin") ?? "";
  const h: Record<string, string> = { "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type", Vary: "Origin" };
  if (ALLOWED_ORIGINS.includes(o)) h["Access-Control-Allow-Origin"] = o;
  return h;
}
// Round 2: every unsigned call must come from the site (a missing Origin is refused too).
// Only Stripe-signed event calls skip this check.
const originOk = (req: Request) => ALLOWED_ORIGINS.includes(req.headers.get("origin") ?? "");
// Round 2: the client can set the first X-Forwarded-For value, so use cf-connecting-ip, else the LAST (proxy-added) hop.
const clientIp = (req: Request) => {
  const cf = (req.headers.get("cf-connecting-ip") ?? "").trim();
  if (cf) return cf;
  const hops = (req.headers.get("x-forwarded-for") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  return hops[hops.length - 1] || "unknown";
};
async function rateOk(db: any, bucket: string, req: Request, max: number, windowSec: number) {
  const { data, error } = await db.rpc("fn_rate_ok", { p_bucket: bucket, p_ip: clientIp(req), p_max: max, p_window_sec: windowSec });
  if (error) { console.error(`RATE_LIMIT_FAIL_OPEN bucket=${bucket}: ${error.message}`); return true; } // fail open so a DB hiccup never blocks a sale; search logs for RATE_LIMIT_FAIL_OPEN
  return data === true;
}
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const jres = (b: unknown, status: number, cors: Record<string, string>) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });

const CARD_SAVE_MODE = (Deno.env.get("CARD_SAVE_MODE") ?? "disclosed").toLowerCase(); // disclosed | opt_in | off
// Larry's live prices (created Nov 2, 2026). Env secrets override; IDs are not secret.
const GIFT_COPY_PRICE_ID = Deno.env.get("GIFT_COPY_PRICE_ID") || "price_1UXTPSLCCdJWrOprt7wE8MTs";         // $15 Extra Signed Gift Copy
const COMPANION_SET_PRICE_ID = Deno.env.get("COMPANION_SET_PRICE_ID") || "price_1UXTQcLCCdJWrOprsG3rGD4a"; // $9 Printed Companion Set
// Off unless OPTIONAL_ITEMS=on is set (go-live needs Larry's OK).
const OPTIONAL_ITEMS = Deno.env.get("OPTIONAL_ITEMS") === "on" && !!GIFT_COPY_PRICE_ID && !!COMPANION_SET_PRICE_ID;

Deno.serve(async (req) => {
  const cors = corsFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return jres({ error: "Method not allowed" }, 405, { ...cors, Allow: "POST, OPTIONS" });
  if (!originOk(req)) return jres({ error: "Not allowed" }, 403, cors);
  if (!(await rateOk(db, "book-checkout", req, 10, 600))) return jres({ error: "Too many tries. Please wait a few minutes and try again." }, 429, cors);
  let qty = 1;
  let wantsSave = false;
  try {
    const b = await req.json();
    qty = parseInt(String(b.quantity ?? "1"), 10) || 1;
    wantsSave = b.save_card === true;
  } catch { /* default 1 */ }
  qty = Math.max(1, Math.min(20, qty));

  const p: Record<string, string> = {
    mode: "payment",
    success_url: `${SITE_URL}/order-thank-you/?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE_URL}/book/`,
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(UNIT),
    "line_items[0][price_data][product_data][name]": "Never Fight or Argue Again (signed copy)",
    "line_items[0][price_data][product_data][description]": "A signed paperback by Larry and Rolanda Beacham, shipped to you.",
    "line_items[0][price_data][product_data][images][0]": `${SITE_URL}/assets/book-3d.png`,
    "line_items[0][quantity]": String(qty),
    "line_items[0][adjustable_quantity][enabled]": "true",
    "line_items[0][adjustable_quantity][minimum]": "1",
    "line_items[0][adjustable_quantity][maximum]": "20",
    "shipping_address_collection[allowed_countries][0]": "US",
    "phone_number_collection[enabled]": "true",
    "shipping_options[0][shipping_rate_data][type]": "fixed_amount",
    "shipping_options[0][shipping_rate_data][fixed_amount][amount]": "800",
    "shipping_options[0][shipping_rate_data][fixed_amount][currency]": "usd",
    "shipping_options[0][shipping_rate_data][display_name]": "Standard shipping",
    billing_address_collection: "auto",
    customer_creation: "always",
    "custom_fields[0][key]": "inscription",
    "custom_fields[0][label][type]": "custom",
    "custom_fields[0][label][custom]": "Name to sign the book to (optional)",
    "custom_fields[0][type]": "text",
    "custom_fields[0][optional]": "true",
    "custom_fields[0][text][maximum_length]": "100",
    "custom_fields[1][key]": "gift_note",
    "custom_fields[1][label][type]": "custom",
    "custom_fields[1][label][custom]": OPTIONAL_ITEMS
      ? "Gift note, and names to sign any gift copies to (optional)"
      : "Is it a gift? Add a short note (optional)",
    "custom_fields[1][type]": "text",
    "custom_fields[1][optional]": "true",
    "custom_fields[1][text][maximum_length]": "255",
    "custom_fields[2][key]": "updates",
    "custom_fields[2][label][type]": "custom",
    "custom_fields[2][label][custom]": "Email me new resources from Larry and Ro",
    "custom_fields[2][type]": "dropdown",
    "custom_fields[2][optional]": "true",
    "custom_fields[2][dropdown][options][0][label]": "Yes, please",
    "custom_fields[2][dropdown][options][0][value]": "yes",
    "custom_fields[2][dropdown][options][1][label]": "No, thanks",
    "custom_fields[2][dropdown][options][1][value]": "no",
    "custom_text[shipping_address][message]": "Larry and Ro sign every copy by hand, then we ship it to this address.",
    "metadata[project]": "nfoaa",
    "metadata[kind]": "book_order",
    "metadata[source]": "web",
    "payment_intent_data[metadata][kind]": "book_order",
  };
  // Card saving (Ray Round 2, must-fix 1). HELD: Larry is choosing a mode.
  //   "disclosed": always save, and say so above the Pay button. book-upsell detaches it after 30 minutes.
  //   "opt_in":    save only when the book page sent {save_card:true} from a checked box.
  //   "off":       never save; thank-you add-ons always use a short Checkout page.
  const saveCard = CARD_SAVE_MODE === "disclosed" || (CARD_SAVE_MODE === "opt_in" && wantsSave);
  if (saveCard) {
    p["payment_intent_data[setup_future_usage]"] = "off_session";
    p["custom_text[submit][message]"] =
      "We keep your card on file for 30 minutes only, so you can add a gift copy or the companion set on the next page with one click. After that it is removed.";
  }
  // optional_items variant (HELD): extra items offered right on the Checkout page. Needs real Price IDs.
  if (OPTIONAL_ITEMS) {
    p["optional_items[0][price]"] = GIFT_COPY_PRICE_ID;
    p["optional_items[0][quantity]"] = "1";
    p["optional_items[0][adjustable_quantity][enabled]"] = "true";
    p["optional_items[0][adjustable_quantity][minimum]"] = "0";
    p["optional_items[0][adjustable_quantity][maximum]"] = "3";
    p["optional_items[1][price]"] = COMPANION_SET_PRICE_ID;
    p["optional_items[1][quantity]"] = "1";
  }
  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${STRIPE_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(p),
  });
  const s = await r.json();
  if (!r.ok || !s.url) {
    console.error("book-checkout failed", s?.error?.message);
    return jres({ error: "Checkout could not start. Please try again." }, 502, cors);
  }
  return jres({ url: s.url }, 200, cors);
});
