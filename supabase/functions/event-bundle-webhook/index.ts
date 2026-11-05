// =====================================================================
// event-bundle-webhook - Never Fight or Argue Again, event weekend
// Handles ONLY metadata.kind=event_bundle:
//   checkout.session.completed -> preorders row (channel=event, quantity = 2 x bundles + singles,
//                                 so /pickup/ QR and /express/ work unchanged),
//                                 entitlement "companion_guide", buyer email via Brevo
//                                 from hello@, [EVENT BUNDLE] note to Larry.
//   charge.refunded            -> preorders status=refunded, entitlement revoked.
// Flag: EVENT_BUNDLE_WEBHOOK_ON must be "1" (default off: verifies, then ignores),
// except sessions with metadata test_run=event_bundle_test (the $1 token-gated test).
// Go-live: the live stripe-webhook forwards kind=event_bundle and charge.refunded
// here with the original signature (same pattern as book-order-webhook).
// Deploy: supabase functions deploy event-bundle-webhook --no-verify-jwt
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { bundleEmail, SUBJECT } from "./email.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Own Stripe endpoint (preferred, no live change) or forwarded from stripe-webhook.
const WEBHOOK_SECRET = Deno.env.get("EVENT_BUNDLE_WEBHOOK_SECRET") ?? Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") ?? "";
const NOTIFY_EMAIL = Deno.env.get("NOTIFY_EMAIL") ?? "hello@neverfightorargue.com";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://neverfightorargue.com";
const ON = Deno.env.get("EVENT_BUNDLE_WEBHOOK_ON") === "1";
const PRODUCT = "companion_guide";

