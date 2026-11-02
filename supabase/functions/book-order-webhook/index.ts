// book-order-webhook: Never Fight or Argue Again, shipped signed-copy orders.
// Stripe's existing endpoint posts checkout.session.completed to stripe-webhook, which forwards
// sessions with metadata.kind = "book_order" here with the original body and Stripe-Signature header.
// This function verifies the signature again (STRIPE_WEBHOOK_SECRET), then:
//   1) upserts the buyer (one row per lower(email)) in public.buyers
//   2) inserts the order in public.book_orders (status new)
//   3) emails Larry an order notice (NOTIFY_EMAIL, same address as the pre-order notices)
//   4) emails the buyer a short confirmation (same Brevo pattern as the pre-order confirmation)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "hello@neverfightorargue.com";
const FROM_NAME = Deno.env.get("FROM_NAME") ?? "Larry & Ro";
const NOTIFY_EMAIL = Deno.env.get("NOTIFY_EMAIL") ?? "hello@neverfightorargue.com";
const TEST_TOKEN = ""; // __TEST_TOKEN__ (empty in production)

const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function sendEmail(to: string, subject: string, html: string) {
  if (!BREVO_API_KEY || !to) return false;
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender: { name: FROM_NAME, email: FROM_EMAIL }, replyTo: { email: Deno.env.get("REPLY_TO") ?? "larry@kdmcommunity.com" }, to: [{ email: to }], subject, htmlContent: html }),
  });
  if (!res.ok) console.error("brevo", res.status);
  return res.ok;
}

async function verify(payload: string, header: string | null): Promise<boolean> {
  if (!WEBHOOK_SECRET || !header) return false;
  const parts: Record<string, string[]> = {};
  for (const p of header.split(",")) { const [k, v] = p.split("="); (parts[k] ??= []).push(v); }
  const t = parts["t"]?.[0];
  if (!t || !parts["v1"]) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return parts["v1"].includes(hex);
}

