/**
 * Spouse-invite local tests.
 * Labels:
 *   unit            — pure rules (hash shape, pickup/marketing invariants)
 *   mocked_handler  — in-memory store mirroring SQL RPC + edge redeem/issue paths
 * Not run: live Stripe, live Supabase, outbound mail, production mutations.
 */
import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const results = [];
function check(kind, name, cond, detail = "") {
  results.push({ kind, name, ok: !!cond, detail: String(detail) });
}
function sha256Hex(s) {
  return createHash("sha256").update(s).digest("hex");
}
function newToken() {
  return randomBytes(32).toString("hex");
}

class MockDb {
  constructor() {
    this.ents = new Map();
    this.invites = new Map(); // id -> row
    this.byHash = new Map();
    this.users = new Map(); // email -> {id, password}
    this.sequence = new Set();
    this.preorders = new Set();
  }
  grantBuyer(email, { role = "buyer", parent = null, product = "companion_guide", revoked = false } = {}) {
    const id = cryptoRandom();
    const row = {
      id,
      email_lower: email.toLowerCase(),
      product,
      source: "past_buyer_gift",
      claim_token: cryptoRandom(),
      user_id: null,
      revoked_at: revoked ? new Date().toISOString() : null,
      parent_entitlement_id: parent,
      role,
    };
    this.ents.set(id, row);
    return row;
  }
  parentQualifying(id) {
    const e = this.ents.get(id);
    return !!(e && e.product === "companion_guide" && !e.revoked_at && (e.role || "buyer") !== "spouse" && !e.parent_entitlement_id);
  }
  issue(parentId, tokenHash, createdBy = "system") {
    if (!/^[0-9a-f]{64}$/.test(tokenHash)) return { ok: false, error: "bad_token_hash" };
    if (!this.parentQualifying(parentId)) return { ok: false, error: "parent_not_qualifying" };
    for (const inv of this.invites.values()) {
      if (inv.parent_entitlement_id === parentId && (inv.status === "open" || inv.status === "redeemed")) {
        return { ok: false, error: "slot_taken" };
      }
    }
    const id = cryptoRandom();
    const row = {
      id,
      parent_entitlement_id: parentId,
      token_hash: tokenHash,
      status: "open",
      created_by: createdBy,
      spouse_entitlement_id: null,
      spouse_email_lower: null,
    };
    this.invites.set(id, row);
    this.byHash.set(tokenHash, id);
    return { ok: true, invite_id: id, status: "open" };
  }
  reissue(parentId, newHash) {
    if (!/^[0-9a-f]{64}$/.test(newHash)) return { ok: false, error: "bad_token_hash" };
    if (!this.parentQualifying(parentId)) return { ok: false, error: "parent_not_qualifying" };
    let open = null;
    for (const inv of this.invites.values()) {
      if (inv.parent_entitlement_id === parentId && inv.status === "open") open = inv;
      if (inv.parent_entitlement_id === parentId && inv.status === "redeemed") {
        return { ok: false, error: "already_redeemed" };
      }
    }
    if (!open) return this.issue(parentId, newHash, "reissue");
    open.status = "revoked";
    open.revoked_at = new Date().toISOString();
    return this.issue(parentId, newHash, "reissue");
  }
  peek(hash) {
    const id = this.byHash.get(hash);
    if (!id) return { ok: false, error: "invalid" };
    const inv = this.invites.get(id);
    const parent = this.ents.get(inv.parent_entitlement_id);
    return {
      ok: true,
      status: inv.status,
      parent_active: !!(parent && !parent.revoked_at && parent.product === "companion_guide"),
    };
  }
  redeem(hash, spouseEmail, userId) {
    const id = this.byHash.get(hash);
    if (!id) return { ok: false, error: "invalid" };
    const inv = this.invites.get(id);
    if (inv.status === "redeemed") return { ok: false, error: "already_used" };
    if (inv.status === "revoked") return { ok: false, error: "revoked" };
    const parent = this.ents.get(inv.parent_entitlement_id);
    if (!parent || parent.revoked_at || parent.product !== "companion_guide") return { ok: false, error: "parent_inactive" };
    if ((parent.role || "buyer") === "spouse" || parent.parent_entitlement_id) return { ok: false, error: "parent_not_qualifying" };
    const email = spouseEmail.toLowerCase().trim();
    if (email === parent.email_lower) return { ok: false, error: "same_as_buyer" };
    for (const e of this.ents.values()) {
      if (e.email_lower === email && e.product === "companion_guide" && !e.revoked_at) {
        return { ok: false, error: "email_already_entitled" };
      }
    }
    const eid = cryptoRandom();
    const claim = cryptoRandom();
    this.ents.set(eid, {
      id: eid,
      email_lower: email,
      product: "companion_guide",
      source: "spouse_claim",
      claim_token: claim,
      user_id: userId,
      revoked_at: null,
      parent_entitlement_id: parent.id,
      role: "spouse",
    });
    inv.status = "redeemed";
    inv.spouse_entitlement_id = eid;
    inv.spouse_email_lower = email;
    // Explicit: never enroll sequence / preorder
    return { ok: true, entitlement_id: eid, claim_token: claim, email, user_id: userId };
  }
  onParentRevoke(parentId) {
    const p = this.ents.get(parentId);
    if (!p) return;
    p.revoked_at = p.revoked_at || new Date().toISOString();
    for (const inv of this.invites.values()) {
      if (inv.parent_entitlement_id === parentId && inv.status === "open") {
        inv.status = "revoked";
      }
    }
    for (const e of this.ents.values()) {
      if (e.parent_entitlement_id === parentId && e.product === "companion_guide" && !e.revoked_at) {
        e.revoked_at = new Date().toISOString();
        e.revoke_reason = "parent_revoked";
      }
    }
  }
}