async function sendEmail(to: string, subject: string, html: string) {
  if (!BREVO_API_KEY) return false;
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST", headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender: { name: "Larry & Ro", email: "hello@neverfightorargue.com" }, replyTo: { email: Deno.env.get("REPLY_TO") ?? "hello@neverfightorargue.com" }, to: [{ email: to }], subject, htmlContent: html }),
  });
  return res.ok;
}
async function verify(payload: string, header: string | null) {
  if (!WEBHOOK_SECRET || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  if (!parts.t || !parts.v1 || Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${parts.t}.${payload}`));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("") === parts.v1;
}
const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  const payload = await req.text();
  if (!(await verify(payload, req.headers.get("stripe-signature")))) return new Response("bad signature", { status: 400 });
  const event = JSON.parse(payload);
  const obj = event.data?.object ?? {};
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  if (event.type === "checkout.session.completed") {
    const s = obj;
    if (s.metadata?.kind !== "event_bundle") return ok({ ignored: "not event_bundle" });
    if (!ON && s.metadata?.test_run !== "event_bundle_test") return ok({ ignored: "flag off" });
    if (s.payment_status !== "paid") return ok({ ignored: "not paid" });
    // books_pickup = 2*bundles + singles (legacy: missing singles => 0 extras)
    let bundleQty = Math.max(0, parseInt(String(s.metadata.bundles ?? "0"), 10) || 0);
    if (!Number.isFinite(bundleQty) || (bundleQty < 1 && (s.metadata.bundle === "1" || s.metadata.kind === "event_bundle") && !("singles" in (s.metadata || {})))) bundleQty = Math.max(1, parseInt(String(s.metadata.bundles ?? "1"), 10) || 1);
    const singleQty = Math.max(0, parseInt(s.metadata.singles ?? "0", 10) || 0);
    const booksPickup = Math.max(1, parseInt(s.metadata.books ?? "", 10) || (bundleQty * 2 + singleQty));
    const grantGuide = bundleQty >= 1;
    const email = (s.customer_details?.email ?? s.customer_email ?? "").toLowerCase();
    let name = s.customer_details?.name || s.metadata.buyer_name || "";
    const fields: Record<string, string> = {};
    for (const f of s.custom_fields ?? []) fields[f.key] = f.text?.value ?? "";
    if (fields.full_name?.trim()) name = fields.full_name.trim();
    const { data: row, error } = await db.from("preorders").upsert({
      stripe_session: s.id, email, name, inscription: fields.inscription ?? "",
      quantity: booksPickup, bundles: bundleQty,
      product: "event_bundle", amount: s.amount_total ?? 0, status: "paid", channel: "event",
      payment_intent: s.payment_intent ?? null, test_run: s.metadata.test_run ?? null,
    }, { onConflict: "stripe_session" }).select("id, pickup_token").single();
    if (error || !row) { console.error("save failed", error); return new Response("save failed", { status: 500 }); }
    // Convert hold -> sold (preorder row now counts in event_books_sold).
    await db.rpc("event_release_hold", { p_hold_token: s.metadata?.hold_token ?? null, p_stripe_session: s.id });
    let entitlementId: string | null = null;
    // Guide entitlement ONLY when at least one bundle was purchased.
    if (email && grantGuide) {
      const { data: ent } = await db.from("entitlements").upsert({ email_lower: email, product: PRODUCT, stripe_session: s.id, preorder_id: row.id, granted_at: new Date().toISOString(), revoked_at: null, revoke_reason: null }, { onConflict: "email_lower,product" }).select("id").single();
      entitlementId = ent?.id ?? null;
      // Enroll Companion Guide follow-ups (13 steps). Safe while GUIDE_SEQUENCE_ON is off.
      if (entitlementId) await db.rpc("enroll_guide_sequence", { p_entitlement_id: entitlementId });
    }
    const ticketUrl = `${SITE_URL}/pickup/?t=${row.pickup_token}`, guideUrl = `${SITE_URL}/guide/?t=${row.pickup_token}`;
    const tag = s.metadata.test_run ? "[TEST] " : "";
    const summary = `${bundleQty} bundle${bundleQty === 1 ? "" : "s"}` + (singleQty ? ` + ${singleQty} single${singleQty === 1 ? "" : "s"}` : "") + ` (${booksPickup} books)`;
    await sendEmail(NOTIFY_EMAIL, `${tag}[EVENT BUNDLE] ${summary}, $${((s.amount_total ?? 0) / 100).toFixed(2)}, ${name || email}`,
      `<p><b>${name || "(no name given)"}</b> (${email}) bought ${summary}. Sign to: ${fields.inscription || "(none)"}.</p>`);
    if (email) {
      const { data: sub } = await db.from("subscribers").select("unsubscribe_token").eq("email", email).is("unsubscribed_at", null).maybeSingle();
      const unsubUrl = sub?.unsubscribe_token ? `${SITE_URL}/unsubscribe/?t=${sub.unsubscribe_token}` : null;
      await sendEmail(email, `${tag}${SUBJECT}`, bundleEmail({ name, bundles: bundleQty, books: booksPickup, inscription: fields.inscription ?? "", ticketUrl, guideUrl: grantGuide ? guideUrl : ticketUrl, unsubUrl }));
    }
    return ok({ ok: true, bundles: bundleQty, singles: singleQty, books_pickup: booksPickup, grant_guide: grantGuide });
  }

  if (event.type === "charge.refunded") {
    // Charge objects often lack metadata.kind even when the PaymentIntent/session was event_bundle.
    // Identify via payment_intent -> preorders.product. Flag gate: skip fulfillment-side ignore when flag off
    // only if the matched order is a non-test event_bundle (same policy as completed).
    if (!obj.refunded) return ok({ ignored: "partial refund, review by hand" });
    const pi = obj.payment_intent;
    if (!pi) return ok({ ignored: "no payment_intent" });
    const { data: existing } = await db.from("preorders").select("id, email, product, test_run, status").eq("payment_intent", pi).maybeSingle();
    if (!existing || existing.product !== "event_bundle") return ok({ ignored: "not event_bundle order" });
    if (!ON && existing.test_run !== "event_bundle_test") return ok({ ignored: "flag off" });
    if (existing.status === "refunded") return ok({ ok: true, refunded: true, idempotent: true });
    const { data: row } = await db.from("preorders").update({ status: "refunded", refunded_at: new Date().toISOString() }).eq("id", existing.id).eq("status", "paid").select("id, email").maybeSingle();
    if (row?.email) {
      // Keep access if the same email still has another paid bundle order.
      const { count } = await db.from("preorders").select("id", { count: "exact", head: true }).eq("email", row.email).eq("product", "event_bundle").eq("status", "paid");
      if (!count) {
        const { data: ents } = await db.from("entitlements").update({ revoked_at: new Date().toISOString(), revoke_reason: "refund" }).eq("email_lower", row.email.toLowerCase()).eq("product", PRODUCT).is("revoked_at", null).select("id");
        for (const ent of ents ?? []) {
          await db.from("guide_sequence_state").update({ stopped_at: new Date().toISOString(), stop_reason: "refund" }).eq("entitlement_id", ent.id).is("stopped_at", null);
          await db.from("guide_email_queue").update({ status: "stopped", skip_reason: "refund" }).eq("entitlement_id", ent.id).eq("status", "pending");
        }
      }
    }
    return ok({ ok: true, refunded: !!row, already: !row });
  }
  return ok({ ignored: event.type });
});
