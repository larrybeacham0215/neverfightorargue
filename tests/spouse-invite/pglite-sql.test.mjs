/**
 * REAL local Postgres via PGlite (in-process). NOT production Supabase.
 * Label: sql_pglite — executes spouse SQL RPCs with transactions.
 * Does NOT cover Supabase Auth password APIs (no Auth runtime here).
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, "../..");
const results = [];
function check(name, cond, detail = "") {
  results.push({ kind: "sql_pglite", name, ok: !!cond, detail: String(detail) });
}
function sha(s) { return createHash("sha256").update(s).digest("hex"); }
function tok() { return randomBytes(32).toString("hex"); }

const db = new PGlite();
await db.exec(readFileSync(join(__dir, "schema-bootstrap.sql"), "utf8"));
await db.exec(readFileSync(join(root, "supabase/sql/2026-11-05-spouse-guide-invite.sql"), "utf8"));

// seed buyer
const buyer = await db.query(
  `insert into entitlements (email_lower, product, source, claim_token, role)
   values ('buyer@example.com','companion_guide','past_buyer_gift', gen_random_uuid(), 'buyer')
   returning id, claim_token`
);
const parentId = buyer.rows[0].id;
const buyerClaim = buyer.rows[0].claim_token;

// issue
const t1 = tok(); const h1 = sha(t1);
const iss = await db.query(`select spouse_invite_issue($1::uuid, $2, 'buyer') as r`, [parentId, h1]);
check("issue_ok", iss.rows[0].r.ok === true, JSON.stringify(iss.rows[0].r));

// peek non-consuming
const peek1 = await db.query(`select spouse_invite_peek($1) as r`, [h1]);
check("peek_open", peek1.rows[0].r.status === "open" && peek1.rows[0].r.ok === true);
const peek2 = await db.query(`select spouse_invite_peek($1) as r`, [h1]);
check("peek_non_consuming", peek2.rows[0].r.status === "open");

// slot taken
const iss2 = await db.query(`select spouse_invite_issue($1::uuid, $2, 'buyer') as r`, [parentId, sha(tok())]);
check("slot_taken", iss2.rows[0].r.error === "slot_taken");

// reissue
const t2 = tok(); const h2 = sha(t2);
const re = await db.query(`select spouse_invite_reissue($1::uuid, $2) as r`, [parentId, h2]);
check("reissue_ok", re.rows[0].r.ok === true, JSON.stringify(re.rows[0].r));
const oldPeek = await db.query(`select spouse_invite_peek($1) as r`, [h1]);
check("old_revoked", oldPeek.rows[0].r.status === "revoked");

// redeem
const uid = crypto.randomUUID();
const red = await db.query(
  `select spouse_invite_redeem($1, $2, $3::uuid, 'Alex') as r`,
  [h2, "spouse@example.com", uid]
);
check("redeem_ok", red.rows[0].r.ok === true, JSON.stringify(red.rows[0].r));
const spouseEnt = red.rows[0].r.entitlement_id;
const spouseClaim = red.rows[0].r.claim_token;

// no marketing / no preorder
const seq = await db.query(`select count(*)::int as c from guide_sequence_state where entitlement_id = $1`, [spouseEnt]);
check("no_auto_sequence", seq.rows[0].c === 0);
const pre = await db.query(`select count(*)::int as c from preorders`);
check("no_pickup_preorder", pre.rows[0].c === 0);
const src = await db.query(`select source, role, parent_entitlement_id from entitlements where id = $1`, [spouseEnt]);
check("spouse_source_role", src.rows[0].source === "spouse_claim" && src.rows[0].role === "spouse" && src.rows[0].parent_entitlement_id === parentId);

// answer isolation
await db.query(`insert into guide_answers (owner_key, entitlement_id, field_id, value) values ($1,$2,'w01','buyer-only')`, [`ent:${parentId}`, parentId]);
await db.query(`insert into guide_answers (owner_key, entitlement_id, field_id, value) values ($1,$2,'w01','spouse-only')`, [`usr:${uid}`, spouseEnt]);
const ba = await db.query(`select value from guide_answers where owner_key = $1`, [`ent:${parentId}`]);
const sa = await db.query(`select value from guide_answers where owner_key = $1`, [`usr:${uid}`]);
check("answer_isolation", ba.rows[0].value === "buyer-only" && sa.rows[0].value === "spouse-only");
check("claim_tokens_differ", String(spouseClaim) !== String(buyerClaim));

// single-use
const reuse = await db.query(`select spouse_invite_redeem($1, $2, $3::uuid, '') as r`, [h2, "other@example.com", crypto.randomUUID()]);
check("single_use", reuse.rows[0].r.error === "already_used");

// no reissue after redeem
const re2 = await db.query(`select spouse_invite_reissue($1::uuid, $2) as r`, [parentId, sha(tok())]);
check("no_reissue_after_redeem", re2.rows[0].r.error === "already_redeemed");

// same email as buyer
const b2 = await db.query(`insert into entitlements (email_lower, product, source, claim_token) values ('b2@example.com','companion_guide','stripe', gen_random_uuid()) returning id`);
const t3 = tok(); const h3 = sha(t3);
await db.query(`select spouse_invite_issue($1::uuid, $2, 'system') as r`, [b2.rows[0].id, h3]);
const same = await db.query(`select spouse_invite_redeem($1, 'b2@example.com', $2::uuid, '') as r`, [h3, crypto.randomUUID()]);
check("same_as_buyer", same.rows[0].r.error === "same_as_buyer");

// email already entitled
const b3 = await db.query(`insert into entitlements (email_lower, product, source, claim_token) values ('b3@example.com','companion_guide','stripe', gen_random_uuid()) returning id`);
await db.query(`insert into entitlements (email_lower, product, source, claim_token) values ('taken@example.com','companion_guide','stripe', gen_random_uuid())`);
const t4 = tok(); const h4 = sha(t4);
await db.query(`select spouse_invite_issue($1::uuid, $2, 'system')`, [b3.rows[0].id, h4]);
const taken = await db.query(`select spouse_invite_redeem($1, 'taken@example.com', $2::uuid, '') as r`, [h4, crypto.randomUUID()]);
check("email_already_entitled", taken.rows[0].r.error === "email_already_entitled");

// parent revoke cascades spouse seat + open invites
const b4 = await db.query(`insert into entitlements (email_lower, product, source, claim_token) values ('b4@example.com','companion_guide','stripe', gen_random_uuid()) returning id`);
const t5 = tok(); const h5 = sha(t5);
await db.query(`select spouse_invite_issue($1::uuid, $2, 'system')`, [b4.rows[0].id, h5]);
const red5 = await db.query(`select spouse_invite_redeem($1, 'sp4@example.com', $2::uuid, '') as r`, [h5, crypto.randomUUID()]);
await db.query(`update entitlements set revoked_at = now(), revoke_reason = 'refund' where id = $1`, [b4.rows[0].id]);
const spRev = await db.query(`select revoked_at, revoke_reason from entitlements where id = $1`, [red5.rows[0].r.entitlement_id]);
check("parent_revoke_cascades", !!spRev.rows[0].revoked_at && spRev.rows[0].revoke_reason === "parent_revoked");
const access = await db.query(`select companion_guide_access_ok($1::uuid) as ok`, [red5.rows[0].r.entitlement_id]);
check("access_ok_false_after_parent_revoke", access.rows[0].ok === false);

// concurrency: two redeems racing on same open invite — second must fail
const b5 = await db.query(`insert into entitlements (email_lower, product, source, claim_token) values ('b5@example.com','companion_guide','stripe', gen_random_uuid()) returning id`);
const t6 = tok(); const h6 = sha(t6);
await db.query(`select spouse_invite_issue($1::uuid, $2, 'system')`, [b5.rows[0].id, h6]);
// PGlite is single-connection; simulate with sequential locked redeem after status flip mid-flight via SQL function semantics
const rA = await db.query(`select spouse_invite_redeem($1, 'race-a@example.com', $2::uuid, '') as r`, [h6, crypto.randomUUID()]);
const rB = await db.query(`select spouse_invite_redeem($1, 'race-b@example.com', $2::uuid, '') as r`, [h6, crypto.randomUUID()]);
check("concurrent_second_fails", rA.rows[0].r.ok === true && rB.rows[0].r.error === "already_used", JSON.stringify({ a: rA.rows[0].r, b: rB.rows[0].r }));
const live = await db.query(`select count(*)::int as c from entitlements where parent_entitlement_id = $1 and revoked_at is null`, [b5.rows[0].id]);
check("one_spouse_seat", live.rows[0].c === 1);

// spouse cannot be parent
const spouseParentAttempt = await db.query(`select spouse_invite_issue($1::uuid, $2, 'system') as r`, [spouseEnt, sha(tok())]);
check("spouse_not_qualifying_parent", spouseParentAttempt.rows[0].r.error === "parent_not_qualifying");

await db.close();

const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok).map((r) => ({ name: r.name, detail: r.detail }));
const out = {
  label: "sql_pglite — real local Postgres WASM executing spouse SQL; NOT live Supabase; NO Auth runtime",
  ran_at: new Date().toISOString(),
  passed,
  total: results.length,
  failed,
  results,
};
writeFileSync(join(__dir, "pglite-sql-results.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ passed, total: results.length, failed: failed.map((f) => f.name) }, null, 2));
if (failed.length) process.exit(1);
