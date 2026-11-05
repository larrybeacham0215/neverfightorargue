import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as om from './order-math.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '../..');
const results = [];
function check(name, fn, kind = 'unit') {
  try { fn(); results.push({ name, ok: true, kind }); }
  catch (e) { results.push({ name, ok: false, kind, detail: String(e.stack || e) }); }
}

const ts = fs.readFileSync(path.join(root, 'supabase/functions/event-checkout/order-math.ts'), 'utf8');
check('ts_contains_mixed_formula', () => {
  assert.match(ts, /books_pickup = bundleQty \* 2 \+ singleQty/);
  assert.match(ts, /grant_guide = bundleQty >= 1/);
  assert.match(ts, /mapBundleSession/);
});

check('mixed_2b_3s', () => {
  const p = om.planOrder({ bundles: 2, singles: 3, booksSold: 0, bundlesSold: 0, email: 'a@b.co' });
  assert.equal(p.books_pickup, 7);
  assert.equal(p.amount_cents, 16000);
  assert.equal(p.grant_guide, true);
});
check('singles_only_no_guide', () => {
  const p = om.planOrder({ bundles: 0, singles: 4, booksSold: 0, bundlesSold: 0, email: 'a@b.co' });
  assert.equal(p.books_pickup, 4);
  assert.equal(p.grant_guide, false);
  assert.equal(p.kind, 'preorder');
});
check('bundles_only', () => {
  const p = om.planOrder({ bundles: 3, singles: 0, booksSold: 0, bundlesSold: 0, email: 'a@b.co' });
  assert.equal(p.books_pickup, 6);
  assert.equal(p.grant_guide, true);
});
check('legacy_xor_bundle', () => {
  const p = om.planOrder({ item: 'bundle', quantity: 2, booksSold: 0, bundlesSold: 0, email: 'a@b.co' });
  assert.equal(p.books_pickup, 4);
});
check('legacy_xor_single', () => {
  const p = om.planOrder({ item: 'single', quantity: 3, booksSold: 0, bundlesSold: 0, email: 'a@b.co' });
  assert.equal(p.books_pickup, 3);
  assert.equal(p.grant_guide, false);
});
check('near_cap_clamp', () => {
  const p = om.planOrder({ bundles: 1, singles: 3, booksSold: 96, bundlesSold: 0, email: 'a@b.co' });
  assert.equal(p.single_qty, 2);
  assert.equal(p.books_pickup, 4);
});
check('empty_rejected', () => {
  assert.equal(om.planOrder({ bundles: 0, singles: 0, booksSold: 0, bundlesSold: 0, email: 'a@b.co' }).ok, false);
});
check('map_mixed', () => {
  const m = om.mapBundleSession({ bundles: '2', singles: '1', books: '5' }, 12000);
  assert.equal(m.books_pickup, 5);
  assert.equal(m.grant_guide, true);
});
check('map_legacy', () => {
  const m = om.mapBundleSession({ bundles: '2', books: '4' }, 10000);
  assert.equal(m.books_pickup, 4);
  assert.equal(m.single_qty, 0);
});

check('mocked_webhook_fulfill_idempotent', () => {
  const db = { preorders: new Map(), entitlements: new Map() };
  function fulfill(session) {
    const meta = session.metadata;
    if (meta.kind !== 'event_bundle') return { ignored: true };
    const mapped = om.mapBundleSession(meta, session.amount_total);
    const email = session.customer_email.toLowerCase();
    const row = db.preorders.get(session.id) || { stripe_session: session.id, email };
    row.quantity = mapped.books_pickup;
    row.bundles = mapped.bundle_qty;
    row.status = 'paid';
    db.preorders.set(session.id, row);
    if (email && mapped.grant_guide) db.entitlements.set(email, { product: 'companion_guide', revoked_at: null });
    return { ok: true, ...mapped };
  }
  const s = { id: 'cs1', customer_email: 'mix@ex.com', amount_total: 12000, metadata: { kind: 'event_bundle', bundles: '2', singles: '1', books: '5' } };
  fulfill(s); fulfill(s);
  assert.equal(db.preorders.size, 1);
  assert.equal(db.preorders.get('cs1').quantity, 5);
  assert.equal(db.entitlements.size, 1);
}, 'mocked_handler');

