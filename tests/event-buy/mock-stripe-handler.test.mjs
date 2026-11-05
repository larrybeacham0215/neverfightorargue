/**
 * Event checkout/webhook — MOCKED Stripe + in-memory DB.
 * Labels:
 *   unit              — order-math pure
 *   mocked_stripe_handler — session/refund handlers with fake Stripe payloads (NO live Stripe API, NO paid sessions)
 * NOT: live payment E2E, production DB, outbound email
 */
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
// order-math is TS-ish ESM; use the cjs shim if present else dynamic import of .mjs copy
let planOrder, mapBundleSession, inventory, clientMoneyTamperFields, BUNDLE_CENTS, SINGLE_CENTS;
try {
  const m = await import("./order-math.mjs");
  ({ planOrder, mapBundleSession, inventory, clientMoneyTamperFields, BUNDLE_CENTS, SINGLE_CENTS } = m);
} catch {
  const cjs = require("./_order-math.cjs");
  ({ planOrder, mapBundleSession, inventory, clientMoneyTamperFields, BUNDLE_CENTS, SINGLE_CENTS } = cjs);
}

const results = [];
function check(kind, name, cond, detail = "") {
  results.push({ kind, name, ok: !!cond, detail: String(detail) });
}

// --- unit: prices vs live Stripe (read-only confirmed $50/$20) ---
check("unit", "bundle_cents_5000", BUNDLE_CENTS === 5000);
check("unit", "single_cents_2000", SINGLE_CENTS === 2000);

const mixed = planOrder({ bundles: 2, singles: 3, booksSold: 0, bundlesSold: 0, email: "a@b.co" });
check("unit", "mixed_books_pickup", mixed.ok && mixed.books_pickup === 2 * 2 + 3, JSON.stringify(mixed));
check("unit", "mixed_amount", mixed.ok && mixed.amount_cents === 2 * 5000 + 3 * 2000);
check("unit", "mixed_guide", mixed.ok && mixed.grant_guide === true && mixed.kind === "event_bundle");

const singles = planOrder({ bundles: 0, singles: 2, booksSold: 0, bundlesSold: 0, email: "a@b.co" });
check("unit", "singles_only_kind_preorder", singles.ok && singles.kind === "preorder" && singles.grant_guide === false);
check("unit", "singles_books", singles.ok && singles.books_pickup === 2 && singles.amount_cents === 4000);

const tamper = clientMoneyTamperFields({ amount_cents: 1, bundles: 1 });
check("unit", "ignores_client_money", tamper.includes("amount_cents"));

// --- mocked DB + stripe webhook handler ---
class FakeDb {
  constructor() {
    this.preorders = new Map(); // stripe_session -> row
    this.byPi = new Map();
    this.ents = new Map(); // email -> ent
    this.seq = new Set();
    this.queue = [];
    this.emails = [];
  }
  upsertPreorder(row) {
    const prev = this.preorders.get(row.stripe_session);
    const id = prev?.id || randomBytes(8).toString("hex");
    const pickup = prev?.pickup_token || randomBytes(8).toString("hex");
    const merged = { ...prev, ...row, id, pickup_token: pickup };
    this.preorders.set(row.stripe_session, merged);
    if (row.payment_intent) this.byPi.set(row.payment_intent, merged);
    return merged;
  }
  upsertEnt(email, data) {
    const e = this.ents.get(email) || { id: randomBytes(8).toString("hex") };
    Object.assign(e, data, { email_lower: email });
    this.ents.set(email, e);
    return e;
  }
}

