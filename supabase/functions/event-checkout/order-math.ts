// Pure helpers for event checkout. No I/O. Used by event-checkout and local tests.
export const BOOK_CAP = 100;
export const BUNDLE_CAP = 50;
export const SINGLE_CENTS = 2000;
export const BUNDLE_CENTS = 5000;
export const SINGLE_MAX_Q = 10;
export const BUNDLE_MAX_Q = 5;

export type Item = "single" | "bundle";

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

export function parseItem(raw: unknown): Item {
  return raw === "bundle" ? "bundle" : "single";
}

/** Server-enforced quantity + totals. Never trust client price fields. */
export function planOrder(input: {
  item: unknown;
  quantity: unknown;
  booksSold: number;
  bundlesSold: number;
  email?: string;
  name?: string;
  test?: boolean;
}) {
  const inv = inventory(input.booksSold, input.bundlesSold);
  const item = parseItem(input.item);
  const max = item === "bundle" ? Math.min(BUNDLE_MAX_Q, inv.bundles_left) : Math.min(SINGLE_MAX_Q, inv.books_left);
  if (max < 1 && !input.test) {
    return { ok: false as const, error: "Sold out.", sold_out: true, ...inv, item };
  }
  const rawQ = parseInt(String(input.quantity ?? "1"), 10);
  const q = Math.max(1, Math.min(input.test ? 1 : max, Number.isFinite(rawQ) ? rawQ : 1));
  const books_pickup = item === "bundle" ? q * 2 : q;
  // Guard: never exceed remaining books even if caps drift
  if (!input.test && books_pickup > inv.books_left) {
    return { ok: false as const, error: "Not enough books left for that quantity.", sold_out: true, ...inv, item };
  }
  const unit_cents = item === "bundle" ? BUNDLE_CENTS : SINGLE_CENTS;
  const amount_cents = unit_cents * q;
  const email = String(input.email ?? "").trim().toLowerCase();
  const name = String(input.name ?? "").trim().slice(0, 100);
  if (item === "bundle" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false as const, error: "Email is required for the Event Bundle so we can send your Companion Guide.", sold_out: false, ...inv, item };
  }
  const metadata =
    item === "bundle"
      ? {
          kind: "event_bundle",
          bundle: "1",
          bundles: String(q),
          books: String(books_pickup),
          channel: "event",
          ...(input.test ? { test_run: "event_bundle_test" } : {}),
        }
      : {
          kind: "preorder",
          quantity: String(q),
          unit: String(SINGLE_CENTS),
          channel: "event",
        };
  return {
    ok: true as const,
    item,
    quantity: q,
    books_pickup,
    unit_cents,
    amount_cents,
    email,
    name,
    metadata,
    grant_guide: item === "bundle",
    ...inv,
  };
}

/** Reject client-supplied money fields (tamper attempt). Server ignores them. */
export function clientMoneyTamperFields(body: Record<string, unknown>): string[] {
  const bad: string[] = [];
  for (const k of ["amount", "amount_cents", "unit_amount", "price", "total", "unit_cents"]) {
    if (k in body && body[k] !== undefined && body[k] !== null && body[k] !== "") bad.push(k);
  }
  return bad;
}
