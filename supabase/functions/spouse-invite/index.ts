// =====================================================================
// spouse-invite — forwardable Companion Guide seat for one spouse
//
//   GET  ?i=<token>  -> peek (non-consuming; safe for email scanners)
//   POST { action: "issue", parent_entitlement_id } + buyer Bearer
//   POST { action: "reissue", parent_entitlement_id } + buyer Bearer
//   POST { action: "redeem", invite, email, password, name? }
//
// Security:
//   - Token is 32 random bytes, hex; only sha256 stored (token_hash).
//   - Redeem is POST-only (GET never consumes).
//   - Atomic redeem via spouse_invite_redeem RPC (row locks).
//   - Existing Auth users must prove password; password is never overwritten.
//   - No guide_sequence / marketing enrollment; no preorder/pickup rows.
//   - Do not log raw tokens. Referrer-Policy set on responses.
// Deploy: supabase functions deploy spouse-invite --no-verify-jwt  (Larry approval)
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://neverfightorargue.com";
const ALLOWED = [SITE_URL, "https://www.neverfightorargue.com"];
const PRODUCT = "companion_guide";
// Hard gate: default OFF until Auth ownership proven + Larry enablement.
const ON = Deno.env.get("SPOUSE_INVITE_ON") === "1";
const MAX_BODY = 16 * 1024;
const RATE = 30;
const hits = new Map<string, number[]>();

function cors(origin: string | null) {
  const ok = origin && (ALLOWED.includes(origin) || origin.startsWith("http://localhost"));
  return {
    "Access-Control-Allow-Origin": ok ? origin! : SITE_URL,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Content-Type": "application/json",
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
  };
}

