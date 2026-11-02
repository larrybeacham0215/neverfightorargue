// book-checkout: Never Fight or Argue Again, signed copy shipped to the buyer.
// GET  /functions/v1/book-checkout?qty=2  -> 303 redirect to Stripe Checkout (works as a plain link / button)
// POST /functions/v1/book-checkout {quantity} -> {url}
// Collects: US shipping address, phone, quantity (1-20), name to sign to, gift note, email opt-in.
// The paid session is handled by stripe-webhook -> book-order-webhook (metadata.kind = book_order).
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://neverfightorargue.com";
const UNIT = 2000; // $20 per signed copy (same as the launch price)
// Shipping: $8 flat per order (Larry, Nov 2, 2026).

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "content-type" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let qty = 1;
  const u = new URL(req.url);
  if (req.method === "POST") { try { const b = await req.json(); qty = parseInt(String(b.quantity ?? "1"), 10) || 1; } catch { /* default 1 */ } }
  else qty = parseInt(u.searchParams.get("qty") ?? "1", 10) || 1;
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
    "custom_fields[1][label][custom]": "Is it a gift? Add a short note (optional)",
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
  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${STRIPE_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(p),
  });
  const s = await r.json();
  if (!r.ok || !s.url) {
    console.error("book-checkout failed", s?.error?.message);
    return new Response(JSON.stringify({ error: "Checkout could not start. Please try again." }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
  }
  if (req.method === "POST") return new Response(JSON.stringify({ url: s.url }), { headers: { ...cors, "Content-Type": "application/json" } });
  return new Response(null, { status: 303, headers: { ...cors, Location: s.url, "Cache-Control": "no-store" } });
});