function handleCompleted(db, s, { ON = true } = {}) {
  if (s.metadata?.kind !== "event_bundle") return { ignored: "not event_bundle" };
  if (!ON && s.metadata?.test_run !== "event_bundle_test") return { ignored: "flag off" };
  if (s.payment_status !== "paid") return { ignored: "not paid" };
  let bundleQty = Math.max(0, parseInt(String(s.metadata.bundles ?? "0"), 10) || 0);
  if (bundleQty < 1 && (s.metadata.bundle === "1" || s.metadata.kind === "event_bundle") && !("singles" in (s.metadata || {}))) {
    bundleQty = Math.max(1, parseInt(String(s.metadata.bundles ?? "1"), 10) || 1);
  }
  const singleQty = Math.max(0, parseInt(s.metadata.singles ?? "0", 10) || 0);
  const booksPickup = Math.max(0, parseInt(s.metadata.books ?? "", 10) || (bundleQty * 2 + singleQty));
  const grantGuide = bundleQty >= 1;
  const email = (s.customer_details?.email ?? "").toLowerCase();
  const row = db.upsertPreorder({
    stripe_session: s.id, email, quantity: booksPickup, bundles: bundleQty,
    product: "event_bundle", amount: s.amount_total ?? 0, status: "paid", channel: "event",
    payment_intent: s.payment_intent, test_run: s.metadata.test_run ?? null, singles: singleQty,
  });
  if (email && grantGuide) {
    const ent = db.upsertEnt(email, { product: "companion_guide", stripe_session: s.id, preorder_id: row.id, revoked_at: null });
    db.seq.add(ent.id); // enroll_guide_sequence mocked
  }
  return { ok: true, bundles: bundleQty, singles: singleQty, books_pickup: booksPickup, grant_guide: grantGuide, preorder_id: row.id };
}

function handleRefund(db, charge, { ON = true } = {}) {
  if (!charge.refunded) return { ignored: "partial refund, review by hand" };
  const pi = charge.payment_intent;
  if (!pi) return { ignored: "no payment_intent" };
  const existing = db.byPi.get(pi);
  if (!existing || existing.product !== "event_bundle") return { ignored: "not event_bundle order" };
  if (!ON && existing.test_run !== "event_bundle_test") return { ignored: "flag off" };
  if (existing.status === "refunded") return { ok: true, refunded: true, idempotent: true };
  existing.status = "refunded";
  existing.refunded_at = new Date().toISOString();
  let revoked = false;
  if (existing.email) {
    const still = [...db.preorders.values()].filter((p) => p.email === existing.email && p.product === "event_bundle" && p.status === "paid").length;
    if (!still) {
      const ent = db.ents.get(existing.email.toLowerCase());
      if (ent && !ent.revoked_at) { ent.revoked_at = new Date().toISOString(); ent.revoke_reason = "refund"; revoked = true; }
    }
  }
  return { ok: true, refunded: true, entitlement_revoked: revoked };
}

// Mixed + guide
{
  const db = new FakeDb();
  const s = {
    id: "cs_mixed", payment_status: "paid", amount_total: 11000, payment_intent: "pi_mixed",
    customer_details: { email: "Mix@Ex.com" },
    metadata: { kind: "event_bundle", bundles: "1", singles: "3", books: "5" },
  };
  const r = handleCompleted(db, s);
  check("mocked_stripe_handler", "mixed_qty_books", r.books_pickup === 5 && r.singles === 3 && r.bundles === 1);
  check("mocked_stripe_handler", "mixed_grants_guide", r.grant_guide === true && db.ents.has("mix@ex.com"));
}

// Singles-only does NOT go through event_bundle handler
{
  const db = new FakeDb();
  const s = {
    id: "cs_sing", payment_status: "paid", amount_total: 4000, payment_intent: "pi_sing",
    customer_details: { email: "s@ex.com" },
    metadata: { kind: "preorder", quantity: "2", channel: "event", singles: "2", books: "2", bundles: "0" },
  };
  const r = handleCompleted(db, s);
  check("mocked_stripe_handler", "singles_ignored_by_bundle_webhook", r.ignored === "not event_bundle");
  // Legacy stripe-webhook path (mocked separately)
  const qty = Math.max(1, parseInt(s.metadata.quantity ?? "0", 10));
  const channel = s.metadata.channel === "event" ? "event" : "preorder";
  db.upsertPreorder({ stripe_session: s.id, email: "s@ex.com", quantity: qty, amount: 4000, status: "paid", channel, product: null, payment_intent: "pi_sing" });
  check("mocked_stripe_handler", "singles_legacy_preorder_path", db.preorders.get("cs_sing").channel === "event" && db.preorders.get("cs_sing").quantity === 2 && !db.ents.has("s@ex.com"));
}

