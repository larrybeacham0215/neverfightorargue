export const BOOK_CAP = 100, BUNDLE_CAP = 50, SINGLE_CENTS = 2000, BUNDLE_CENTS = 5000, SINGLE_MAX_Q = 10, BUNDLE_MAX_Q = 5;
export function inventory(booksSold, bundlesSold) {
  const books = Math.max(0, booksSold | 0);
  const bundles = Math.max(0, bundlesSold | 0);
  const booksLeft = Math.max(0, BOOK_CAP - books);
  const bundlesLeft = Math.max(0, Math.min(BUNDLE_CAP - bundles, Math.floor(booksLeft / 2)));
  return { books, bundles, books_left: booksLeft, bundles_left: bundlesLeft, sold_out_single: booksLeft < 1, sold_out_bundle: bundlesLeft < 1 };
}
function clampInt(raw, lo, hi) {
  const n = parseInt(String(raw ?? '0'), 10);
  if (!Number.isFinite(n) || n < lo) return lo;
  if (n > hi) return hi;
  return n;
}
export function planOrder(input) {
  const inv = inventory(input.booksSold, input.bundlesSold);
  let bundleQty = 0, singleQty = 0;
  if (input.item === 'bundle' || input.item === 'single') {
    const q = clampInt(input.quantity ?? 1, 0, input.item === 'bundle' ? BUNDLE_MAX_Q : SINGLE_MAX_Q);
    if (input.item === 'bundle') bundleQty = Math.max(1, q || 1);
    else singleQty = Math.max(1, q || 1);
  } else {
    bundleQty = clampInt(input.bundles ?? 0, 0, BUNDLE_MAX_Q);
    singleQty = clampInt(input.singles ?? 0, 0, SINGLE_MAX_Q);
  }
  if (input.test) {
    if (bundleQty > 0) { bundleQty = 1; singleQty = 0; }
    else singleQty = Math.min(1, Math.max(1, singleQty || 1));
  }
  if (bundleQty < 1 && singleQty < 1) return { ok: false, error: 'Choose at least one bundle or one signed book.', sold_out: false, ...inv };
  if (!input.test) {
    if (bundleQty > inv.bundles_left) bundleQty = inv.bundles_left;
    const booksAfterBundles = inv.books_left - bundleQty * 2;
    const singleMax = Math.min(SINGLE_MAX_Q, Math.max(0, booksAfterBundles));
    if (singleQty > singleMax) singleQty = singleMax;
    if (bundleQty < 1 && singleQty < 1) return { ok: false, error: 'Sold out.', sold_out: true, ...inv };
  }
  const books_pickup = bundleQty * 2 + singleQty;
  if (!input.test && books_pickup > inv.books_left) return { ok: false, error: 'Not enough books left for that quantity.', sold_out: true, ...inv };
  const amount_cents = bundleQty * BUNDLE_CENTS + singleQty * SINGLE_CENTS;
  const email = String(input.email ?? '').trim().toLowerCase();
  const name = String(input.name ?? '').trim().slice(0, 100);
  const grant_guide = bundleQty >= 1;
  if (grant_guide && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Email is required for the Event Bundle so we can send your Companion Guide.', sold_out: false, ...inv };
  }
  const kind = grant_guide ? 'event_bundle' : 'preorder';
  const metadata = grant_guide
    ? { kind: 'event_bundle', bundle: bundleQty > 0 ? '1' : '0', bundles: String(bundleQty), singles: String(singleQty), books: String(books_pickup), channel: 'event', ...(input.test ? { test_run: 'event_bundle_test' } : {}) }
    : { kind: 'preorder', quantity: String(singleQty), unit: String(SINGLE_CENTS), channel: 'event', bundles: '0', singles: String(singleQty), books: String(books_pickup) };
  return { ok: true, bundle_qty: bundleQty, single_qty: singleQty, books_pickup, amount_cents, email, name, metadata, kind, grant_guide, item: grant_guide && singleQty === 0 ? 'bundle' : (!grant_guide ? 'single' : 'mixed'), quantity: grant_guide && singleQty === 0 ? bundleQty : (!grant_guide ? singleQty : books_pickup), ...inv };
}
export function clientMoneyTamperFields(body) {
  const bad = [];
  for (const k of ['amount', 'amount_cents', 'unit_amount', 'price', 'total', 'unit_cents']) {
    if (k in body && body[k] !== undefined && body[k] !== null && body[k] !== '') bad.push(k);
  }
  return bad;
}
export function mapBundleSession(meta, amountTotal) {
  const bundleQty = Math.max(0, parseInt(meta.bundles ?? '0', 10) || 0);
  const singleQty = Math.max(0, parseInt(meta.singles ?? '0', 10) || 0);
  let books = parseInt(meta.books ?? '', 10);
  if (!Number.isFinite(books) || books < 1) books = bundleQty * 2 + singleQty;
  if (!meta.singles && bundleQty >= 1 && (!meta.books || meta.books === String(bundleQty * 2))) books = bundleQty * 2 + singleQty;
  if (books < 1 && bundleQty < 1) books = Math.max(1, singleQty);
  return { bundle_qty: bundleQty, single_qty: singleQty, books_pickup: books, grant_guide: bundleQty >= 1, amount_cents: amountTotal, product: bundleQty >= 1 ? 'event_bundle' : 'event_single' };
}
