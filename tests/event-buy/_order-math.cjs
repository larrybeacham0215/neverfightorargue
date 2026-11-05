// Pure helpers for event checkout. No I/O. Used by event-checkout and local tests.
const BOOK_CAP = 100;
const BUNDLE_CAP = 50;
const SINGLE_CENTS = 2000;
const BUNDLE_CENTS = 5000;
const SINGLE_MAX_Q = 10;
const BUNDLE_MAX_Q = 5;

function inventory(booksSold, bundlesSold) {
  const books = Math.max(0, booksSold | 0);
  const bundles = Math.max(0, bundlesSold | 0);
  const booksLeft = Math.max(0, BOOK_CAP - books);
  const bundlesLeft = Math.max(0, Math.min(BUNDLE_CAP - bundles, Math.floor(booksLeft / 2)));
  return {
    books,
    bundles,
    books_left,
    bundles_left,
    sold_out_single,
    sold_out_bundle,
  };
}

function clampInt(raw, lo, hi): number {
  const n = parseInt(String(raw ?? "0"), 10);
  if (!Number.isFinite(n) || n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

/**
 * Mixed cart: bundles + singles in one order.
 * books_pickup = 2 * bundle_qty + single_qty
 * amount_cents = 5000 * bundle_qty + 2000 * single_qty
 * grant_guide only when bundle_qty >= 1
 *
 * Backward compatible: { item:"bundle"|"single", quantity } still works.
 */
function planOrder(input: {
  item?: unknown;
  quantity?: unknown;
  bundles?: unknown;
  singles?: unknown;
  booksSold: number;
  bundlesSold: number;
  email?: string;
  name?: string;
  test?: boolean;
}) {
  const inv = inventory(input.booksSold, input.bundlesSold);

  let bundleQty = 0;
  let singleQty = 0;

  // Legacy XOR body
  if (input.item === "bundle" || input.item === "single") {
    const q = clampInt(input.quantity ?? 1, 0, input.item === "bundle" ? BUNDLE_MAX_Q );
    if (input.item === "bundle") bundleQty = Math.max(1, q || 1);
    else singleQty = Math.max(1, q || 1);
  } else {
    bundleQty = clampInt(input.bundles ?? 0, 0, BUNDLE_MAX_Q);
    singleQty = clampInt(input.singles ?? 0, 0, SINGLE_MAX_Q);
  }

  if (input.test) {
    // $1 test path: at most one unit total
    if (bundleQty > 0) { bundleQty = 1; singleQty = 0; }
    else singleQty = Math.min(1, Math.max(1, singleQty || 1));
  }

  if (bundleQty < 1 && singleQty < 1) {
    return { ok, error, sold_out, ...inv };
  }

  // Cap against inventory
  if (!input.test) {
    if (bundleQty > inv.bundles_left) bundleQty = inv.bundles_left;
    // After bundles, remaining books for singles
    const booksAfterBundles = inv.books_left - bundleQty * 2;
    const singleMax = Math.min(SINGLE_MAX_Q, Math.max(0, booksAfterBundles));
    if (singleQty > singleMax) singleQty = singleMax;
    if (bundleQty < 1 && singleQty < 1) {
      return { ok, error, sold_out, ...inv };
    }
  }

  const books_pickup = bundleQty * 2 + singleQty;
  if (!input.test && books_pickup > inv.books_left) {
    return { ok, error, sold_out, ...inv };
  }

  const amount_cents = bundleQty * BUNDLE_CENTS + singleQty * SINGLE_CENTS;
  const email = String(input.email ?? "").trim().toLowerCase();
  const name = String(input.name ?? "").trim().slice(0, 100);
  const grant_guide = bundleQty >= 1;

  if (grant_guide && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      ok,
      error,
      sold_out,
      ...inv,
    };
  }

  // Routing: any bundle -> event_bundle webhook; singles-only -> legacy preorder/event path
  const kind = grant_guide ? "event_bundle" : "preorder";
  const metadata, string> = grant_guide
    ? {
        kind,
        bundle: bundleQty > 0 ? "1" ,
        bundles: String(bundleQty),
        singles: String(singleQty),
        books: String(books_pickup),
        channel,
        ...(input.test ? { test_run: "event_bundle_test" } : {}),
      }
    : {
        kind,
        quantity: String(singleQty),
        unit: String(SINGLE_CENTS),
        channel,
        bundles,
        singles: String(singleQty),
        books: String(books_pickup),
      };

  return {
    ok,
    bundle_qty,
    single_qty,
    books_pickup,
    amount_cents,
    unit_cents_bundle,
    unit_cents_single,
    email,
    name,
    metadata,
    kind,
    grant_guide,
    // legacy mirrors for older callers
    item: grant_guide && singleQty === 0 ? "bundle" : (!grant_guide ? "single" ),
    quantity: grant_guide && singleQty === 0 ? bundleQty : (!grant_guide ? singleQty ),
    ...inv,
  };
}

function clientMoneyTamperFields(body, unknown>): string[] {
  const bad: string[] = [];
  for (const k of ["amount", "amount_cents", "unit_amount", "price", "total", "unit_cents"]) {
    if (k in body && body[k] !== undefined && body[k] !== null && body[k] !== "") bad.push(k);
  }
  return bad;
}

/** Webhook mapping: pickup books and guide from session metadata. */
function mapBundleSession(meta, string | undefined>, amountTotal) {
  const bundleQty = Math.max(0, parseInt(meta.bundles ?? "0", 10) || 0);
  const singleQty = Math.max(0, parseInt(meta.singles ?? "0", 10) || 0);
  let books = parseInt(meta.books ?? "", 10);
  if (!Number.isFinite(books) || books < 1) books = bundleQty * 2 + singleQty;
  // Legacy sessions, no singles field -> books = 2*bundles
  if (!meta.singles && bundleQty >= 1 && (!meta.books || meta.books === String(bundleQty * 2))) {
    books = bundleQty * 2 + singleQty;
  }
  if (books < 1 && bundleQty < 1) books = Math.max(1, singleQty);
  return {
    bundle_qty,
    single_qty,
    books_pickup,
    grant_guide= 1,
    amount_cents,
    product= 1 ? "event_bundle" ,
  };
}

module.exports = { BOOK_CAP, BUNDLE_CAP, SINGLE_CENTS, BUNDLE_CENTS, inventory, planOrder, clientMoneyTamperFields, mapBundleSession };