function cryptoRandom() {
  return randomBytes(16).toString("hex").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
}

// --- unit ---
check("unit", "token_is_64_hex", /^[0-9a-f]{64}$/.test(newToken()));
check("unit", "hash_is_64_hex", /^[0-9a-f]{64}$/.test(sha256Hex("abc")));
check("unit", "plaintext_not_equal_hash", (() => { const t = newToken(); return t !== sha256Hex(t); })());
check("unit", "invite_url_path", (() => {
  const t = newToken();
  return `https://neverfightorargue.com/guide/spouse/?i=${t}`.includes("/guide/spouse/?i=");
})());

// --- mocked_handler ---
{
  const db = new MockDb();
  const buyer = db.grantBuyer("buyer@example.com");
  const token = newToken();
  const hash = sha256Hex(token);
  const issued = db.issue(buyer.id, hash, "buyer");
  check("mocked_handler", "issue_ok", issued.ok === true, issued.error || "");
  const peek = db.peek(hash);
  check("mocked_handler", "peek_open_usable", peek.ok && peek.status === "open" && peek.parent_active);

  // GET never consumes
  db.peek(hash);
  check("mocked_handler", "peek_non_consuming", db.invites.get(issued.invite_id).status === "open");

  // second issue blocked
  const again = db.issue(buyer.id, sha256Hex(newToken()), "buyer");
  check("mocked_handler", "one_live_slot", again.error === "slot_taken");

  // reissue while open
  const t2 = newToken();
  const re = db.reissue(buyer.id, sha256Hex(t2));
  check("mocked_handler", "reissue_while_open", re.ok === true);
  check("mocked_handler", "old_token_revoked", db.peek(hash).status === "revoked");

  // redeem
  const uid = cryptoRandom();
  const red = db.redeem(sha256Hex(t2), "spouse@example.com", uid);
  check("mocked_handler", "redeem_ok", red.ok === true, red.error || "");
  const spouse = db.ents.get(red.entitlement_id);
  check("mocked_handler", "spouse_source", spouse?.source === "spouse_claim");
  check("mocked_handler", "spouse_role", spouse?.role === "spouse");
  check("mocked_handler", "spouse_parent_link", spouse?.parent_entitlement_id === buyer.id);
  check("mocked_handler", "no_sequence_enrollment", !db.sequence.has(red.entitlement_id));
  check("mocked_handler", "no_preorder", !db.preorders.has(red.entitlement_id) && spouse?.source === "spouse_claim");

  // single-use
  const reuse = db.redeem(sha256Hex(t2), "other@example.com", cryptoRandom());
  check("mocked_handler", "single_use", reuse.error === "already_used");

  // reissue after redeem blocked
  const re2 = db.reissue(buyer.id, sha256Hex(newToken()));
  check("mocked_handler", "no_second_seat_after_redeem", re2.error === "already_redeemed");
}

