// Pure helpers for event checkout. No I/O. Used by event-checkout and local tests.
export const BOOK_CAP = 100;
export const BUNDLE_CAP = 50;
export const SINGLE_CENTS = 2000;
export const BUNDLE_CENTS = 5000;
export const SINGLE_MAX_Q = 10;
export const BUNDLE_MAX_Q = 5;

export function inventory(booksSold: number, bundlesSold: number) {
  const books = Math.max(0, booksSold | 0);
  const bundles = Math.max(0, bundlesSold | 0);
  const booksLeft = Math.max(0, BOOK_CAP - books);
  const bundlesLeft = Math.max(0, Math.min(BUNDLE_CAP - bundles, Math.floor(booksLeft / 2)));
  return {
    books,
    bundles,
    books_left: booksLeft,
    bundles_left: bundlesLeft,
    sold_out_single: booksLeft < 1,
    sold_out_bundle: bundlesLeft < 1,
  };
}

function clampInt(raw: unknown, lo: number, hi: number): number {
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
export function planOrder(input: {
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
    const q = clampInt(input.quantity ?? 1, 0, input.item === "bundle" ? BUNDLE_MAX_Q : SINGLE_MAX_Q);
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
    return { ok: false as const, error: "Choose at least one bundle or one signed book.", sold_out: false, ...inv };
  }

  // Cap against inventory
  if (!input.test) {
    if (bundleQty > inv.bundles_left) bundleQty = inv.bundles_left;
    // After bundles, remaining books for singles
    const booksAfterBundles = inv.books_left - bundleQty * 2;
    const singleMax = Math.min(SINGLE_MAX_Q, Math.max(0, booksAfterBundles));
    if (singleQty > singleMax) singleQty = singleMax;
    if (bundleQty < 1 && singleQty < 1) {
      return { ok: false as const, error: "Sold out.", sold_out: true, ...inv };
    }
  }

  const books_pickup = bundleQty * 2 + singleQty;
  if (!input.test && books_pickup > inv.books_left) {
    return { ok: false as const, error: "Not enough books left for that quantity.", sold_out: true, ...inv };
  }

  const amount_cents = bundleQty * BUNDLE_CENTS + singleQty * SINGLE_CENTS;
  const email = String(input.email ?? "").trim().toLowerCase();
  const name = String(input.name ?? "").trim().slice(0, 100);
  const grant_guide = bundleQty >= 1;

  if (grant_guide && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      ok: false as const,
      error: "Email is required for the Event Bundle so we can send your Companion Guide.",
      sold_out: false,
      ...inv,
    };
  }

  // Routing: any bundle -> event_bundle webhook; singles-only -> legacy preorder/event path
  const kind = grant_guide ? "event_bundle" : "preorder";
  const metadata: Record<string, string> = grant_guide
    ? {
        kind: "event_bundle",
        bundle: bundleQty > 0 ? "1" : "0",
        bundles: String(bundleQty),
        singles: String(singleQty),
        books: String(books_pickup),
        channel: "event",
        ...(input.test ? { test_run: "event_bundle_test" } : {}),
      }
    : {
        kind: "preorder",
        quantity: String(singleQty),
        unit: String(SINGLE_CENTS),
        channel: "event",
        bundles: "0",
        singles: String(singleQty),
        books: String(books_pickup),
      };

  return {
    ok: true as const,
    bundle_qty: bundleQty,
    single_qty: singleQty,
    books_pickup,
    amount_cents,
    unit_cents_bundle: BUNDLE_CENTS,
    unit_cents_single: SINGLE_CENTS,
    email,
    name,
    metadata,
    kind,
    grant_guide,
    // legacy mirrors for older callers
    item: grant_guide && singleQty === 0 ? "bundle" as const : (!grant_guide ? "single" as const : "mixed" as const),
    quantity: grant_guide && singleQty === 0 ? bundleQty : (!grant_guide ? singleQty : books_pickup),
    ...inv,
  };
}

export function clientMoneyTamperFields(body: Record<string, unknown>): string[] {
  const bad: string[] = [];
  for (const k of ["amount", "amount_cents", "unit_amount", "price", "total", "unit_cents"]) {
    if (k in body && body[k] !== undefined && body[k] !== null && body[k] !== "") bad.push(k);
  }
  return bad;
}

/** Webhook mapping: pickup books and guide from session metadata. */
export function mapBundleSession(meta: Record<string, string | undefined>, amountTotal: number) {
  const bundleQty = Math.max(0, parseInt(meta.bundles ?? "0", 10) || 0);
  const singleQty = Math.max(0, parseInt(meta.singles ?? "0", 10) || 0);
  let books = parseInt(meta.books ?? "", 10);
  if (!Number.isFinite(books) || books < 1) books = bundleQty * 2 + singleQty;
  // Legacy sessions: bundles set, no singles field -> books = 2*bundles
  if (!meta.singles && bundleQty >= 1 && (!meta.books || meta.books === String(bundleQty * 2))) {
    books = bundleQty * 2 + singleQty;
  }
  if (books < 1 && bundleQty < 1) books = Math.max(1, singleQty);
  return {
    bundle_qty: bundleQty,
    single_qty: singleQty,
    books_pickup: books,
    grant_guide: bundleQty >= 1,
    amount_cents: amountTotal,
    product: bundleQty >= 1 ? "event_bundle" : "event_single",
  };
}
