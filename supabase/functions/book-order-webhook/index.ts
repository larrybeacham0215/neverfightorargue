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
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://neverfightorargue.com";
const GUIDE_PRODUCT = "companion_guide";
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
  return parts["v1"].some((v) => safeEqual(v, hex));
}

// Constant-time string compare (Ray, Round 2).
function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i % (x.length || 1)] ?? 0) ^ (y[i % (y.length || 1)] ?? 0);
  return diff === 0 && x.length === y.length;
}

function shellLite(inner: string) {
  return `<div style="background:#F7F3EA;padding:32px 16px;font-family:Georgia,'Times New Roman',serif;color:#16261C;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E4DCCB;padding:32px;">
      <p style="margin:0 0 22px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#8A6330;">Never Fight or Argue Again</p>
      <div style="font-size:16px;line-height:1.6;">${inner}</div>
    </div></div>`;
}

function guideSectionHtml(guideUrl: string, siteUrl: string) {
  return `<div style="margin:24px 0 18px;padding:18px;background:#F7F3EA;border:1px solid #E4DCCB;">
    <p style="margin:0 0 10px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#8A6330;">Your Companion Guide</p>
    <p style="margin:0 0 12px;">Your order includes the Companion Guide, our 12 week interactive guide that walks the two of you through the book one chapter at a time, with space to write your answers together.</p>
    <p style="margin:0 0 14px;"><a href="${guideUrl}" style="display:inline-block;background:#16261C;color:#fff;padding:12px 20px;text-decoration:none;">Open my Companion Guide</a></p>
    <p style="margin:0 0 10px;">That button is your personal link, so please keep it private. The first time you open it, you can create a password for your account.</p>
    <p style="margin:0;">After that, sign in from any device at <a href="${siteUrl}/members/">${siteUrl.replace(/^https?:\/\//, "")}/members/</a>. If you ever forget your password, choose <b>Forgot password</b> on that page and we will email you a reset link.</p>
  </div>`;
}

function buyerEmailHtml(o: { name: string; lines: string[]; amount: number; shipCents: number; addr: string; orderNo: string; guideUrl: string; money: (c: number) => string }) {
  return shellLite(`<p style="margin:0 0 18px;">Hi ${o.name ? esc(o.name.split(" ")[0]) + "," : "there,"}</p>
        <p style="margin:0 0 10px;">Thank you for your order. Here is everything in it:</p>
        <ul style="margin:0 0 18px;padding-left:20px;">${o.lines.map((l) => `<li style="margin:0 0 6px;">${l}</li>`).join("")}</ul>
        <p style="margin:0 0 18px;">Total paid: <b>${o.money(o.amount)}</b>${o.shipCents ? ` (includes ${o.money(o.shipCents)} shipping)` : ""}.</p>
        <p style="margin:0 0 18px;">We sign every copy by hand, then ship it to:<br>${o.addr}</p>
        ${guideSectionHtml(o.guideUrl, SITE_URL)}
        <p style="margin:0 0 18px;">Your order number is <b>${esc(o.orderNo)}</b>. Stripe sends your payment receipt in a separate email. Just reply to this email if anything needs fixing.</p>
        <p style="margin:0;">Larry &amp; Ro</p>`);
}