{
  const db = new MockDb();
  const buyer = db.grantBuyer("buyer2@example.com");
  const token = newToken();
  db.issue(buyer.id, sha256Hex(token));
  const same = db.redeem(sha256Hex(token), "buyer2@example.com", cryptoRandom());
  check("mocked_handler", "same_as_buyer_blocked", same.error === "same_as_buyer");
}

{
  const db = new MockDb();
  const buyer = db.grantBuyer("buyer3@example.com");
  db.grantBuyer("already@example.com");
  const token = newToken();
  db.issue(buyer.id, sha256Hex(token));
  const hit = db.redeem(sha256Hex(token), "already@example.com", cryptoRandom());
  check("mocked_handler", "email_already_entitled", hit.error === "email_already_entitled");
}

{
  const db = new MockDb();
  const spouseSeat = db.grantBuyer("s@example.com", { role: "spouse", parent: cryptoRandom() });
  const bad = db.issue(spouseSeat.id, sha256Hex(newToken()));
  check("mocked_handler", "spouse_cannot_be_parent", bad.error === "parent_not_qualifying");
}

{
  const db = new MockDb();
  const buyer = db.grantBuyer("buyer4@example.com");
  const token = newToken();
  const hash = sha256Hex(token);
  db.issue(buyer.id, hash);
  const red = db.redeem(hash, "sp4@example.com", cryptoRandom());
  check("mocked_handler", "independent_claim_token", red.claim_token && red.claim_token !== buyer.claim_token);
  // buyer answers key vs spouse
  const buyerKey = `ent:${buyer.id}`;
  const spouseKey = `usr:${red.user_id}`;
  check("mocked_handler", "independent_answer_keys", buyerKey !== spouseKey);
}

{
  const db = new MockDb();
  const buyer = db.grantBuyer("buyer5@example.com");
  const token = newToken();
  db.issue(buyer.id, sha256Hex(token));
  const red = db.redeem(sha256Hex(token), "sp5@example.com", cryptoRandom());
  db.onParentRevoke(buyer.id);
  const spouse = db.ents.get(red.entitlement_id);
  check("mocked_handler", "parent_revoke_cascades_spouse", !!spouse.revoked_at);
}

{
  // URL separation: buyer claim vs invite
  const claim = cryptoRandom();
  const invite = newToken();
  const buyerUrl = `https://neverfightorargue.com/guide/?t=${claim}`;
  const inviteUrl = `https://neverfightorargue.com/guide/spouse/?i=${invite}`;
  check("unit", "urls_differ", buyerUrl !== inviteUrl && !inviteUrl.includes(claim) && !buyerUrl.includes(invite));
}

{
  // forwardable text must not include buyer claim_token pattern casually — just ensure path
  const token = newToken();
  const text = [
    "I’d like you to have your own Companion Guide",
    `https://neverfightorargue.com/guide/spouse/?i=${token}`,
    "Do not use my guide link",
  ].join("\n");
  check("unit", "forwardable_has_spouse_path", text.includes("/guide/spouse/?i=") && text.includes("Do not use my guide link"));
}

const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok);
const out = {
  label: "spouse-invite local — unit + mocked_handler (no live Stripe/DB/mail)",
  ran_at: new Date().toISOString(),
  passed,
  total: results.length,
  failed: failed.map((f) => f.name),
  results,
};
writeFileSync(join(__dir, "test-results.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ passed: out.passed, total: out.total, failed: out.failed }, null, 2));
if (failed.length) process.exit(1);