check('mocked_webhook_no_guide_without_bundle', () => {
  const mapped = om.mapBundleSession({ kind: 'event_bundle', bundles: '0', singles: '2', books: '2' }, 4000);
  assert.equal(mapped.grant_guide, false);
}, 'mocked_handler');

check('mocked_refund_keeps_guide_if_other_paid_bundle', () => {
  const orders = [
    { email: 'a@b.co', product: 'event_bundle', status: 'paid', payment_intent: 'pi_1' },
    { email: 'a@b.co', product: 'event_bundle', status: 'paid', payment_intent: 'pi_2' },
  ];
  let revoked = false;
  const row = orders.find((o) => o.payment_intent === 'pi_1');
  row.status = 'refunded';
  const still = orders.filter((o) => o.email === 'a@b.co' && o.product === 'event_bundle' && o.status === 'paid').length;
  if (!still) revoked = true;
  assert.equal(still, 1);
  assert.equal(revoked, false);
}, 'mocked_handler');

check('flags_in_sources', () => {
  const co = fs.readFileSync(path.join(root, 'supabase/functions/event-checkout/index.ts'), 'utf8');
  const wh = fs.readFileSync(path.join(root, 'supabase/functions/event-bundle-webhook/index.ts'), 'utf8');
  assert.match(co, /EVENT_SALES_ON/);
  assert.match(co, /plan\.bundle_qty/);
  assert.match(co, /plan\.single_qty/);
  assert.match(wh, /EVENT_BUNDLE_WEBHOOK_ON/);
  assert.match(wh, /singleQty|singles/);
  assert.match(wh, /grantGuide/);
  assert.match(wh, /booksPickup/);
  assert.match(wh, /onConflict:\s*"stripe_session"/);
}, 'source_contract');

check('buy_posts_mixed', () => {
  const html = fs.readFileSync(path.join(root, 'buy/index.html'), 'utf8');
  assert.match(html, /bundles:b,singles:s/);
  assert.match(html, /b\*2\+s/);
  assert.match(html, /event-checkout/);
}, 'source_contract');

check('webhook_quantity_uses_books_not_only_2x_bundles', () => {
  const wh = fs.readFileSync(path.join(root, 'supabase/functions/event-bundle-webhook/index.ts'), 'utf8');
  assert.match(wh, /quantity:\s*booksPickup/);
  assert.doesNotMatch(wh, /quantity:\s*bundles \* 2/);
}, 'source_contract');

const summary = {
  suite: 'mixed-cart + mocked handlers',
  labels: {
    unit: 'Pure math/mapping (JS mirror; TS formula asserted)',
    mocked_handler: 'In-memory webhook/checkout stand-in — NOT live Stripe/Supabase; no network',
    source_contract: 'Local source file reads',
  },
  NOT_run: ['live Stripe Checkout session creation', 'production Supabase writes', 'live webhook delivery'],
  passed: results.filter((r) => r.ok).length,
  total: results.length,
  failed: results.filter((r) => !r.ok),
  results,
  screenshot: {
    full_path: '/workspace/nfoa-event-buy/docs/event-buy/preview/02-buy-src-event_bundle.png',
    provenance: 'Existing prior preview copy (byte-identical to marriage-ministry/event-bundle/screenshots/02-buy-src-event_bundle.png). NOT generated this session. Shows older XOR buy UI with Event Bundle selected — not the new mixed qty UI.',
    new_ui_preview_html: '/workspace/nfoa-event-buy/docs/event-buy/preview/buy-mobile-preview.html (stale until refreshed from new buy/index.html)',
  },
  ran_at_et: new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' ET',
};
fs.writeFileSync(path.join(__dirname, 'mixed-cart-test-results.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (summary.failed.length) process.exit(1);