// Read only preview of the buyer email for an existing order (service role key required).
async function previewFor(sessionId: string) {
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: o } = await db.from("book_orders").select("*").eq("stripe_session", sessionId).maybeSingle();
  if (!o) return null;
  const { data: adds } = await db.from("book_order_addons").select("offer, quantity, amount_cents, status").eq("order_id", o.id).eq("status", "paid");
  const { data: ent } = await db.from("entitlements").select("claim_token").eq("email_lower", o.email).eq("product", GUIDE_PRODUCT).is("revoked_at", null).maybeSingle();
  const money = (c: number) => `$${(c / 100).toFixed(2)}`;
  const cop = `cop${o.quantity === 1 ? "y" : "ies"}`;
  const lines = [`${o.quantity} signed ${cop} of <i>Never Fight or Argue Again</i>${o.inscription ? `, signed to <i>${esc(o.inscription)}</i>` : ""}`];
  for (const x of adds ?? []) lines.push(x.offer === "gift_copy" ? `${x.quantity} extra signed gift cop${x.quantity === 1 ? "y" : "ies"} (${money(x.amount_cents)}), in the same box` : `The printed, laminated companion set (${money(x.amount_cents)}), in the same box`);
  lines.push("Free access to the 12 week interactive Companion Guide");
  const addr = [o.ship_name, o.ship_line1, o.ship_line2, [o.ship_city, o.ship_state, o.ship_postal_code].filter(Boolean).join(", "), o.ship_country].filter(Boolean).map(esc).join("<br>");
  const total = o.amount_cents + (o.shipping_cents ?? 0) + (o.upsell_amount_cents ?? 0);
  return { email: o.email, html: buyerEmailHtml({ name: o.name ?? "", lines, amount: total, shipCents: o.shipping_cents ?? 0, addr, orderNo: o.order_no, guideUrl: ent?.claim_token ? `${SITE_URL}/guide/?t=${ent.claim_token}` : `${SITE_URL}/members/`, money }) };
}

