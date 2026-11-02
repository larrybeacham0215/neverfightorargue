// Ray Round 2 must-fix 1: detach the saved card after the 30 minute window (deployed Nov 2, 2026).
// book-upsell: one-time add-ons on the order thank-you page (Larry, Nov 2, 2026).
//   Offer 1 gift_copy:     extra signed copy in the same box, $15 each, 1 to 3, optional name per copy.
//   Offer 2 companion_set: printed laminated companion set, $9.
// Security: CORS limited to the site (+ localhost:8787 preview); 60 requests per IP per 10 minutes (the page polls).
// Round 2: before the first charge the buyer confirms their shipping ZIP (5 wrong tries per order per 30 minutes locks it),
// so a leaked thank-you link alone cannot charge the card. The summary GET hides name, inscription and city until the ZIP matches.
// Reopening a fallback Checkout first expires the old one; if the old one was already paid it is recorded, never lost.
// No added shipping (same box). Each offer can be accepted once per order, within 30 minutes of checkout.
//
// GET  ?session_id=cs_...                         -> order summary + which offers are still open
// POST {session_id, offer, quantity, inscriptions} -> one-click charge of the saved card (off_session PaymentIntent)
//        200 {ok:true, status:"added"} | {ok:false, fallback_url} when the bank asks for 3DS or the card has no saved method
// POST {session_id, confirm_session: cs_...}       -> after the fallback Checkout returns, records it if paid
// POST (Stripe event, forwarded by book-order-webhook with the Stripe-Signature) -> records a paid fallback Checkout
// Every path records through the book_order_addons row (status pending -> paid, flipped once), then
// apply_book_addons() rebuilds the order's add-on summary from paid rows, so nothing is double counted.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "hello@neverfightorargue.com";
const FROM_NAME = Deno.env.get("FROM_NAME") ?? "Larry & Ro";
const NOTIFY_EMAIL = Deno.env.get("NOTIFY_EMAIL") ?? "hello@neverfightorargue.com";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://neverfightorargue.com";
const TEST_TOKEN = ""; // __TEST_TOKEN__ (empty in production)
const WINDOW_SEC = 30 * 60;

const OFFERS: Record<string, { unit: number; max: number; name: string }> = {
  gift_copy: { unit: 1500, max: 3, name: "Extra signed gift copy (same box)" },
  companion_set: { unit: 900, max: 1, name: "Printed laminated companion set" },
};

