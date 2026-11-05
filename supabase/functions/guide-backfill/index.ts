// =====================================================================
// guide-backfill - Past-buyer Companion Guide gift (BUILD + gated send)
// For paid preorder/launch-day book buyers who do NOT already have the
// companion_guide entitlement.
//
// Per recipient (Larry correction Nov 5, 2026):
//   1) Grant companion_guide entitlement (source=past_buyer_gift)
//   2) Send the gift email (past-buyer-gift-email-v1.md, copy approved)
//   3) Enroll the FULL 13-step guide sequence timed from the gift send
//      (Day 1 "Pick up where you left off" + weeks 1-12)
// Does NOT create a preorder, pickup QR, pickup token, or send the
// buyer pickup email ("Your books are ready at the table").
// Day 1 / gift guide link uses entitlements.claim_token -> /guide/?t=...
// so set-password works without a pickup token. Fallback: /members/.
//
// Flags:
//   GUIDE_BACKFILL_ON must be "1" for real sends (default off).
//   Dry-run is always allowed (no emails, no live entitlements).
//   Throwaway test rows (is_test) may send while the flag is off,
//   always with a "[TEST] " subject prefix.
// Daily budget: shares GUIDE_SEQUENCE_DAILY_BUDGET (~100) with the
// sequence via guide_mail_sent_today().
// Deploy: supabase functions deploy guide-backfill --no-verify-jwt
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { giftEmail, SUBJECT } from "./gift-email.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") ?? "";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://neverfightorargue.com";
const ON = Deno.env.get("GUIDE_BACKFILL_ON") === "1";
const DAILY_BUDGET = Math.max(1, parseInt(Deno.env.get("GUIDE_SEQUENCE_DAILY_BUDGET") ?? "100", 10) || 100);
const PRODUCT = "companion_guide";
const SOURCE = "past_buyer_gift";
const COHORT = "past_buyer_gift";

const ok = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

function firstName(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (!n) return "";
  return n.split(/\s+/)[0];
}

type Db = ReturnType<typeof createClient>;

async function sendBrevo(to: string, subject: string, html: string): Promise<{ ok: boolean; messageId: string | null; err?: string }> {
  if (!BREVO_API_KEY) return { ok: false, messageId: null, err: "no BREVO_API_KEY" };
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: "Larry & Ro", email: "hello@neverfightorargue.com" },
      replyTo: { email: Deno.env.get("REPLY_TO") ?? "hello@neverfightorargue.com" },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });
  const text = await res.text();
  let messageId: string | null = null;
  try { messageId = JSON.parse(text).messageId ?? null; } catch { /* ignore */ }
  if (!res.ok) {
    console.error("Brevo error", res.status, text);
    return { ok: false, messageId, err: `brevo ${res.status}` };
  }
  return { ok: true, messageId };
}

async function sentToday(db: Db): Promise<number> {
  const { data, error } = await db.rpc("guide_mail_sent_today");
  if (!error && typeof data === "number") return data;
  const { data: d2 } = await db.rpc("guide_sequence_sent_today");
  return typeof d2 === "number" ? d2 : 0;
}

type Recipient = { email: string; name?: string; source?: string };

async function grantAndEnroll(db: Db, email: string, name: string, isTest: boolean) {
  const emailLower = email.toLowerCase().trim();
  const claimToken = crypto.randomUUID();
  const now = new Date().toISOString();
  const { data: ent, error } = await db.from("entitlements").upsert({
    email_lower: emailLower,
    product: PRODUCT,
    source: SOURCE,
    claim_token: claimToken,
    preorder_id: null,
    granted_at: now,
    revoked_at: null,
    revoke_reason: null,
  }, { onConflict: "email_lower,product" }).select("id, claim_token").single();
  if (error || !ent) {
    console.error("entitlement upsert failed", error);
    return null;
  }
  // Ensure claim_token is set even if the row already existed without one.
  let token = ent.claim_token as string | null;
  if (!token) {
    const { data: fixed } = await db.from("entitlements").update({ claim_token: claimToken }).eq("id", ent.id).is("claim_token", null).select("claim_token").single();
    token = fixed?.claim_token ?? claimToken;
  }
  // Full 13-step sequence from gift send (granted_at). No Day 1 skip.
  await db.rpc("enroll_guide_sequence", { p_entitlement_id: ent.id });
  await db.from("guide_sequence_state").update({
    buyer_name: name || null,
    cohort: COHORT,
    is_test: isTest,
  }).eq("entitlement_id", ent.id);
  // Mark queue rows as test when this is a throwaway, so they can send while GUIDE_SEQUENCE_ON is off.
  if (isTest) {
    await db.from("guide_email_queue").update({ is_test: true }).eq("entitlement_id", ent.id);
  }
  return { entitlementId: ent.id as string, claimToken: token as string, grantedAt: now };
}