Deno.serve(async (req) => {
  // Preview: POST {preview_session, send_to_larry?} with x-nfoa-preview = the sweep secret (database side only). Only ever sends to larrybeacham@gmail.com.
  if (req.method === "POST" && req.headers.get("x-nfoa-preview")) {
    const pdb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: sec } = await pdb.rpc("nfoa_sweep_secret");
    if (typeof sec !== "string" || !sec || !safeEqual(req.headers.get("x-nfoa-preview") ?? "", sec)) return new Response("not allowed", { status: 403 });
    const b = await req.json().catch(() => ({}));
    const p = await previewFor(String(b.preview_session ?? ""));
    if (!p) return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    let sent = false;
    if (b.send_to_larry) sent = await sendEmail("larrybeacham@gmail.com", "[TEST] Your signed copy is on the way soon", p.html);
    return new Response(JSON.stringify({ ok: true, sent, html: p.html }), { status: 200, headers: { "content-type": "application/json" } });
  }
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

  // Line items: the book itself, plus optional_items add-ons (gift copy / companion set) when the
  // optional_items checkout variant is live. Add-ons are split out by price ID so the book quantity and
  // book_orders.amount_cents never include them (refresh_buyer_totals adds upsell_amount_cents separately).
  const GIFT_PRICE = Deno.env.get("GIFT_COPY_PRICE_ID") || "price_1UXTPSLCCdJWrOprt7wE8MTs";
  const SET_PRICE = Deno.env.get("COMPANION_SET_PRICE_ID") || "price_1UXTQcLCCdJWrOprsG3rGD4a";
  let quantity = 0;
  const lineAddons: { offer: string; quantity: number; amount_cents: number }[] = [];
  let items: any[] | null = null;
  if (isTest && Array.isArray(s.test_line_items)) items = s.test_line_items; // constructed events, test builds only
  else if (!isTest && STRIPE_KEY) {
    try {
      const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${s.id}/line_items?limit=10`, { headers: { Authorization: `Bearer ${STRIPE_KEY}` } });
      const li = await r.json();
      items = li.data ?? [];
    } catch (e) { console.error("line_items", e); }
  }
  for (const x of items ?? []) {
    const pid = x.price?.id ?? "";
    const q = Number(x.quantity ?? 0);
    if (!q) continue;
    if (GIFT_PRICE && pid === GIFT_PRICE) lineAddons.push({ offer: "gift_copy", quantity: q, amount_cents: x.amount_total ?? 0 });
    else if (SET_PRICE && pid === SET_PRICE) lineAddons.push({ offer: "companion_set", quantity: q, amount_cents: x.amount_total ?? 0 });
    else quantity += q;
  }
  const addonCents = lineAddons.reduce((n, x) => n + x.amount_cents, 0);
  const bookAmount = amount - addonCents;
  // No metadata fallback any more (test_quantity removed): estimate from the subtotal only if Stripe gave nothing.
  if (!quantity) quantity = Math.max(1, Math.round(((s.amount_subtotal ?? (amount - shipCents)) - addonCents) / 2000));
  const consent = fields.updates === "yes" ? true : fields.updates === "no" ? false : null;

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // 1) buyer (one row per lower(email))
  let buyerId: string | null = null;
  if (email) {
    const { data: found } = await db.from("buyers").select("*").ilike("email", email.replace(/[%_\\]/g, "\\$&")).maybeSingle();
    // Checkout data only FILLS EMPTY buyer fields. It never overwrites an existing name, phone, address or
    // marketing_consent (Ray's review: anyone can pay using someone else's email). Each order keeps its own
    // shipping address on book_orders.
    const fresh: Record<string, unknown> = {
      name: name || null, phone: phone || null,
      address_line1: a.line1 || null, address_line2: a.line2 || null, city: a.city || null,
      state: a.state || null, postal_code: a.postal_code || null, country: a.country || null,
      marketing_consent: consent,
    };
    const contact: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fresh)) {
      if (v === null || v === undefined) continue;
      if (!found || found[k] === null || found[k] === undefined || found[k] === "") contact[k] = v;
    }
    if (found) { buyerId = found.id; if (Object.keys(contact).length) await db.from("buyers").update({ ...contact, updated_at: new Date().toISOString() }).eq("id", found.id); }
    else {
      const { data: ins, error } = await db.from("buyers").insert({ email, ...contact }).select("id").single();
      if (error) console.error("buyer insert", error.message);
      buyerId = ins?.id ?? null;
    }
  }

  // 2) order (idempotent on stripe_session)
  const { data: order, error: oerr } = await db.from("book_orders").upsert({
    buyer_id: buyerId, source: "web", stripe_session: s.id, stripe_payment_intent: s.payment_intent ?? null,
    email, name, phone, quantity, amount_cents: bookAmount, shipping_cents: shipCents,
    ship_name: ship.name ?? name, ship_line1: a.line1 ?? null, ship_line2: a.line2 ?? null, ship_city: a.city ?? null,
    ship_state: a.state ?? null, ship_postal_code: a.postal_code ?? null, ship_country: a.country ?? null,
    inscription: fields.inscription || null, gift_note: fields.gift_note || null,
  }, { onConflict: "stripe_session", ignoreDuplicates: true }).select("id, order_no").maybeSingle();
  if (oerr) console.error("order upsert", oerr.message);
  if (!order) return new Response(JSON.stringify({ ok: true, duplicate: true }), { status: 200 });
  if (lineAddons.length) {
    const rows = lineAddons.map((x) => ({
      order_id: order.id, offer: x.offer, quantity: x.quantity, amount_cents: x.amount_cents,
      status: "paid", method: "checkout_item", paid_at: new Date().toISOString(),
      stripe_session: null, stripe_payment_intent: null, // both unique; the order row already holds them
    }));
    const { error: aerr } = await db.from("book_order_addons").insert(rows);
    if (aerr) console.error("addon insert", aerr.message);
    else await db.rpc("apply_book_addons", { p_order: order.id });
  }
  if (buyerId) await db.rpc("refresh_buyer_totals", { p_buyer: buyerId });
  const addonText = lineAddons.map((x) => x.offer === "gift_copy" ? `${x.quantity} gift ${x.quantity === 1 ? "copy" : "copies"}` : "companion set").join(" + ");

  // 2b) Companion Guide access (Nov 5): every web book order grants the companion_guide entitlement with a
  // personal claim link, then enrolls the 13 step guide sequence (Day 1 the next day, then weekly).
  // Test orders (metadata.test=1) are enrolled as is_test, so they only ever get [TEST] versions.
  const testOrder = isTest || s.metadata?.test === "1";
  let claimToken: string | null = null;
  if (email) {
    try {
      const { data: have } = await db.from("entitlements").select("id, claim_token, revoked_at").eq("email_lower", email).eq("product", GUIDE_PRODUCT).maybeSingle();
      let entId: string | null = have?.id ?? null;
      claimToken = have?.claim_token ?? null;
      if (!have) {
        claimToken = crypto.randomUUID();
        const { data: ins, error: eerr } = await db.from("entitlements").insert({ email_lower: email, product: GUIDE_PRODUCT, source: "book_order", stripe_session: s.id, granted_at: new Date().toISOString(), claim_token: claimToken }).select("id").single();
        if (eerr) console.error("entitlement insert", eerr.message);
        entId = ins?.id ?? null;
      } else if (have.revoked_at) {
        claimToken = claimToken ?? crypto.randomUUID();
        await db.from("entitlements").update({ revoked_at: null, revoke_reason: null, granted_at: new Date().toISOString(), claim_token: claimToken, stripe_session: s.id }).eq("id", have.id);
      } else if (!claimToken) {
        claimToken = crypto.randomUUID();
        await db.from("entitlements").update({ claim_token: claimToken }).eq("id", have.id);
      }
      if (entId) {
        const { data: st } = await db.from("guide_sequence_state").select("entitlement_id, stopped_at").eq("entitlement_id", entId).maybeSingle();
        if (!st) {
          await db.from("guide_sequence_state").insert({ entitlement_id: entId, email_lower: email, is_test: testOrder, buyer_name: name || null, cohort: "book_order" });
          const base = Date.now();
          const steps = [["day1", 0, 1], ...Array.from({ length: 12 }, (_, i) => [`week${i + 1}`, i + 1, (i + 1) * 7])];
          const { error: qerr } = await db.from("guide_email_queue").upsert(steps.map(([step, n, d]) => ({
            entitlement_id: entId, preorder_id: null, email_lower: email, step, step_num: n,
            due_at: new Date(base + Number(d) * 86400000).toISOString(), status: "pending", is_test: testOrder,
          })), { onConflict: "entitlement_id,step", ignoreDuplicates: true });
          if (qerr) console.error("guide enroll", qerr.message);
        }
      }
    } catch (e) { console.error("guide grant", String(e)); }
  }
  const guideUrl = claimToken ? `${SITE_URL}/guide/?t=${claimToken}` : `${SITE_URL}/members/`;

  // 3) notice to Larry
  const addr = [ship.name ?? name, a.line1, a.line2, [a.city, a.state, a.postal_code].filter(Boolean).join(", "), a.country].filter(Boolean).map(esc).join("<br>");
  const cop = `cop${quantity === 1 ? "y" : "ies"}`;
  await sendEmail(NOTIFY_EMAIL, `${testOrder ? "[TEST] " : ""}[SHIP] ${quantity} signed ${cop}, ${name || email}, order ${order.order_no}`,
    `<p><b>New book order to ship.</b></p>
     <table cellpadding="4" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">
       <tr><td><b>Order</b></td><td>${esc(order.order_no)}</td></tr>
       <tr><td><b>Copies</b></td><td>${quantity}${addonText ? ` plus ${esc(addonText)}` : ""} (${money(amount)} paid, including ${money(shipCents)} shipping)</td></tr>
       <tr><td><b>Add-ons</b></td><td>${addonText ? esc(addonText) : "(none)"}</td></tr>
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

  // 4) confirmation to the buyer (never in a harness test). Lists everything bought plus Companion Guide access.
  if (!isTest && email) {
    const lines = [`${quantity} signed ${cop} of <i>Never Fight or Argue Again</i>${fields.inscription ? `, signed to <i>${esc(fields.inscription)}</i>` : ""}`];
    for (const x of lineAddons) lines.push(x.offer === "gift_copy" ? `${x.quantity} extra signed gift cop${x.quantity === 1 ? "y" : "ies"} (${money(x.amount_cents)}), in the same box` : `The printed, laminated companion set (${money(x.amount_cents)}), in the same box`);
    lines.push("Free access to the 12 week interactive Companion Guide");
    await sendEmail(email, `${testOrder ? "[TEST] " : ""}Your signed copy is on the way soon`, buyerEmailHtml({ name, lines, amount, shipCents, addr, orderNo: order.order_no, guideUrl, money }));
  }
  return new Response(JSON.stringify({ ok: true, order_no: order.order_no, quantity, test: isTest }), { status: 200 });
});
