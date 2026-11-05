// =====================================================================
// guide-sequence - Companion Guide follow-up emails (13 steps)
// Day 1, then weekly weeks 1-12, timed from each buyer's purchase.
// Called hourly by pg_cron. Sends through Brevo from hello@.
// Flag: GUIDE_SEQUENCE_ON must be "1" for real buyers (default off).
// Test orders (preorders.test_run set) may send while the flag is off,
// always with a "[TEST] " subject prefix. Daily budget ~100 (shared
// Brevo 300/day cap with KDM); extras stay pending for the next run.
// Deploy: supabase functions deploy guide-sequence --no-verify-jwt
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { STEPS, renderGuideEmail, type Step } from "./templates.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") ?? "";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://neverfightorargue.com";
const ON = Deno.env.get("GUIDE_SEQUENCE_ON") === "1";
const DAILY_BUDGET = Math.max(1, parseInt(Deno.env.get("GUIDE_SEQUENCE_DAILY_BUDGET") ?? "100", 10) || 100);
const PRODUCT = "companion_guide";

const ok = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

function firstName(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (!n) return "";
  return n.split(/\s+/)[0];
}

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
  try {
    const j = JSON.parse(text);
    messageId = j.messageId ?? null;
  } catch { /* ignore */ }
  if (!res.ok) {
    console.error("Brevo error", res.status, text);
    return { ok: false, messageId, err: `brevo ${res.status}` };
  }
  return { ok: true, messageId };
}

type Db = ReturnType<typeof createClient>;

async function enrollOne(db: Db, entitlementId: string, preorderId: string | null, emailLower: string, purchasedAt: string, isTest: boolean) {
  const { data: state, error: stErr } = await db.from("guide_sequence_state").upsert({
    entitlement_id: entitlementId,
    email_lower: emailLower,
    is_test: isTest,
  }, { onConflict: "entitlement_id" }).select("unsub_token, stopped_at").single();
  if (stErr || !state) {
    console.error("enroll state failed", stErr);
    return 0;
  }
  const base = new Date(purchasedAt).getTime();
  const rows = STEPS.map((s) => ({
    entitlement_id: entitlementId,
    preorder_id: preorderId,
    email_lower: emailLower,
    step: s.step,
    step_num: s.stepNum,
    due_at: new Date(base + s.offsetDays * 86400000).toISOString(),
    status: "pending",
    is_test: isTest,
  }));
  const { error } = await db.from("guide_email_queue").upsert(rows, {
    onConflict: "entitlement_id,step",
    ignoreDuplicates: true,
  });
  if (error) {
    console.error("enroll queue failed", error);
    return 0;
  }
  return rows.length;
}

async function backfillEnrollments(db: Db) {
  // Active companion_guide entitlements missing a sequence state row.
  const { data: ents } = await db.from("entitlements").select("id, email_lower, preorder_id, granted_at, revoked_at").eq("product", PRODUCT).is("revoked_at", null);
  let enrolled = 0;
  for (const e of ents ?? []) {
    const { data: existing } = await db.from("guide_sequence_state").select("entitlement_id").eq("entitlement_id", e.id).maybeSingle();
    if (existing) continue;
    let isTest = false;
    let purchasedAt = e.granted_at;
    let preorderId = e.preorder_id;
    if (e.preorder_id) {
      const { data: p } = await db.from("preorders").select("id, test_run, created_at, status").eq("id", e.preorder_id).maybeSingle();
      if (p) {
        isTest = !!p.test_run;
        purchasedAt = p.created_at ?? purchasedAt;
        if (p.status === "refunded") continue;
      }
    }
    enrolled += await enrollOne(db, e.id, preorderId, e.email_lower, purchasedAt, isTest);
  }
  return enrolled;
}

async function sentTodayCount(db: Db): Promise<number> {
  // America/New_York calendar day, matching Larry's zone.
  const { data, error } = await db.rpc("guide_sequence_sent_today");
  if (error) {
    console.error("sent_today rpc failed", error);
    // Fallback: last 24h
    const since = new Date(Date.now() - 86400000).toISOString();
    const { count } = await db.from("guide_email_queue").select("id", { count: "exact", head: true }).eq("status", "sent").gte("sent_at", since);
    return count ?? 0;
  }
  return typeof data === "number" ? data : 0;
}

async function stopSequence(db: Db, entitlementId: string, reason: string) {
  await db.from("guide_sequence_state").update({ stopped_at: new Date().toISOString(), stop_reason: reason }).eq("entitlement_id", entitlementId).is("stopped_at", null);
  await db.from("guide_email_queue").update({ status: "stopped", skip_reason: reason }).eq("entitlement_id", entitlementId).eq("status", "pending");
}

