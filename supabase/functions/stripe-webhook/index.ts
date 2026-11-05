// =====================================================================
// stripe-webhook — Never Fight or Argue Again
//
// Stripe calls this after Checkout and refunds.
//   • Gift a Signed Copy  → row in gift_purchases
//   • Sponsorship         → matching sponsor_commitments row marked paid
//   • Preorder / event singles (kind=preorder) → preorders (stores payment_intent)
//   • Event Frameworks Bundle (kind=event_bundle) → ignored here (dedicated Stripe endpoint)
//   • charge.refunded → event singles by payment_intent; event_bundle ignored (dedicated endpoint)
// Book orders (metadata.kind=book_order) are forwarded to book-order-webhook.
// Signature is verified with STRIPE_WEBHOOK_SECRET (set in function secrets).
// Deploy:  supabase functions deploy stripe-webhook --no-verify-jwt
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "hello@neverfightorargue.com";
const FROM_NAME = Deno.env.get("FROM_NAME") ?? "Larry & Ro";
const NOTIFY_EMAIL = Deno.env.get("NOTIFY_EMAIL") ?? "hello@neverfightorargue.com";

// Payment links → what they are. (Metadata is also on the session; this is the fallback.)
const LINKS: Record<string, { kind: "gift" | "sponsorship"; tier?: string }> = {
  plink_1UHPTjLCCdJWrOprpiEJVpzr: { kind: "gift" },
  plink_1UHQDHLCCdJWrOprZUqDVRQ3: { kind: "sponsorship", tier: "gift" },
  plink_1UHQDHLCCdJWrOprEnZ4U588: { kind: "sponsorship", tier: "reception" },
  plink_1UHQDGLCCdJWrOprxnWgLUZw: { kind: "sponsorship", tier: "community" },
  plink_1UHQDGLCCdJWrOprtXNcKDGn: { kind: "sponsorship", tier: "silver" },
  plink_1UHQDFLCCdJWrOprW9P4jMUT: { kind: "sponsorship", tier: "gold" },
  plink_1UHQDELCCdJWrOprRhgiLpw5: { kind: "sponsorship", tier: "presenting" },
};

async function sendEmail(to: string, subject: string, html: string) {
  if (!BREVO_API_KEY) return false;
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender: { name: FROM_NAME, email: FROM_EMAIL }, replyTo: { email: Deno.env.get("REPLY_TO") ?? "larry@kdmcommunity.com" }, to: [{ email: to }], subject, htmlContent: html }),
  });
  return res.ok;
}

function shellLite(inner: string) {
  return `<div style="background:#F7F3EA;padding:32px 16px;font-family:Georgia,'Times New Roman',serif;color:#16261C;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E4DCCB;padding:32px;">
      <p style="margin:0 0 22px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#8A6330;">Never Fight or Argue Again &middot; Book launch</p>
      <div style="font-size:16px;line-height:1.6;">${inner}</div>
    </div>
    <p style="max-width:560px;margin:14px auto 0;font-size:12px;color:#5C6B60;text-align:center;">Grace Family Church &middot; 22920 FL-54, Lutz, FL 33549 &middot; Sunday, November 1, 2026, doors 5:30 pm</p>
  </div>`;
}

