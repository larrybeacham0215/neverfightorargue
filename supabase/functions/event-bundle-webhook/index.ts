// =====================================================================
// event-bundle-webhook - Never Fight or Argue Again, event weekend
// Handles ONLY metadata.kind=event_bundle:
//   checkout.session.completed -> preorders row (channel=event, quantity = 2 x bundles,
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
  if (obj.metadata?.kind !== "event_bundle") return ok({ ignored: "not event_bundle" });
  if (!ON && obj.metadata?.test_run !== "event_bundle_test") return ok({ ignored: "flag off" });
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  if (event.type === "checkout.session.completed") {
    const s = obj;
    if (s.payment_status !== "paid") return ok({ ignored: "not paid" });
    const bundles = Math.max(1, parseInt(s.metadata.bundles ?? "1", 10) || 1);
    const email = (s.customer_details?.email ?? s.customer_email ?? "").toLowerCase();
    const name = s.customer_details?.name || s.metadata.buyer_name || "";
    const fields: Record<string, string> = {};
    for (const f of s.custom_fields ?? []) fields[f.key] = f.text?.value ?? "";
    const { data: row, error } = await db.from("preorders").upsert({
      stripe_session: s.id, email, name, inscription: fields.inscription ?? "", quantity: bundles * 2, bundles,
      product: "event_bundle", amount: s.amount_total ?? 0, status: "paid", channel: "event",
      payment_intent: s.payment_intent ?? null, test_run: s.metadata.test_run ?? null,
    }, { onConflict: "stripe_session" }).select("id, pickup_token").single();
    if (error || !row) { console.error("save failed", error); return new Response("save failed", { status: 500 }); }
    if (email) await db.from("entitlements").upsert({ email_lower: email, product: PRODUCT, stripe_session: s.id, preorder_id: row.id, granted_at: new Date().toISOString(), revoked_at: null, revoke_reason: null }, { onConflict: "email_lower,product" });
    const ticketUrl = `${SITE_URL}/pickup/?t=${row.pickup_token}`, guideUrl = `${SITE_URL}/guide/?t=${row.pickup_token}`;
    const tag = s.metadata.test_run ? "[TEST] " : "";
    await sendEmail(NOTIFY_EMAIL, `${tag}[EVENT BUNDLE] ${bundles} bundle${bundles === 1 ? "" : "s"} (${bundles * 2} books), $${((s.amount_total ?? 0) / 100).toFixed(2)}, ${name || email}`,
      `<p><b>${name || email}</b> bought ${bundles} Event Bundle${bundles === 1 ? "" : "s"} (${bundles * 2} books). Sign to: ${fields.inscription || "(none)"}.</p>`);
    if (email) {
      // Unsubscribe link only exists for newsletter subscribers (subscribers.unsubscribe_token).
      const { data: sub } = await db.from("subscribers").select("unsubscribe_token").eq("email", email).is("unsubscribed_at", null).maybeSingle();
      const unsubUrl = sub?.unsubscribe_token ? `${SITE_URL}/unsubscribe/?t=${sub.unsubscribe_token}` : null;
      await sendEmail(email, `${tag}${SUBJECT}`, bundleEmail({ name, bundles, books: bundles * 2, inscription: fields.inscription ?? "", ticketUrl, guideUrl, unsubUrl }));
    }
    return ok({ ok: true, bundles });
  }

  if (event.type === "charge.refunded") {
    if (!obj.refunded) return ok({ ignored: "partial refund, review by hand" });
    const { data: row } = await db.from("preorders").update({ status: "refunded", refunded_at: new Date().toISOString() }).eq("payment_intent", obj.payment_intent).select("id, email").maybeSingle();
    if (row?.email) {
      // Keep access if the same email still has another paid bundle order.
      const { count } = await db.from("preorders").select("id", { count: "exact", head: true }).eq("email", row.email).eq("product", "event_bundle").eq("status", "paid");
      if (!count) await db.from("entitlements").update({ revoked_at: new Date().toISOString(), revoke_reason: "refund" }).eq("email_lower", row.email.toLowerCase()).eq("product", PRODUCT);
    }
    return ok({ ok: true, refunded: !!row });
  }
  return ok({ ignored: event.type });
});