async function processDue(db: Db) {
  const results = { sent: 0, failed: 0, stopped: 0, budget_left: 0 };
  let budgetLeft = Math.max(0, DAILY_BUDGET - await sentTodayCount(db));
  results.budget_left = budgetLeft;
  if (budgetLeft <= 0) return results;

  // Due pending rows, oldest first. Real buyers only when flag on; tests always eligible.
  let q = db.from("guide_email_queue").select("id, entitlement_id, preorder_id, email_lower, step, is_test, due_at").eq("status", "pending").lte("due_at", new Date().toISOString()).order("due_at", { ascending: true }).limit(Math.min(budgetLeft, 50));
  if (!ON) q = q.eq("is_test", true);
  const { data: due, error } = await q;
  if (error) {
    console.error("due query failed", error);
    return results;
  }

  for (const row of due ?? []) {
    if (budgetLeft <= 0) break;

    const { data: state } = await db.from("guide_sequence_state").select("unsub_token, stopped_at, stop_reason").eq("entitlement_id", row.entitlement_id).maybeSingle();
    if (state?.stopped_at) {
      await db.from("guide_email_queue").update({ status: "stopped", skip_reason: state.stop_reason ?? "stopped" }).eq("id", row.id);
      results.stopped++;
      continue;
    }

    const { data: ent } = await db.from("entitlements").select("id, revoked_at, revoke_reason, preorder_id").eq("id", row.entitlement_id).maybeSingle();
    if (!ent || ent.revoked_at) {
      await stopSequence(db, row.entitlement_id, ent?.revoke_reason ?? "revoked");
      results.stopped++;
      continue;
    }

    let name = "";
    let pickupToken: string | null = null;
    let preorderStatus = "paid";
    if (row.preorder_id) {
      const { data: p } = await db.from("preorders").select("name, pickup_token, status, test_run").eq("id", row.preorder_id).maybeSingle();
      if (p) {
        name = p.name ?? "";
        pickupToken = p.pickup_token;
        preorderStatus = p.status;
      }
    }
    if (preorderStatus === "refunded") {
      await stopSequence(db, row.entitlement_id, "refund");
      results.stopped++;
      continue;
    }

    const guideUrl = pickupToken ? `${SITE_URL}/guide/?t=${pickupToken}` : `${SITE_URL}/guide/`;
    const signinUrl = `${SITE_URL}/members/`;
    const forgotUrl = `${SITE_URL}/members/`;
    const unsubToken = state?.unsub_token;
    if (!unsubToken) {
      console.error("missing unsub token", row.entitlement_id);
      results.failed++;
      continue;
    }
    const unsubUrl = `${SITE_URL}/unsubscribe/?t=${unsubToken}`;
    // Test orders always get [TEST] ; real buyers never do (and only send when flag on).
    const { subject, html } = renderGuideEmail({
      step: row.step as Step,
      firstName: firstName(name),
      guideUrl,
      signinUrl,
      forgotUrl,
      unsubUrl,
      testPrefix: row.is_test ? "[TEST] " : "",
    });

    const sent = await sendBrevo(row.email_lower, subject, html);
    if (sent.ok) {
      await db.from("guide_email_queue").update({
        status: "sent",
        sent_at: new Date().toISOString(),
        brevo_message_id: sent.messageId,
      }).eq("id", row.id);
      results.sent++;
      budgetLeft--;
    } else {
      results.failed++;
    }
  }
  results.budget_left = budgetLeft;
  return results;
}

async function testDay1(db: Db, body: { to?: string; name?: string; pickup_token?: string }) {
  const to = (body.to ?? "larrybeacham@gmail.com").toLowerCase();
  // Only the named review inbox for this one-shot, so a bad call cannot spam buyers.
  if (to !== "larrybeacham@gmail.com") {
    return ok({ ok: false, error: "test_day1 only allowed to larrybeacham@gmail.com" }, 400);
  }
  const name = body.name ?? "Larry";
  let pickupToken = body.pickup_token ?? null;
  if (!pickupToken) {
    const { data: p } = await db.from("preorders").select("pickup_token").eq("test_run", "event_bundle_test").order("created_at", { ascending: false }).limit(1).maybeSingle();
    pickupToken = p?.pickup_token ?? null;
  }
  const guideUrl = pickupToken ? `${SITE_URL}/guide/?t=${pickupToken}` : `${SITE_URL}/guide/`;
  const { subject, html } = renderGuideEmail({
    step: "day1",
    firstName: firstName(name),
    guideUrl,
    signinUrl: `${SITE_URL}/members/`,
    forgotUrl: `${SITE_URL}/members/`,
    unsubUrl: `${SITE_URL}/unsubscribe/`,
    testPrefix: "[TEST] ",
  });
  const sent = await sendBrevo(to, subject, html);
  return ok({
    ok: sent.ok,
    action: "test_day1",
    to,
    subject,
    messageId: sent.messageId,
    err: sent.err ?? null,
    guideUrl,
  }, sent.ok ? 200 : 502);
}

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") return ok({ ok: false }, 405);
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  let body: Record<string, unknown> = {};
  if (req.method === "POST") {
    try {
      body = await req.json();
    } catch { /* empty body from cron */ }
  }

  if (body.action === "test_day1") {
    return await testDay1(db, body as { to?: string; name?: string; pickup_token?: string });
  }

  if (body.action === "enroll" && typeof body.entitlement_id === "string") {
    const { data: e } = await db.from("entitlements").select("id, email_lower, preorder_id, granted_at").eq("id", body.entitlement_id).maybeSingle();
    if (!e) return ok({ ok: false, error: "not found" }, 404);
    let isTest = false;
    let purchasedAt = e.granted_at;
    if (e.preorder_id) {
      const { data: p } = await db.from("preorders").select("test_run, created_at").eq("id", e.preorder_id).maybeSingle();
      if (p) {
        isTest = !!p.test_run;
        purchasedAt = p.created_at ?? purchasedAt;
      }
    }
    const n = await enrollOne(db, e.id, e.preorder_id, e.email_lower, purchasedAt, isTest);
    return ok({ ok: true, enrolled_steps: n });
  }

  const backfilled = await backfillEnrollments(db);
  const results = await processDue(db);
  return ok({ ok: true, flag_on: ON, daily_budget: DAILY_BUDGET, backfilled, ...results });
});