const ALLOWED_ORIGINS = ["https://neverfightorargue.com", "https://www.neverfightorargue.com", "http://localhost:8787"];
function corsFor(req: Request) {
  const o = req.headers.get("origin") ?? "";
  const h: Record<string, string> = { "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "content-type", Vary: "Origin" };
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
let cors: Record<string, string> = {}; // set per request in Deno.serve
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function stripe(path: string, params?: Record<string, string>, idem?: string) {
  const headers: Record<string, string> = { Authorization: `Bearer ${STRIPE_KEY}` };
  if (params) headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (idem) headers["Idempotency-Key"] = idem;
  const r = await fetch(`https://api.stripe.com/v1/${path}`, { method: params ? "POST" : "GET", headers, body: params ? new URLSearchParams(params) : undefined });
  return { ok: r.ok, status: r.status, body: await r.json() };
}

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

// Constant-time compare for the Stripe signature (Round 2).
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
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
  let ok = false;
  for (const v of parts["v1"]) if (safeEqual(v ?? "", hex)) ok = true;
  return ok;
}

// Loads the original book session (from Stripe, or a constructed one in a test) plus its order row.
async function load(sessionId: string, test: any) {
  let s: any = null;
  if (test?.session) s = test.session;
  else {
    let r = await stripe(`checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=payment_intent`);
    if (r.status === 401 || r.status === 403) r = await stripe(`checkout/sessions/${encodeURIComponent(sessionId)}`); // key without PaymentIntent read
    if (!r.ok) return { error: "Order not found.", code: 404 };
    s = r.body;
  }
  if ((s.metadata ?? {}).kind !== "book_order" || s.metadata?.addon) return { error: "Order not found.", code: 404 };
  const { data: order } = await db.from("book_orders").select("*").eq("stripe_session", s.id).maybeSingle();
  const { data: addons } = order ? await db.from("book_order_addons").select("*").eq("order_id", order.id) : { data: [] };
  const open = s.payment_status === "paid" && Date.now() / 1000 - Number(s.created) <= WINDOW_SEC;
  return { s, order, addons: addons ?? [], open };
}

const zip5 = (v: unknown) => String(v ?? "").replace(/\s+/g, "").slice(0, 5);
async function zipFailures(orderId: string) {
  const { count } = await db.from("fn_rate_hits").select("id", { count: "exact", head: true })
    .eq("bucket", "upsell-zip").eq("ip", orderId).gt("at", new Date(Date.now() - WINDOW_SEC * 1000).toISOString());
  return count ?? 0;
}
// "ok" | "bad" | "locked"
async function checkZip(order: any, s: any, given: unknown) {
  if (await zipFailures(order.id) >= 5) return "locked";
  const ship = s.collected_information?.shipping_details ?? s.shipping_details ?? {};
  const want = zip5(order.ship_postal_code ?? ship.address?.postal_code);
  if (want && zip5(given) === want) return "ok";
  await db.from("fn_rate_hits").insert({ bucket: "upsell-zip", ip: order.id });
  return "bad";
}

async function notifyLarry(order: any, row: any, isTest: boolean) {
  const o = OFFERS[row.offer];
  const what = row.offer === "gift_copy" ? `${row.quantity} extra signed cop${row.quantity === 1 ? "y" : "ies"}` : "printed laminated companion set";
  const names = (row.inscriptions ?? []).filter(Boolean);
  const { data: fresh } = await db.from("book_orders").select("quantity, gift_copies, companion_set, inscription").eq("id", order.id).single();
  const total = (fresh?.quantity ?? order.quantity) + (fresh?.gift_copies ?? 0);
  await sendEmail(NOTIFY_EMAIL, `${isTest ? "[TEST] " : ""}[ADD-ON] order ${order.order_no}: add ${what} (+${money(row.amount_cents)})`,
    `<p><b>Add this to order ${esc(order.order_no)} before it ships.</b> Same box, no extra shipping was charged.</p>
     <table cellpadding="4" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">
       <tr><td><b>Order</b></td><td>${esc(order.order_no)} (${esc(order.name || order.email)})</td></tr>
       <tr><td><b>Add-on</b></td><td>${esc(o.name)} x ${row.quantity}, ${money(row.amount_cents)} paid</td></tr>
       ${row.offer === "gift_copy" ? `<tr><td><b>Sign the extra cop${row.quantity === 1 ? "y" : "ies"} to</b></td><td>${names.length ? names.map(esc).join("<br>") : "(no names given)"}</td></tr>` : ""}
       <tr><td><b>Box now holds</b></td><td>${total} signed book${total === 1 ? "" : "s"}${fresh?.companion_set ? " + 1 laminated companion set" : ""}</td></tr>
       <tr><td><b>Main copy signed to</b></td><td>${esc(fresh?.inscription || "(nothing requested)")}</td></tr>
       <tr><td><b>Stripe</b></td><td>${esc(row.stripe_payment_intent ?? row.stripe_session ?? "")}</td></tr>
     </table>
     <p style="color:#5C6B60">ship_queue in Supabase now shows gift_copies, gift_inscriptions and companion_set for this order.</p>`);
}

// Flips a pending add-on to paid exactly once; only the call that flips it sends the notice.
async function markPaid(order: any, rowId: string, fields: Record<string, unknown>, isTest: boolean) {
  const { data: flipped } = await db.from("book_order_addons").update({ status: "paid", paid_at: new Date().toISOString(), ...fields })
    .eq("id", rowId).eq("status", "pending").select("*").maybeSingle();
  if (!flipped) return false;
  await db.rpc("apply_book_addons", { p_order: order.id });
  await notifyLarry(order, flipped, isTest);
  return true;
}

// Ray Round 2 must-fix 1 (HELD): remove the saved card once it is no longer needed.
// Needs the restricted key to have PaymentMethods: Write. Records book_orders.card_detached_at (held migration).
let SWEEP_SECRET = Deno.env.get("SWEEP_SECRET") ?? "";
async function sweepSecret() {
  // Falls back to the Vault secret nfoa_sweep_secret (service-role-only RPC), shared with the pg_cron job.
  if (!SWEEP_SECRET) { const { data } = await db.rpc("nfoa_sweep_secret"); SWEEP_SECRET = typeof data === "string" ? data : ""; }
  return SWEEP_SECRET;
}
async function detachCard(order: any, s: any) {
  if (order.card_detached_at) return "already";
  const pi = s.payment_intent && typeof s.payment_intent === "object" ? s.payment_intent : null;
  const pm = pi?.payment_method; const pmId = typeof pm === "string" ? pm : pm?.id;
  if (!pmId || pi?.setup_future_usage !== "off_session") {
    await db.from("book_orders").update({ card_detached_at: new Date().toISOString() }).eq("id", order.id);
    return "none_saved";
  }
  const r = await stripe(`payment_methods/${pmId}/detach`, {});
  const gone = r.ok || r.body?.error?.code === "payment_method_unexpected_state" || /not attached/i.test(r.body?.error?.message ?? "");
  if (gone) await db.from("book_orders").update({ card_detached_at: new Date().toISOString() }).eq("id", order.id);
  else console.error("detach failed", r.status, r.body?.error?.code);
  return gone ? "detached" : "failed";
}

async function sweepCards() {
  // Web orders 31 minutes to 7 days old whose saved card has not been removed yet.
  const now = Date.now();
  const { data: rows } = await db.from("book_orders").select("*").eq("source", "web").is("card_detached_at", null)
    .lt("created_at", new Date(now - (WINDOW_SEC + 60) * 1000).toISOString())
    .gt("created_at", new Date(now - 7 * 86400 * 1000).toISOString()).limit(50);
  const out: Record<string, number> = {};
  for (const o of rows ?? []) {
    if (!o.stripe_session) continue;
    const r = await stripe(`checkout/sessions/${o.stripe_session}?expand[]=payment_intent`);
    if (!r.ok) { out.lookup_failed = (out.lookup_failed ?? 0) + 1; continue; }
    const k = await detachCard(o, r.body);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

async function fallbackCheckout(order: any, s: any, row: any, isTest: boolean, keepOpen = false) {
  const o = OFFERS[row.offer];
  const p: Record<string, string> = {
    mode: "payment",
    success_url: `${SITE_URL}/order-thank-you/?session_id=${s.id}&addon_session={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE_URL}/order-thank-you/?session_id=${s.id}`,
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(o.unit),
    "line_items[0][price_data][product_data][name]": o.name,
    "line_items[0][price_data][product_data][description]": `Added to order ${order.order_no}. Ships in the same box, no extra shipping.`,
    "line_items[0][quantity]": String(row.quantity),
    "metadata[project]": "nfoaa", "metadata[kind]": "book_order", "metadata[addon]": "1",
    "metadata[order_no]": order.order_no, "metadata[addon_id]": row.id,
    "payment_intent_data[metadata][kind]": "book_addon", "payment_intent_data[metadata][order_no]": order.order_no,
    expires_at: String(Math.floor(Date.now() / 1000) + 31 * 60),
  };
  const cust = s.customer ?? s.payment_intent?.customer;
  if (cust) p.customer = typeof cust === "string" ? cust : cust.id;
  else if (order.email) p.customer_email = order.email;
  const r = await stripe("checkout/sessions", p);
  if (!r.ok) { console.error("fallback checkout", r.body?.error?.message); return null; }
  await db.from("book_order_addons").update({ stripe_session: r.body.id, method: "checkout" }).eq("id", row.id);
  if (isTest && !keepOpen) { // tests never leave a payable page open (keep_open tests expire it through the reopen path)
    const x = await stripe(`checkout/sessions/${r.body.id}/expire`, {});
    return { url: r.body.url, id: r.body.id, expired: x.body?.status === "expired" };
  }
  return { url: r.body.url, id: r.body.id };
}

// Must-fix 2: a pending fallback Checkout is still payable, so never just delete its row.
// Returns "cleared" (old session expired, row may be replaced), "paid" (old session was paid and is now recorded) or "busy".
async function settleOldFallback(prev: any, test: any, isTest: boolean) {
  const get = async () => test?.prev_session ? { ok: true, status: 200, body: test.prev_session } : await stripe(`checkout/sessions/${prev.stripe_session}`);
  let r = await get();
  if (!r.ok) { console.error("old fallback lookup", r.status); return { state: "busy" }; }
  if (r.body.payment_status === "paid") return { state: "paid", rec: await recordFallback(r.body, isTest) };
  if (r.body.status === "expired") return { state: "cleared" };
  const x = test?.expire_result ? { ok: true, body: test.expire_result } : await stripe(`checkout/sessions/${prev.stripe_session}/expire`, {});
  if (x.ok && x.body?.status === "expired") return { state: "cleared", expired: prev.stripe_session };
  if (test?.prev_session_after) test.prev_session = test.prev_session_after;
  r = await get(); // expire refused: the buyer may have just paid it
  if (r.ok && r.body.payment_status === "paid") return { state: "paid", rec: await recordFallback(r.body, isTest) };
  if (r.ok && r.body.status === "expired") return { state: "cleared" };
  return { state: "busy" };
}

async function handleEvent(payload: string, sig: string | null, isTest: boolean) {
  if (!isTest && !(await verify(payload, sig))) return json({ error: "bad signature" }, 400);
  const ev = JSON.parse(payload);
  const a = ev.data?.object ?? {};
  if (ev.type !== "checkout.session.completed" || !a.metadata?.addon) return json({ ignored: true });
  if (a.payment_status !== "paid") return json({ ignored: "not paid" });
  return json(await recordFallback(a, isTest));
}

async function recordFallback(a: any, isTest: boolean) {
  const { data: row } = await db.from("book_order_addons").select("*").eq("id", a.metadata?.addon_id).maybeSingle();
  if (!row || row.stripe_session !== a.id) return { ok: false, error: "add-on not found" };
  const { data: order } = await db.from("book_orders").select("*").eq("id", row.order_id).single();
  const flipped = await markPaid(order, row.id, { stripe_payment_intent: a.payment_intent ?? null, amount_cents: a.amount_total ?? row.amount_cents }, isTest);
  return { ok: true, status: flipped ? "added" : "already_added" };
}

Deno.serve(async (req) => {
  cors = corsFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET" && req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  // Scheduled sweep (pg_cron via pg_net). Server to server, so no Origin; gated by SWEEP_SECRET.
  if (req.method === "POST" && req.headers.get("x-nfoa-sweep")) {
    const sec = await sweepSecret();
    if (!sec || !safeEqual(req.headers.get("x-nfoa-sweep") ?? "", sec)) return json({ error: "Not allowed" }, 403);
    return json({ ok: true, swept: await sweepCards() });
  }
  const signed = req.method === "POST" && !!req.headers.get("stripe-signature");
  if (!signed) {
    if (!originOk(req)) return json({ error: "Not allowed" }, 403);
    if (!(await rateOk(db, "book-upsell", req, 60, 600))) return json({ error: "Too many tries. Please wait a few minutes." }, 429);
  }
  const isTest = !!TEST_TOKEN && req.headers.get("x-nfoa-test") === TEST_TOKEN;
  const u = new URL(req.url);

  if (req.method === "GET") {
    const sid = u.searchParams.get("session_id") ?? "";
    if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(sid)) return json({ error: "Order not found." }, 404);
    const th = isTest ? req.headers.get("x-nfoa-test-session") : null; // constructed session, test builds only
    const L: any = await load(sid, th ? { session: JSON.parse(atob(th)) } : null);
    if (L.error) return json({ error: L.error }, L.code);
    const { s, order, addons, open } = L;
    const ship = s.collected_information?.shipping_details ?? s.shipping_details ?? {};
    const zipOk = !!order && !!u.searchParams.get("zip") && (await checkZip(order, s, u.searchParams.get("zip"))) === "ok";
    const state = (k: string) => { const r = addons.find((x: any) => x.offer === k); return r?.status === "paid" ? "added" : open ? "open" : "closed"; };
    return json({
      ready: !!order, order_no: order?.order_no ?? null,
      verified: zipOk,
      first_name: zipOk ? String(s.customer_details?.name ?? "").split(" ")[0] || null : null,
      quantity: order?.quantity ?? null, inscription: zipOk ? order?.inscription ?? null : null,
      total_cents: s.amount_total, shipping_cents: s.shipping_cost?.amount_total ?? s.total_details?.amount_shipping ?? 0,
      ship_to: zipOk ? [ship.address?.city, ship.address?.state].filter(Boolean).join(", ") || null : null,
      gift_copies: order?.gift_copies ?? 0, companion_set: !!order?.companion_set,
      offers: { gift_copy: state("gift_copy"), companion_set: state("companion_set") },
      closes_at: Number(s.created) + WINDOW_SEC,
    });
  }
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const payload = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (sig) return handleEvent(payload, sig, false);
  let b: any; try { b = JSON.parse(payload); } catch { return json({ error: "bad json" }, 400); }
  if (isTest && b.type === "checkout.session.completed") return handleEvent(payload, null, true);
  const test = isTest ? b.test ?? {} : null;

  // Test-only: check Stripe accepts our parameters without charging anyone.
  if (isTest && b.action === "validate") {
    const out: Record<string, unknown> = {};
    const pi = await stripe("payment_intents", { amount: "900", currency: "usd", confirm: "true", off_session: "true", "metadata[kind]": "book_addon_validate" });
    out.off_session_pi = { status: pi.status, code: pi.body?.error?.code ?? null, param: pi.body?.error?.param ?? null, message: pi.body?.error?.message ?? null, created: pi.body?.id ?? pi.body?.error?.payment_intent?.id ?? null };
    if (b.expire_session) { const x = await stripe(`checkout/sessions/${b.expire_session}/expire`, {}); out.expired = { id: b.expire_session, status: x.body?.status ?? x.body?.error?.message }; }
    return json(out);
  }

  const sid = String(b.session_id ?? "");
  if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(sid)) return json({ error: "Order not found." }, 404);
  const L: any = await load(sid, test);
  if (L.error) return json({ error: L.error }, L.code);
  const { s, order, addons, open } = L;
  if (!order) return json({ ok: false, retry: true, error: "Your order is still being recorded. Try again in a moment." }, 409);

  // Return from the fallback Checkout.
  if (b.confirm_session) {
    if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(String(b.confirm_session))) return json({ error: "bad session" }, 400);
    const r = test?.addon_session ? { ok: true, body: test.addon_session } : await stripe(`checkout/sessions/${b.confirm_session}`);
    if (!r.ok || r.body.payment_status !== "paid" || r.body.metadata?.order_no !== order.order_no) return json({ ok: false, error: "Payment not completed." }, 402);
    return json(await recordFallback(r.body, isTest));
  }

  const offer = String(b.offer ?? "");
  const o = OFFERS[offer];
  if (!o) return json({ error: "Unknown offer." }, 400);
  if (s.payment_status !== "paid") return json({ ok: false, error: "This order is not paid." }, 402);
  if (!open) { if (!isTest) await detachCard(order, s); return json({ ok: false, closed: true, error: "This one-time offer has closed." }, 410); }
  const z = await checkZip(order, s, b.zip);
  if (z === "locked") return json({ ok: false, zip: "locked", error: "Too many tries. Please email us and we will add it for you." }, 429);
  if (z !== "ok") return json({ ok: false, zip: "bad", error: "That ZIP code does not match the shipping address on this order." }, 403);
  const qty = Math.max(1, Math.min(o.max, parseInt(String(b.quantity ?? "1"), 10) || 1));
  const inscriptions = offer === "gift_copy" ? (Array.isArray(b.inscriptions) ? b.inscriptions : []).slice(0, qty).map((x: unknown) => String(x ?? "").trim().slice(0, 100)) : [];
  const amount = o.unit * qty;

  // Claim the offer (one per order). An abandoned fallback can be reopened; a paid one cannot.
  const prev = addons.find((x: any) => x.offer === offer);
  if (prev?.status === "paid") return json({ ok: true, status: "already_added" });
  let expiredOld: string | undefined;
  if (prev) {
    if (!prev.stripe_session) return json({ ok: false, error: "We are still processing this add-on." }, 409);
    const st: any = await settleOldFallback(prev, test, isTest);
    if (st.state === "paid") return json({ ok: true, status: st.rec?.status ?? "already_added", from: "earlier_checkout" });
    if (st.state !== "cleared") return json({ ok: false, error: "Your earlier payment page is still open. Finish it there, or try again in a minute." }, 409);
    expiredOld = st.expired;
    await db.from("book_order_addons").delete().eq("id", prev.id).eq("status", "pending");
  }
  const { data: row, error: cerr } = await db.from("book_order_addons").insert({ order_id: order.id, offer, quantity: qty, inscriptions, amount_cents: amount, method: "one_click" }).select("*").single();
  if (cerr || !row) return json({ ok: false, error: "We are still processing this add-on." }, 409);

  const pi = s.payment_intent && typeof s.payment_intent === "object" ? s.payment_intent : null;
  const pm = pi?.payment_method; const customer = pi?.customer ?? s.customer;
  const pmId = typeof pm === "string" ? pm : pm?.id; const custId = typeof customer === "string" ? customer : customer?.id;

  let result: { status: "succeeded" | "needs_action" | "declined"; pi?: string; message?: string };
  if (!pmId || !custId || pi?.setup_future_usage !== "off_session") result = { status: "needs_action" };
  else if (isTest) result = test.outcome === "succeeded" ? { status: "succeeded", pi: "pi_test_simulated" } : test.outcome === "declined" ? { status: "declined", message: "Your card was declined." } : { status: "needs_action" };
  else {
    const r = await stripe("payment_intents", {
      amount: String(amount), currency: "usd", customer: custId, payment_method: pmId,
      off_session: "true", confirm: "true",
      description: `${o.name} x ${qty}, order ${order.order_no}`,
      "metadata[project]": "nfoaa", "metadata[kind]": "book_addon", "metadata[order_no]": order.order_no, "metadata[offer]": offer, "metadata[addon_id]": row.id,
      ...(order.email ? { receipt_email: order.email } : {}),
    }, `book-addon-${row.id}`);
    if (r.ok && r.body.status === "succeeded") result = { status: "succeeded", pi: r.body.id };
    else {
      const e = r.body?.error ?? {};
      if (r.status === 401 || r.status === 403) console.error("book-upsell: Stripe key cannot create PaymentIntents, using Checkout fallback", r.status);
      const failedPi = e.payment_intent?.id ?? r.body?.id;
      if (failedPi && (r.body?.status === "requires_action" || e.payment_intent?.status === "requires_action")) await stripe(`payment_intents/${failedPi}/cancel`, {});
      result = r.status === 401 || r.status === 403 || e.code === "authentication_required" || r.body?.status === "requires_action" ? { status: "needs_action" } : { status: "declined", message: e.message ?? "The card was not charged." };
    }
  }

  if (result.status === "succeeded") {
    await markPaid(order, row.id, { stripe_payment_intent: result.pi }, isTest);
    const { data: fresh } = await db.from("book_orders").select("gift_copies, companion_set, upsell_amount_cents").eq("id", order.id).single();
    if (fresh?.gift_copies && fresh?.companion_set && !isTest) await detachCard(order, s); // both offers used: card no longer needed
    return json({ ok: true, status: "added", order_no: order.order_no, amount_cents: amount, ...fresh });
  }
  if (result.status === "needs_action") {
    const fb = await fallbackCheckout(order, s, row, isTest, !!test?.keep_open);
    if (!fb) { await db.from("book_order_addons").delete().eq("id", row.id).eq("status", "pending"); return json({ ok: false, error: "We could not start the payment. Please try again." }, 502); }
    return json({ ok: false, status: "needs_checkout", fallback_url: fb.url, ...(isTest ? { fallback_session: fb.id, expired: fb.expired, expired_old: expiredOld ?? null } : {}) });
  }
  await db.from("book_order_addons").delete().eq("id", row.id).eq("status", "pending");
  return json({ ok: false, status: "declined", error: result.message }, 402);
});