function urlsFor(claimToken: string | null) {
  const guideUrl = claimToken ? `${SITE_URL}/guide/?t=${claimToken}` : `${SITE_URL}/members/`;
  return {
    guideUrl,
    signinUrl: `${SITE_URL}/members/`,
    forgotUrl: `${SITE_URL}/members/`,
  };
}

async function dryRun(db: Db, recipients: Recipient[]) {
  const sample = recipients[0] ?? { email: "sample@example.com", name: "Alex", source: "preorder" };
  const demoToken = "00000000-0000-4000-8000-000000000001";
  const u = urlsFor(demoToken);
  const rendered = giftEmail({
    firstName: firstName(sample.name),
    ...u,
    testPrefix: "[DRY RUN] ",
  });
  const noName = giftEmail({ firstName: "", ...u, testPrefix: "[DRY RUN] " });
  const used = await sentToday(db);
  const remaining = Math.max(0, DAILY_BUDGET - used);
  const n = recipients.length;
  const daysNeeded = remaining > 0 ? Math.ceil(n / Math.min(DAILY_BUDGET, Math.max(remaining, 1))) : n;
  return ok({
    ok: true,
    mode: "dry_run",
    flag_on: ON,
    daily_budget: DAILY_BUDGET,
    sent_today: used,
    remaining_today: remaining,
    recipient_count: n,
    days_needed_at_budget: Math.ceil(n / DAILY_BUDGET),
    note: "Dry run only. No emails sent. No live entitlements or enrollments for real buyers. Gift copy is Larry-approved; list+count still need his OK before GUIDE_BACKFILL_ON=1.",
    larry_correction: "Past buyers get the FULL 13-step sequence (Day 1 + weeks 1-12) timed from the gift send. No pickup email, QR, token, or preorder row. Guide link uses claim_token or /members/.",
    gift_subject: SUBJECT,
    sample_subject: rendered.subject,
    sample_guide_url: u.guideUrl,
    sample_no_name_greeting_ok: noName.html.includes(">Hi,<"),
    recipients_preview: recipients.slice(0, 5),
  });
}

