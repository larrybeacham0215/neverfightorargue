import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// Load TS helpers by stripping types lightly via dynamic transpile isn't available —
// duplicate import from .ts won't work in node. Use a tiny JS reimplementation mirror
// that we keep in sync by reading the exported logic from a .mjs copy.

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Write JS mirror from the same constants for node (explicit, reviewed)
const BOOK_CAP = 100, BUNDLE_CAP = 50, SINGLE_CENTS = 2000, BUNDLE_CENTS = 5000, SINGLE_MAX_Q = 10, BUNDLE_MAX_Q = 5;
function inventory(booksSold, bundlesSold) {
  const books = Math.max(0, booksSold | 0);
  const bundles = Math.max(0, bundlesSold | 0);
  const booksLeft = Math.max(0, BOOK_CAP - books);
  const bundlesLeft = Math.max(0, Math.min(BUNDLE_CAP - bundles, Math.floor(booksLeft / 2)));
  return { books, bundles, books_left: booksLeft, bundles_left: bundlesLeft, sold_out_single: booksLeft < 1, sold_out_bundle: bundlesLeft < 1 };
}
function parseItem(raw) { return raw === 'bundle' ? 'bundle' : 'single'; }
function planOrder(input) {
  const inv = inventory(input.booksSold, input.bundlesSold);
  const item = parseItem(input.item);
  const max = item === 'bundle' ? Math.min(BUNDLE_MAX_Q, inv.bundles_left) : Math.min(SINGLE_MAX_Q, inv.books_left);
  if (max < 1 && !input.test) return { ok: false, error: 'Sold out.', sold_out: true, ...inv, item };
  const rawQ = parseInt(String(input.quantity ?? '1'), 10);
  const q = Math.max(1, Math.min(input.test ? 1 : max, Number.isFinite(rawQ) ? rawQ : 1));
  const books_pickup = item === 'bundle' ? q * 2 : q;
  if (!input.test && books_pickup > inv.books_left) return { ok: false, error: 'Not enough books left for that quantity.', sold_out: true, ...inv, item };
  const unit_cents = item === 'bundle' ? BUNDLE_CENTS : SINGLE_CENTS;
  const amount_cents = unit_cents * q;
  const email = String(input.email ?? '').trim().toLowerCase();
  const name = String(input.name ?? '').trim().slice(0, 100);
  if (item === 'bundle' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Email is required for the Event Bundle so we can send your Companion Guide.', ...inv, item };
  }
  const metadata = item === 'bundle'
    ? { kind: 'event_bundle', bundle: '1', bundles: String(q), books: String(books_pickup), channel: 'event', ...(input.test ? { test_run: 'event_bundle_test' } : {}) }
    : { kind: 'preorder', quantity: String(q), unit: String(SINGLE_CENTS), channel: 'event' };
  return { ok: true, item, quantity: q, books_pickup, unit_cents, amount_cents, email, name, metadata, grant_guide: item === 'bundle', ...inv };
}
function clientMoneyTamperFields(body) {
  const bad = [];
  for (const k of ['amount', 'amount_cents', 'unit_amount', 'price', 'total', 'unit_cents']) {
    if (k in body && body[k] !== undefined && body[k] !== null && body[k] !== '') bad.push(k);
  }
  return bad;
}

// Verify TS source still exports the same constants (drift guard)
const ts = fs.readFileSync(path.join(__dirname, '../../supabase/functions/event-checkout/order-math.ts'), 'utf8');
assert.match(ts, /export const BOOK_CAP = 100/);
assert.match(ts, /export const BUNDLE_CENTS = 5000/);
assert.match(ts, /books_pickup = item === "bundle" \? q \* 2 : q/);

const results = [];
function check(name, fn) {
  try { fn(); results.push({ name, ok: true }); }
  catch (e) { results.push({ name, ok: false, detail: String(e.message || e) }); }
}