function shellLite(inner: string) {
  return `<div style="background:#F7F3EA;padding:32px 16px;font-family:Georgia,'Times New Roman',serif;color:#16261C;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E4DCCB;padding:32px;">
      <p style="margin:0 0 22px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#8A6330;">Never Fight or Argue Again</p>
      <div style="font-size:16px;line-height:1.6;">${inner}</div>
    </div></div>`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });
  const payload = await req.text();
  const isTest = !!TEST_TOKEN && req.headers.get("x-nfoa-test") === TEST_TOKEN;
  if (!isTest && !(await verify(payload, req.headers.get("stripe-signature")))) return new Response("bad signature", { status: 400 });

  let event: any;
  try { event = JSON.parse(payload); } catch { return new Response("bad json", { status: 400 }); }
  if (event.type !== "checkout.session.completed") return new Response(JSON.stringify({ ignored: event.type }), { status: 200 });
  const s = event.data.object;
  if ((s.metadata ?? {}).kind !== "book_order") return new Response(JSON.stringify({ ignored: "not a book order" }), { status: 200 });
  // Thank-you page add-on paid through the fallback Checkout: book-upsell records it (never a new order here).
  if (s.metadata?.addon) {
    if (isTest) return new Response(JSON.stringify({ ignored: "add-on (test)" }), { status: 200 });
    const f = await fetch(`${SUPABASE_URL}/functions/v1/book-upsell`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": req.headers.get("stripe-signature") ?? "" }, body: payload });
    return new Response(await f.text(), { status: f.status });
  }
  if (s.payment_status && !["paid", "no_payment_required"].includes(s.payment_status)) return new Response("not paid yet", { status: 200 });

  const cd = s.customer_details ?? {};
  const email = String(cd.email ?? s.customer_email ?? "").trim().toLowerCase();
  const name = String(cd.name ?? "").trim();
  const phone = String(cd.phone ?? "").trim();
  const ship = s.collected_information?.shipping_details ?? s.shipping_details ?? {};
  const a = ship.address ?? {};
  const fields: Record<string, string> = {};
  for (const f of s.custom_fields ?? []) fields[f.key] = String(f.text?.value ?? f.dropdown?.value ?? f.numeric?.value ?? "").trim();
  const amount = s.amount_total ?? 0;
  const shipCents = s.shipping_cost?.amount_total ?? s.total_details?.amount_shipping ?? 0;
  const money = (c: number) => `$${(c / 100).toFixed(2)}`;

  let quantity = 0;
  if (!isTest && STRIPE_KEY) {
    try {
      const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${s.id}/line_items?limit=10`, { headers: { Authorization: `Bearer ${STRIPE_KEY}` } });
      const li = await r.json();
      quantity = (li.data ?? []).reduce((n: number, x: any) => n + (x.quantity ?? 0), 0);
    } catch (e) { console.error("line_items", e); }
  }
  if (!quantity) quantity = Number(s.metadata?.test_quantity) || Math.max(1, Math.round((s.amount_subtotal ?? (amount - shipCents)) / 2000));
  const consent = fields.updates === "yes" ? true : fields.updates === "no" ? false : null;

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // 1) buyer (one row per lower(email))
  let buyerId: string | null = null;
  if (email) {
    const { data: found } = await db.from("buyers").select("id, marketing_consent").ilike("email", email.replace(/[%_\\]/g, "\\$&")).maybeSingle();
    const contact: Record<string, unknown> = {
      name: name || undefined, phone: phone || undefined,
      address_line1: a.line1 || undefined, address_line2: a.line2 || null, city: a.city || undefined,
      state: a.state || undefined, postal_code: a.postal_code || undefined, country: a.country || undefined,
      updated_at: new Date().toISOString(),
    };
    if (consent !== null) contact.marketing_consent = consent;
    if (found) { buyerId = found.id; await db.from("buyers").update(contact).eq("id", found.id); }
    else {
      const { data: ins, error } = await db.from("buyers").insert({ email, ...contact }).select("id").single();
      if (error) console.error("buyer insert", error.message);
      buyerId = ins?.id ?? null;
    }
  }

  // 2) order (idempotent on stripe_session)
  const { data: order, error: oerr } = await db.from("book_orders").upsert({
    buyer_id: buyerId, source: "web", stripe_session: s.id, stripe_payment_intent: s.payment_intent ?? null,
    email, name, phone, quantity, amount_cents: amount, shipping_cents: shipCents,
    ship_name: ship.name ?? name, ship_line1: a.line1 ?? null, ship_line2: a.line2 ?? null, ship_city: a.city ?? null,
    ship_state: a.state ?? null, ship_postal_code: a.postal_code ?? null, ship_country: a.country ?? null,
    inscription: fields.inscription || null, gift_note: fields.gift_note || null,
  }, { onConflict: "stripe_session", ignoreDuplicates: true }).select("order_no").maybeSingle();
  if (oerr) console.error("order upsert", oerr.message);
  if (!order) return new Response(JSON.stringify({ ok: true, duplicate: true }), { status: 200 });
  if (buyerId) await db.rpc("refresh_buyer_totals", { p_buyer: buyerId });

  // 3) notice to Larry
  const addr = [ship.name ?? name, a.line1, a.line2, [a.city, a.state, a.postal_code].filter(Boolean).join(", "), a.country].filter(Boolean).map(esc).join("<br>");
  const cop = `cop${quantity === 1 ? "y" : "ies"}`;
  await sendEmail(NOTIFY_EMAIL, `${isTest ? "[TEST] " : ""}[SHIP] ${quantity} signed ${cop}, ${name || email}, order ${order.order_no}`,
    `<p><b>New book order to ship.</b></p>
     <table cellpadding="4" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">
       <tr><td><b>Order</b></td><td>${esc(order.order_no)}</td></tr>
       <tr><td><b>Copies</b></td><td>${quantity} (${money(amount)} paid, including ${money(shipCents)} shipping)</td></tr>
       <tr><td><b>Sign it to</b></td><td>${esc(fields.inscription || "(nothing requested)")}</td></tr>
       <tr><td><b>Gift note</b></td><td>${esc(fields.gift_note || "(none)")}</td></tr>
       <tr><td valign="top"><b>Ship to</b></td><td>${addr || "(no address)"}</td></tr>
       <tr><td><b>Buyer</b></td><td>${esc(name)}</td></tr>
       <tr><td><b>Email</b></td><td>${esc(email)}</td></tr>
       <tr><td><b>Phone</b></td><td>${esc(phone || "(none)")}</td></tr>
       <tr><td><b>Email updates</b></td><td>${consent === null ? "(not answered)" : consent ? "Yes" : "No"}</td></tr>
       <tr><td><b>Stripe</b></td><td>${esc(s.payment_intent ?? s.id)}</td></tr>
     </table>
     <p style="color:#5C6B60">When it ships, mark it shipped in Supabase (book_orders) as explained in the README.</p>`);

  // 4) confirmation to the buyer (never in a test)
  if (!isTest && email) {
    await sendEmail(email, "Your signed copy is on the way soon",
      shellLite(`<p style="margin:0 0 18px;">Hi ${name ? esc(name.split(" ")[0]) + "," : "there,"}</p>
        <p style="margin:0 0 18px;">Thank you for your order of <b>${quantity} signed ${cop}</b> of <i>Never Fight or Argue Again</i>${fields.inscription ? `, signed to <i>${esc(fields.inscription)}</i>` : ""}.</p>
        <p style="margin:0 0 18px;">Total paid: <b>${money(amount)}</b>${shipCents ? ` (includes ${money(shipCents)} shipping)` : ""}.</p>
        <p style="margin:0 0 18px;">We sign every copy by hand, then ship it to:<br>${addr}</p>
        <p style="margin:0 0 18px;">Your order number is <b>${esc(order.order_no)}</b>. Stripe sends your payment receipt in a separate email. Just reply to this email if anything needs fixing.</p>
        <p style="margin:0;">Larry &amp; Ro</p>`));
  }
  return new Response(JSON.stringify({ ok: true, order_no: order.order_no, quantity, test: isTest }), { status: 200 });
});