async function runBackfill(db: Db, recipients: Recipient[], isTest: boolean) {
  if (!ON && !isTest) {
    return ok({ ok: false, error: "GUIDE_BACKFILL_ON is off. Dry-run or throwaway test only." }, 403);
  }
  let budgetLeft = Math.max(0, DAILY_BUDGET - await sentToday(db));
  const results = { granted: 0, emailed: 0, enrolled: 0, skipped: 0, failed: 0, budget_left: budgetLeft, details: [] as unknown[] };
  for (const r of recipients) {
    if (budgetLeft <= 0) break;
    const email = (r.email || "").toLowerCase().trim();
    if (!email || !email.includes("@")) {
      results.skipped++;
      continue;
    }
    // Skip if already gifted (sent log) unless test.
    if (!isTest) {
      const { data: prior } = await db.from("guide_backfill_log").select("id").eq("email_lower", email).eq("status", "sent").maybeSingle();
      if (prior) { results.skipped++; continue; }
      const { data: existing } = await db.from("entitlements").select("id, source").eq("email_lower", email).eq("product", PRODUCT).is("revoked_at", null).maybeSingle();
      if (existing && existing.source !== SOURCE) {
        // Already has guide from event_bundle / stripe - do not re-gift.
        await db.from("guide_backfill_log").insert({
          email_lower: email, name: r.name ?? null, source: r.source ?? null,
          status: "skipped", skip_reason: "already_has_entitlement", is_test: false,
        });
        results.skipped++;
        continue;
      }
    }

    const granted = await grantAndEnroll(db, email, r.name ?? "", isTest);
    if (!granted) {
      results.failed++;
      await db.from("guide_backfill_log").insert({
        email_lower: email, name: r.name ?? null, source: r.source ?? null,
        status: "failed", skip_reason: "entitlement_failed", is_test: isTest,
      });
      continue;
    }
    results.granted++;
    results.enrolled++;
    const u = urlsFor(granted.claimToken);
    const rendered = giftEmail({
      firstName: firstName(r.name),
      ...u,
      testPrefix: isTest ? "[TEST] " : "",
    });
    const sent = await sendBrevo(email, rendered.subject, rendered.html);
    if (sent.ok) {
      results.emailed++;
      budgetLeft--;
      await db.from("guide_backfill_log").insert({
        email_lower: email, name: r.name ?? null, source: r.source ?? null,
        entitlement_id: granted.entitlementId, claim_token: granted.claimToken,
        status: isTest ? "test" : "sent", brevo_message_id: sent.messageId,
        is_test: isTest, sent_at: new Date().toISOString(),
      });
      results.details.push({ email, entitlement_id: granted.entitlementId, claim_token: granted.claimToken, guideUrl: u.guideUrl, messageId: sent.messageId });
    } else {
      results.failed++;
      await db.from("guide_backfill_log").insert({
        email_lower: email, name: r.name ?? null, source: r.source ?? null,
        entitlement_id: granted.entitlementId, claim_token: granted.claimToken,
        status: "failed", skip_reason: sent.err ?? "brevo_failed", is_test: isTest,
      });
    }
  }
  results.budget_left = budgetLeft;
  return ok({ ok: true, mode: isTest ? "test" : "run", flag_on: ON, daily_budget: DAILY_BUDGET, ...results });
}

async function cleanupThrowaway(db: Db, email: string) {
  const emailLower = email.toLowerCase().trim();
  const { data: ent } = await db.from("entitlements").select("id").eq("email_lower", emailLower).eq("product", PRODUCT).eq("source", SOURCE).maybeSingle();
  if (ent) {
    await db.from("guide_email_queue").delete().eq("entitlement_id", ent.id);
    await db.from("guide_sequence_state").delete().eq("entitlement_id", ent.id);
    await db.from("entitlements").delete().eq("id", ent.id);
  }
  await db.from("guide_backfill_log").delete().eq("email_lower", emailLower).eq("is_test", true);
  return ok({ ok: true, cleaned: emailLower, entitlement_id: ent?.id ?? null });
}

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") return ok({ ok: false }, 405);
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  let body: Record<string, unknown> = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch { /* empty */ }
  }
  const action = typeof body.action === "string" ? body.action : "dry_run";
  const recipients = Array.isArray(body.recipients) ? (body.recipients as Recipient[]) : [];

  if (action === "dry_run") return await dryRun(db, recipients);
  if (action === "render_sample") {
    const name = typeof body.name === "string" ? body.name : "Alex";
    const u = urlsFor("00000000-0000-4000-8000-000000000001");
    const withName = giftEmail({ firstName: firstName(name), ...u });
    const noName = giftEmail({ firstName: "", ...u });
    return ok({ ok: true, subject: SUBJECT, with_name: withName, no_name: noName });
  }
  if (action === "test_throwaway") {
    // Only allow a clearly fake throwaway inbox, never a real buyer.
    const to = String(body.to ?? "guide-backfill-throwaway@neverfightorargue.com").toLowerCase();
    if (!to.includes("throwaway") && to !== "larrybeacham@gmail.com") {
      return ok({ ok: false, error: "test_throwaway requires a throwaway address or larrybeacham@gmail.com" }, 400);
    }
    const name = typeof body.name === "string" ? body.name : "Test";
    return await runBackfill(db, [{ email: to, name, source: "throwaway" }], true);
  }
  if (action === "cleanup_throwaway") {
    const to = String(body.to ?? "").toLowerCase();
    if (!to) return ok({ ok: false, error: "to required" }, 400);
    return await cleanupThrowaway(db, to);
  }
  if (action === "run") {
    if (!recipients.length) return ok({ ok: false, error: "recipients required" }, 400);
    return await runBackfill(db, recipients, false);
  }
  return ok({ ok: false, error: `unknown action ${action}` }, 400);
});