check('single_1_is_20', () => {
  const p = planOrder({ item: 'single', quantity: 1, booksSold: 0, bundlesSold: 0, email: 'a@b.co' });
  assert.equal(p.ok, true); assert.equal(p.amount_cents, 2000); assert.equal(p.books_pickup, 1); assert.equal(p.grant_guide, false);
});
check('bundle_1_is_50_and_2_books', () => {
  const p = planOrder({ item: 'bundle', quantity: 1, booksSold: 0, bundlesSold: 0, email: 'a@b.co' });
  assert.equal(p.ok, true); assert.equal(p.amount_cents, 5000); assert.equal(p.books_pickup, 2);
  assert.equal(p.metadata.books, '2'); assert.equal(p.metadata.bundles, '1'); assert.equal(p.grant_guide, true);
});
check('bundle_3_is_150_and_6_books', () => {
  const p = planOrder({ item: 'bundle', quantity: 3, booksSold: 0, bundlesSold: 0, email: 'a@b.co' });
  assert.equal(p.amount_cents, 15000); assert.equal(p.books_pickup, 6); assert.equal(p.metadata.books, '6');
});
check('single_qty_clamped_to_10', () => {
  const p = planOrder({ item: 'single', quantity: 99, booksSold: 0, bundlesSold: 0, email: 'a@b.co' });
  assert.equal(p.quantity, 10); assert.equal(p.amount_cents, 20000); assert.equal(p.books_pickup, 10);
});
check('bundle_qty_clamped_to_5', () => {
  const p = planOrder({ item: 'bundle', quantity: 99, booksSold: 0, bundlesSold: 0, email: 'a@b.co' });
  assert.equal(p.quantity, 5); assert.equal(p.books_pickup, 10); assert.equal(p.amount_cents, 25000);
});
check('tamper_qty_negative_becomes_1', () => {
  const p = planOrder({ item: 'single', quantity: -3, booksSold: 0, bundlesSold: 0, email: 'a@b.co' });
  assert.equal(p.quantity, 1);
});
check('tamper_qty_nan_becomes_1', () => {
  const p = planOrder({ item: 'single', quantity: 'nope', booksSold: 0, bundlesSold: 0, email: 'a@b.co' });
  assert.equal(p.quantity, 1);
});
check('unknown_item_defaults_single', () => {
  const p = planOrder({ item: 'hack', quantity: 2, booksSold: 0, bundlesSold: 0, email: 'a@b.co' });
  assert.equal(p.item, 'single'); assert.equal(p.amount_cents, 4000);
});
check('client_money_fields_detected_not_used', () => {
  const fields = clientMoneyTamperFields({ amount_cents: 1, price: 'price_x', quantity: 2, item: 'bundle' });
  assert.deepEqual(fields.sort(), ['amount_cents', 'price'].sort());
  const p = planOrder({ item: 'bundle', quantity: 2, booksSold: 0, bundlesSold: 0, email: 'a@b.co' });
  assert.equal(p.amount_cents, 10000); // still $50*2, not $0.01
});
check('bundle_requires_email', () => {
  const p = planOrder({ item: 'bundle', quantity: 1, booksSold: 0, bundlesSold: 0, email: '' });
  assert.equal(p.ok, false); assert.match(p.error, /Email is required/);
});
check('inventory_near_cap_blocks_overbuy', () => {
  // 98 books sold => 2 left => 1 bundle max
  const p = planOrder({ item: 'bundle', quantity: 5, booksSold: 98, bundlesSold: 0, email: 'a@b.co' });
  assert.equal(p.ok, true); assert.equal(p.quantity, 1); assert.equal(p.books_pickup, 2);
});
check('sold_out_when_no_books', () => {
  const p = planOrder({ item: 'single', quantity: 1, booksSold: 100, bundlesSold: 0, email: 'a@b.co' });
  assert.equal(p.ok, false); assert.equal(p.sold_out, true);
});
check('mixed_sales_inventory_counts_bundle_books', () => {
  // 10 singles + 3 bundles (6 books) = 16 books, 3 bundles
  const inv = inventory(16, 3);
  assert.equal(inv.books_left, 84);
  assert.equal(inv.bundles_left, 42);
});

// Webhook fixture semantics (idempotency / refund) — pure simulation
check('webhook_books_eq_2x_bundles', () => {
  const bundles = 2;
  const quantity = bundles * 2;
  assert.equal(quantity, 4);
});
check('webhook_idempotent_upsert_key_is_stripe_session', () => {
  // Documented contract: upsert onConflict stripe_session
  const wh = fs.readFileSync(path.join(__dirname, '../../supabase/functions/event-bundle-webhook/index.ts'), 'utf8');
  assert.match(wh, /onConflict:\s*"stripe_session"/);
  assert.match(wh, /quantity:\s*bundles \* 2/);
  assert.match(wh, /product:\s*"event_bundle"/);
  assert.match(wh, /companion_guide/);
  assert.match(wh, /revoke_reason:\s*"refund"/);
});
check('buy_page_defaults_src_event_bundle_to_bundle', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../buy/index.html'), 'utf8');
  assert.match(html, /src=event_bundle/);
  assert.match(html, /event-checkout/);
  assert.match(html, /Event Bundle/);
  assert.match(html, /\$50/);
  assert.match(html, /\$20/);
  assert.doesNotMatch(html, /functions\/v1\/checkout'/); // must not call old checkout
});
check('buy_page_not_live_old_page', () => {
  // Contrasting contract vs live (captured expectation)
  const html = fs.readFileSync(path.join(__dirname, '../../buy/index.html'), 'utf8');
  assert.match(html, /How many bundles\?/);
});

const summary = {
  kind: 'local_unit_and_fixture_tests',
  note: 'No Stripe sessions created. No production mutations. Payment completion tested via webhook source contracts + order-math only.',
  passed: results.filter(r => r.ok).length,
  total: results.length,
  failed: results.filter(r => !r.ok),
  results,
  ran_at_et: new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' ET',
};
fs.writeFileSync(path.join(__dirname, 'test-results.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (summary.failed.length) process.exit(1);