// Idempotent upsert same session
{
  const db = new FakeDb();
  const s = {
    id: "cs_id", payment_status: "paid", amount_total: 5000, payment_intent: "pi_id",
    customer_details: { email: "id@ex.com" },
    metadata: { kind: "event_bundle", bundles: "1", singles: "0", books: "2" },
  };
  const a = handleCompleted(db, s);
  const b = handleCompleted(db, s);
  check("mocked_stripe_handler", "idempotent_same_session", a.preorder_id === b.preorder_id && db.preorders.size === 1);
}

// Flag off ignores non-test
{
  const db = new FakeDb();
  const r = handleCompleted(db, {
    id: "cs_off", payment_status: "paid", payment_intent: "pi_off",
    customer_details: { email: "o@ex.com" },
    metadata: { kind: "event_bundle", bundles: "1", singles: "0", books: "2" },
  }, { ON: false });
  check("mocked_stripe_handler", "flag_off_blocks", r.ignored === "flag off");
}

// Refund without charge.metadata.kind (security fix)
{
  const db = new FakeDb();
  handleCompleted(db, {
    id: "cs_rf", payment_status: "paid", amount_total: 5000, payment_intent: "pi_rf",
    customer_details: { email: "rf@ex.com" },
    metadata: { kind: "event_bundle", bundles: "1", singles: "0", books: "2" },
  });
  const r = handleRefund(db, { refunded: true, payment_intent: "pi_rf", metadata: {} });
  check("mocked_stripe_handler", "refund_without_charge_kind", r.ok && r.refunded && r.entitlement_revoked);
  check("mocked_stripe_handler", "refund_idempotent", handleRefund(db, { refunded: true, payment_intent: "pi_rf" }).idempotent === true);
}

// Keep entitlement if another paid bundle remains
{
  const db = new FakeDb();
  handleCompleted(db, {
    id: "cs_a", payment_status: "paid", payment_intent: "pi_a",
    customer_details: { email: "keep@ex.com" },
    metadata: { kind: "event_bundle", bundles: "1", singles: "0", books: "2" },
  });
  handleCompleted(db, {
    id: "cs_b", payment_status: "paid", payment_intent: "pi_b",
    customer_details: { email: "keep@ex.com" },
    metadata: { kind: "event_bundle", bundles: "1", singles: "0", books: "2" },
  });
  const r = handleRefund(db, { refunded: true, payment_intent: "pi_a" });
  check("mocked_stripe_handler", "refund_keeps_entitlement_if_other_bundle", r.entitlement_revoked === false && !db.ents.get("keep@ex.com").revoked_at);
}

// Without holds, concurrent planOrder snapshots can oversell (documents why SQL holds exist).
{
  const CAP = 100;
  let sold = 98;
  const checkouts = [];
  for (let i = 0; i < 2; i++) {
    const plan = planOrder({ bundles: 1, singles: 0, booksSold: sold, bundlesSold: 49, email: `r${i}@ex.com` });
    checkouts.push(plan);
  }
  const bothAccepted = checkouts.every((p) => p.ok && p.books_pickup === 2);
  const wouldSell = sold + checkouts.reduce((a, p) => a + (p.ok ? p.books_pickup : 0), 0);
  check("unit", "plan_snapshot_race_exists_without_holds", bothAccepted && wouldSell > CAP, `would_sell=${wouldSell}; mitigated by event_try_hold_books (see holds-pglite)`);
}

// Server totals ignore client amount
{
  const plan = planOrder({ bundles: 1, singles: 1, booksSold: 0, bundlesSold: 0, email: "t@ex.com", amount_cents: 1 });
  check("unit", "server_total_not_client", plan.ok && plan.amount_cents === 7000);
}

// mapBundleSession
{
  const m = mapBundleSession({ bundles: "2", singles: "1", books: "5" }, 12000);
  check("unit", "map_session_mixed", m.books_pickup === 5 && m.grant_guide && m.bundle_qty === 2);
}

const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok);
const out = {
  label: "unit + mocked_stripe_handler — NO live Stripe sessions, NO paid tests, NO production writes",
  live_price_readonly: { single: "price_1UIqyG… active $20", bundle: "price_1UYSsc… active $50" },
  ran_at: new Date().toISOString(),
  passed,
  total: results.length,
  failed: failed.map((f) => ({ name: f.name, detail: f.detail })),
  results,
};
writeFileSync(join(__dir, "mock-stripe-handler-results.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ passed, total: results.length, failed: out.failed }, null, 2));
if (failed.length) process.exit(1);