// --- Stripe signature check (HMAC-SHA256 over "t.payload") ---
async function verify(payload: string, header: string | null): Promise<boolean> {
  if (!WEBHOOK_SECRET || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = parts["t"], v1 = parts["v1"];
  if (!t || !v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false; // 5-minute tolerance
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === v1;
}

const TIER_NAMES: Record<string, string> = {
  presenting: "Presenting Sponsor", gold: "Gold Sponsor", silver: "Silver Sponsor",
  reception: "Reception Sponsor", gift: "Guest Gift Sponsor",
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });
  const payload = await req.text();
  if (!(await verify(payload, req.headers.get("stripe-signature")))) {
    return new Response("bad signature", { status: 400 });
  }
  let event: any;
  try { event = JSON.parse(payload); } catch { return new Response("bad json", { status: 400 }); }
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // charge.refunded: event_bundle → forward; event-channel singles → mark refunded by payment_intent
  if (event.type === "charge.refunded") {
    const charge = event.data.object;
    if (!charge.refunded) return new Response(JSON.stringify({ ignored: "partial refund" }), { status: 200 });
    const pi = charge.payment_intent;
    if (!pi) return new Response(JSON.stringify({ ignored: "no payment_intent" }), { status: 200 });

    // Prefer looking up order first so we know where to route
    const { data: order } = await db.from("preorders").select("id, product, channel, status, email").eq("payment_intent", pi).maybeSingle();
    // Bundle refunds: dedicated event-bundle-webhook endpoint already receives charge.refunded.
    if (order?.product === "event_bundle" || charge.metadata?.kind === "event_bundle") {
      return new Response(JSON.stringify({ ignored: "event_bundle refund owned by dedicated endpoint" }), { status: 200 });
    }
    if (order && order.channel === "event" && order.status === "paid") {
      const { data: row } = await db.from("preorders").update({
        status: "refunded", refunded_at: new Date().toISOString(),
      }).eq("id", order.id).eq("status", "paid").select("id").maybeSingle();
      return new Response(JSON.stringify({ ok: true, singles_refunded: !!row, id: row?.id ?? null }), { status: 200 });
    }
    if (order?.status === "refunded") {
      return new Response(JSON.stringify({ ok: true, idempotent: true }), { status: 200 });
    }
    return new Response(JSON.stringify({ ignored: "no matching event/preorder for refund" }), { status: 200 });
  }

  if (event.type !== "checkout.session.completed") return new Response(JSON.stringify({ ignored: event.type }), { status: 200 });

  const s = event.data.object;
  // Shipped signed-copy orders (book-checkout) are handled by book-order-webhook.
  if (s.metadata?.kind === "book_order") {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/book-order-webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "stripe-signature": req.headers.get("stripe-signature") ?? "" },
      body: payload,
    });
    return new Response(await r.text(), { status: r.status });
  }
  // Event Frameworks Bundle: dedicated Stripe endpoint hits event-bundle-webhook directly
  // (we_…ToVYKFeR). Do not forward here — duplicate delivery would double-send Brevo mail.
  if (s.metadata?.kind === "event_bundle") {
    return new Response(JSON.stringify({ ignored: "event_bundle owned by dedicated endpoint" }), { status: 200 });
  }
  if (s.payment_status && s.payment_status !== "paid") return new Response("not paid yet", { status: 200 });

  const meta = s.metadata ?? {};
  const known = LINKS[s.payment_link] ?? {};
  const kind = meta.kind === "gift_signed_copy" || known.kind === "gift" ? "gift" : meta.kind === "preorder" ? "preorder" : (meta.kind === "sponsorship" ? "sponsorship" : known.kind);
  const email = (s.customer_details?.email ?? s.customer_email ?? "").toLowerCase();
  const name = s.customer_details?.name ?? "";
  const amount = s.amount_total ?? 0; // cents
  const fields: Record<string, string> = {};
  for (const f of s.custom_fields ?? []) fields[f.key] = f.text?.value ?? f.dropdown?.value ?? f.numeric?.value ?? "";

  if (kind === "gift") {
    const quantity = Math.max(1, Math.round(amount / 2000));
    const { error } = await db.from("gift_purchases").upsert({
      stripe_session: s.id, email, name_on_card: fields.card_name ?? "", quantity, amount, status: "paid",
    }, { onConflict: "stripe_session" });
    if (error) console.error("gift save failed", error);
    const { data: tot } = await db.from("gift_count").select("*").single();
    await sendEmail(NOTIFY_EMAIL, `[GIFT] ${quantity} signed cop${quantity === 1 ? "y" : "ies"} — $${(amount / 100).toLocaleString()}${name ? ` — ${name}` : ""}`,
      `<p>${name || email} gifted <b>${quantity}</b> signed cop${quantity === 1 ? "y" : "ies"} ($${(amount / 100).toLocaleString()}).</p>
       <p>Name on the card: <b>${fields.card_name || "—"}</b><br>Email: ${email}</p>
       <p style="color:#5C6B60">Running total: ${tot?.copies ?? "?"} copies to set aside, $${tot?.dollars ?? "?"} given.</p>`);
    return new Response(JSON.stringify({ ok: true, kind, quantity }), { status: 200 });
  }

  if (kind === "preorder") {
    const quantity = Math.max(1, parseInt(meta.quantity ?? "0", 10) || Math.round(amount / 2000));
    const channel = meta.channel === "event" ? "event" : "preorder";
    const { data: saved, error } = await db.from("preorders").upsert({
      stripe_session: s.id, email, name, inscription: fields.inscription ?? "", quantity, amount, status: "paid", channel,
      payment_intent: s.payment_intent ?? null,
    }, { onConflict: "stripe_session" }).select("pickup_token").single();
    if (error) console.error("preorder save failed", error);
    const ticketUrl = `https://neverfightorargue.com/pickup/?t=${saved?.pickup_token ?? ""}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=8&color=0D2D1D&bgcolor=FFFFFF&data=${encodeURIComponent(ticketUrl)}`;
    if (channel === "event") {
      const esc = (v: string) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;");
      await sendEmail(NOTIFY_EMAIL, `[EVENT SALE] ${quantity} cop${quantity === 1 ? "y" : "ies"}, $${(amount / 100).toLocaleString()}, ${name || email}`,
        `<p><b>${esc(name || email)}</b> bought <b>${quantity}</b> cop${quantity === 1 ? "y" : "ies"} at the event ($${(amount / 100).toLocaleString()}).</p>
         <p>Sign it to: <b>${esc(fields.inscription || "(none)")}</b><br>Email: ${esc(email)}</p>`);
      if (email) await sendEmail(email, "Your book receipt: show this at the book table",
        shellLite(`<p style="margin:0 0 18px;">Hi ${name ? esc(name.split(" ")[0]) + "," : "there,"}</p>
          <p style="margin:0 0 18px;">Thank you so much! Your payment went through for <b>${quantity} signed cop${quantity === 1 ? "y" : "ies"}</b> of <i>Never Fight or Argue Again</i>${fields.inscription ? `, signed to <i>${esc(fields.inscription)}</i>` : ""}.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border:2px solid #C39A5E;background:#F7F1E4;margin:0 0 18px;">
            <tr><td style="padding:18px 20px;text-align:center;">
              <p style="margin:0 0 6px;font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#8A6330;">Your book table receipt</p>
              <a href="${ticketUrl}"><img src="${qrUrl}" width="200" height="200" alt="Your receipt QR code" style="display:block;margin:0 auto 10px;border:6px solid #fff;"></a>
              <p style="margin:0 0 8px;font-size:15px;"><b>Show this QR at the book table</b> and we'll hand you your book${quantity === 1 ? "" : "s"} right away.</p>
              <p style="margin:0;font-size:14px;"><a href="${ticketUrl}" style="color:#8A6330;">Open your receipt</a></p>
            </td></tr>
          </table>
          <p style="margin:0 0 18px;">We're so glad you're here tonight. Your Stripe receipt is in a separate email.</p>
          <p style="margin:0;">Larry &amp; Ro</p>`));
      return new Response(JSON.stringify({ ok: true, kind, channel, quantity }), { status: 200 });
    }
    const { data: tot } = await db.from("preorder_count").select("*").single();
    await sendEmail(NOTIFY_EMAIL, `[PRE-ORDER] ${quantity} signed cop${quantity === 1 ? "y" : "ies"} — ${name || email}`,
      `<p><b>${name || email}</b> pre-ordered <b>${quantity}</b> signed cop${quantity === 1 ? "y" : "ies"} ($${(amount / 100).toLocaleString()}) — Beat the Line.</p>
       <p>Sign it to: <b>${fields.inscription || "—"}</b><br>Email: ${email}</p>
       <p style="color:#5C6B60">Running total: ${tot?.copies ?? "?"} pre-ordered copies to sign and set aside at the express table, plus ${tot?.orders ?? "?"} laminated Frameworks Bundles. $${tot?.dollars ?? "?"} so far.</p>`);
    await sendEmail(email, "You beat the line — see you November 1st",
      shellLite(`<p style="margin:0 0 18px;">Hi ${name ? name.split(" ")[0] + "," : "there,"}</p>
        <p style="margin:0 0 18px;">Thank you &mdash; your pre-order is in. Here's what's waiting for you on <b>Sunday, November 1st</b> at Grace Family Church:</p>
        <ul style="margin:0 0 18px;padding-left:20px;line-height:1.7;">
          <li><b>${quantity} signed cop${quantity === 1 ? "y" : "ies"}</b>${fields.inscription ? ` &mdash; signed to <i>${String(fields.inscription).replace(/</g, "&lt;")}</i>` : ""}, ready at the <b>express pickup table</b>. No line.</li>
          <li><b>Reserved seating</b> in the front section &mdash; give your name at the door.</li>
          <li>The <b>laminated Frameworks Bundle</b> &mdash; the tools we teach in the classroom that aren't printed in the book.</li>
        </ul>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border:2px solid #C39A5E;background:#F7F1E4;margin:0 0 18px;">
          <tr><td style="padding:18px 20px;text-align:center;">
            <p style="margin:0 0 6px;font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#8A6330;">Your express pickup pass</p>
            <a href="${ticketUrl}"><img src="${qrUrl}" width="200" height="200" alt="Your pickup QR code" style="display:block;margin:0 auto 10px;border:6px solid #fff;"></a>
            <p style="margin:0 0 8px;font-size:15px;"><b>Show this at the express table</b> on the night &mdash; from this email, or from the link below. Save it now so it's easy to find.</p>
            <p style="margin:0;font-size:14px;"><a href="${ticketUrl}" style="color:#8A6330;">Open your pickup pass</a></p>
          </td></tr>
        </table>
        <p style="margin:0 0 18px;">Doors open at 5:30. Come a little early if you can so you can mingle and settle in. Your Stripe receipt is in a separate email.</p>
        <p style="margin:0;">&mdash; Larry &amp; Ro</p>`));
    return new Response(JSON.stringify({ ok: true, kind, quantity }), { status: 200 });
  }

  if (kind === "sponsorship") {
    const tierKey = meta.tier ?? known.tier ?? "";
    const tierName = TIER_NAMES[tierKey] ?? tierKey;
    // Match the reservation: same email and (if we know it) same tier; else most recent pending for that email.
    let q = db.from("sponsor_commitments").select("id, tier, business, contact, status").eq("email", email).order("created_at", { ascending: false });
    const { data: rows } = await q;
    const match = (rows ?? []).find((r) => tierName && r.tier === tierName && r.status !== "paid") ?? (rows ?? []).find((r) => r.status !== "paid") ?? (rows ?? [])[0];
    if (match) {
      await db.from("sponsor_commitments").update({ status: "paid", paid_at: new Date().toISOString(), stripe_session: s.id, paid_amount: amount }).eq("id", match.id);
    } else {
      // Paid without reserving (e.g. Larry sent a link directly). Record it so the list is complete.
      await db.from("sponsor_commitments").insert({
        email, contact: name, business: fields.business ?? "", tier: tierName || "Sponsorship", amount: Math.round(amount / 100),
        quantity: 1, pay_pref: "card", status: "paid", paid_at: new Date().toISOString(), stripe_session: s.id, paid_amount: amount, source: "stripe",
      });
    }
    await sendEmail(NOTIFY_EMAIL, `[PAID] ${tierName} — ${fields.business || match?.business || name || email} — $${(amount / 100).toLocaleString()}`,
      `<p><b>${fields.business || match?.business || name || email}</b> paid for the <b>${tierName}</b> ($${(amount / 100).toLocaleString()}).</p>
       <p>Contact: ${match?.contact || name || "—"}<br>Email: ${email}</p>
       <p style="color:#5C6B60">${match ? "Their reservation is now marked paid." : "No matching reservation was found — a paid row has been added."} Next: ask for their logo if you haven't already.</p>`);
    return new Response(JSON.stringify({ ok: true, kind, matched: !!match }), { status: 200 });
  }

  return new Response(JSON.stringify({ ignored: "unknown link" }), { status: 200 });
});