function limited(key: string) {
  const now = Date.now();
  const a = (hits.get(key) ?? []).filter((x) => now - x < 60000);
  a.push(now);
  hits.set(key, a);
  if (hits.size > 5000) hits.clear();
  return a.length > RATE;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function newInviteToken(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function inviteLooksValid(raw: string): boolean {
  return /^[0-9a-f]{64}$/i.test(raw);
}

Deno.serve(async (req) => {
  const headers = cors(req.headers.get("origin"));
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });

  const url = new URL(req.url);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---------- GET peek (never redeems) ----------
  if (req.method === "GET") {
    if (!ON) return json({ ok: false, usable: false, gated: true, error: "Spouse invites are not open yet." }, 503);
    const raw = (url.searchParams.get("i") ?? "").toLowerCase();
    if (!inviteLooksValid(raw)) return json({ ok: false, error: "This invite link is not valid." }, 403);
    if (limited("peek:" + raw.slice(0, 12))) return json({ ok: false, error: "Too many requests. Try again in a minute." }, 429);
    const hash = await sha256Hex(raw);
    const { data, error } = await db.rpc("spouse_invite_peek", { p_token_hash: hash });
    if (error) {
      console.error("spouse peek rpc failed");
      return json({ ok: false, error: "Could not check this invite." }, 500);
    }
    const peek = data as { ok?: boolean; status?: string; parent_active?: boolean; buyer_first_name?: string; error?: string };
    if (!peek?.ok) return json({ ok: false, error: "This invite link is not valid." }, 403);
    if (!peek.parent_active) {
      return json({ ok: true, status: peek.status, usable: false, error: "This invite is no longer available." });
    }
    if (peek.status !== "open") {
      return json({
        ok: true,
        status: peek.status,
        usable: false,
        buyer_first_name: peek.buyer_first_name || "",
        error: peek.status === "redeemed"
          ? "This invite was already used. Sign in at the members page if you already created your account."
          : "This invite is no longer valid.",
      });
    }
    return json({
      ok: true,
      status: "open",
      usable: true,
      buyer_first_name: peek.buyer_first_name || "",
      // Deliberately no emails, no parent ids, no token echo.
    });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!ON) return json({ ok: false, gated: true, error: "Spouse invites are not open yet." }, 503);

  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY) return json({ ok: false, error: "Too much at once." }, 413);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json({ ok: false, error: "Bad request" }, 400);
  }
  const action = String(body.action ?? "redeem");

  // ---------- issue / reissue (buyer Bearer) ----------
  if (action === "issue" || action === "reissue") {
    const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!bearer) return json({ ok: false, error: "Please sign in." }, 401);
    if (limited("iss:" + bearer.slice(-16))) return json({ ok: false, error: "Too many requests. Try again in a minute." }, 429);
    const { data: u } = await db.auth.getUser(bearer);
    if (!u?.user?.email) return json({ ok: false, error: "Please sign in again." }, 401);
    const email = u.user.email.toLowerCase();
    const parentId = String(body.parent_entitlement_id ?? "");
    // Two safe equality filters (no string-interpolated .or). Never use a spouse seat as parent.
    const { data: byUser } = await db
      .from("entitlements")
      .select("id, email_lower, revoked_at, role, parent_entitlement_id, user_id")
      .eq("product", PRODUCT)
      .is("revoked_at", null)
      .eq("user_id", u.user.id);
    const { data: byEmail } = await db
      .from("entitlements")
      .select("id, email_lower, revoked_at, role, parent_entitlement_id, user_id")
      .eq("product", PRODUCT)
      .is("revoked_at", null)
      .eq("email_lower", email);
    const seen = new Set<string>();
    const ents = [...(byUser ?? []), ...(byEmail ?? [])].filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
    const qualifying = ents.filter((e) => !e.parent_entitlement_id && (e.role ?? "buyer") !== "spouse");
    const parent = qualifying.find((e) => e.id === parentId) ?? qualifying[0];
    if (!parent) {
      return json({ ok: false, error: "No qualifying Companion Guide purchase found for your account." }, 403);
    }

    const token = newInviteToken();
    const hash = await sha256Hex(token);
    const rpc = action === "reissue" ? "spouse_invite_reissue" : "spouse_invite_issue";
    const intended = String(body.spouse_email ?? body.intended_email ?? "").trim().toLowerCase();
    if (action === "issue" && intended && !intended.includes("@")) {
      return json({ ok: false, error: "Enter a valid spouse email, or leave it blank." }, 400);
    }
    const args = action === "reissue"
      ? { p_parent_entitlement_id: parent.id, p_new_token_hash: hash }
      : { p_parent_entitlement_id: parent.id, p_token_hash: hash, p_created_by: "buyer", p_intended_email: intended || null };
    const { data, error } = await db.rpc(rpc, args);
    if (error) {
      console.error("spouse issue/reissue rpc failed");
      return json({ ok: false, error: "Could not create the invite." }, 500);
    }
    const res = data as { ok?: boolean; error?: string };
    if (!res?.ok) {
      const map: Record<string, string> = {
        slot_taken: "A spouse invite already exists for this purchase.",
        already_redeemed: "Your spouse already claimed their guide. You cannot create another seat.",
        parent_not_qualifying: "This purchase cannot invite a spouse.",
      };
      return json({ ok: false, error: map[res.error ?? ""] ?? "Could not create the invite." }, 409);
    }
    // Return plaintext token once. Never log it.
    return json({
      ok: true,
      parent_entitlement_id: parent.id,
      invite_url: `${SITE_URL}/guide/spouse/?i=${token}`,
      forwardable_text: forwardableText(token),
    });
  }

  // ---------- redeem ----------
  if (action !== "redeem") return json({ ok: false, error: "Bad request" }, 400);
  const invite = String(body.invite ?? body.i ?? "").toLowerCase();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const name = String(body.name ?? "").trim().slice(0, 80);
  if (!inviteLooksValid(invite)) return json({ ok: false, error: "This invite link is not valid." }, 403);
  if (!email || !email.includes("@")) return json({ ok: false, error: "Enter your email address." }, 400);
  if (password.length < 8 || password.length > 72) return json({ ok: false, error: "Use at least 8 characters for your password." }, 400);
  if (limited("red:" + invite.slice(0, 12))) return json({ ok: false, error: "Too many requests. Try again in a minute." }, 429);

  const hash = await sha256Hex(invite);
  const { data: peek } = await db.rpc("spouse_invite_peek", { p_token_hash: hash });
  const p = peek as { ok?: boolean; status?: string; parent_active?: boolean };
  if (!p?.ok || !p.parent_active || p.status !== "open") {
    return json({ ok: false, error: "This invite is not available." }, 403);
  }

  // Ownership / possession rules (no password overwrite, no auto-confirm takeover):
  // 1) Existing account: must sign in with current password. Never admin-update password.
  // 2) New email: use anon.signUp (sends confirmation when mailer on). Do NOT admin.createUser
  //    with email_confirm:true — that would claim arbitrary emails without possession proof.
  // 3) Redeem ONLY after a successful sign-in session (confirmed user). Unconfirmed signup
  //    returns needs_email_confirmation and does not create entitlements.
  let userId: string | null = null;
  let created = false;
  const sign = await anon.auth.signInWithPassword({ email, password });
  if (sign.data?.user && !sign.error) {
    const u = sign.data.user;
    // Reject unconfirmed sessions when the project requires confirmation.
    const confirmed = !!(u.email_confirmed_at || (u as { confirmed_at?: string }).confirmed_at);
    if (!confirmed && Deno.env.get("SPOUSE_REQUIRE_EMAIL_CONFIRMED") !== "0") {
      return json({
        ok: false,
        error: "Confirm your email before claiming this guide. Check your inbox.",
        needs_email_confirmation: true,
      }, 401);
    }
    userId = u.id;
  } else {
    // Sign-up path — confirmation email goes through project mailer (local sink in tests).
    const { data: su, error: se } = await anon.auth.signUp({
      email,
      password,
      options: { data: name ? { name } : {} },
    });
    if (se) {
      const exists = /already|registered|exists/i.test(se.message ?? "");
      if (exists) {
        return json({
          ok: false,
          error: "That email already has an account. Enter the password for that account to claim this guide. We will not change your password.",
          needs_existing_password: true,
        }, 401);
      }
      console.error("spouse signUp failed");
      return json({ ok: false, error: "Could not create your account. Please try again." }, 500);
    }
    // If project auto-confirms, session may be present; otherwise identities unconfirmed.
    if (su.session?.user) {
      userId = su.session.user.id;
      created = true;
    } else {
      return json({
        ok: false,
        error: "We sent a confirmation link to that email. Open it, then return here and claim with the same email and password.",
        needs_email_confirmation: true,
        created_pending: true,
      }, 401);
    }
  }

  const { data: redeemed, error: rerr } = await db.rpc("spouse_invite_redeem", {
    p_token_hash: hash,
    p_spouse_email: email,
    p_user_id: userId,
    p_spouse_name: name,
  });
  if (rerr) {
    console.error("spouse redeem rpc failed");
    // If we just created a user and redeem failed, leave the Auth user (they can sign in later) — do not delete (destructive).
    return json({ ok: false, error: "Could not complete the claim. Please try again." }, 500);
  }
  const r = redeemed as { ok?: boolean; error?: string; entitlement_id?: string };
  if (!r?.ok) {
    const map: Record<string, [string, number]> = {
      already_used: ["This invite was already used.", 409],
      revoked: ["This invite is no longer valid.", 403],
      parent_inactive: ["This invite is no longer available.", 403],
      same_as_buyer: ["Use your own email, not the buyer’s email.", 400],
      email_already_entitled: ["This email already has Companion Guide access. Sign in at the members page.", 409],
      email_mismatch: ["This invite was issued for a different email address.", 403],
      invalid: ["This invite link is not valid.", 403],
    };
    const [msg, code] = map[r.error ?? ""] ?? ["Could not complete the claim.", 400];
    return json({ ok: false, error: msg }, code);
  }

  // Confirm no sequence enrollment slipped in.
  if (r.entitlement_id) {
    const { data: seq } = await db.from("guide_sequence_state").select("entitlement_id").eq("entitlement_id", r.entitlement_id).maybeSingle();
    if (seq) {
      // Defensive: remove accidental enrollment (should never insert).
      await db.from("guide_email_queue").delete().eq("entitlement_id", r.entitlement_id);
      await db.from("guide_sequence_state").delete().eq("entitlement_id", r.entitlement_id);
      console.error("spouse redeem unexpectedly had sequence state; removed");
    }
  }

  return json({
    ok: true,
    created,
    email,
    members_url: `${SITE_URL}/members/`,
    guide_url: `${SITE_URL}/guide/`,
  });
});

function forwardableText(token: string): string {
  const link = `${SITE_URL}/guide/spouse/?i=${token}`;
  return [
    "I’d like you to have your own Companion Guide for Never Fight or Argue Again.",
    "",
    "This link is only for you. Open it, enter YOUR email, and create YOUR password.",
    "Your answers stay private — we each get our own guide.",
    "",
    "Do not use my guide link or my password.",
    "",
    link,
    "",
    "Questions? hello@neverfightorargue.com",
  ].join("\n");
}
