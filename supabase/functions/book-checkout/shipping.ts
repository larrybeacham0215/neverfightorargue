// Book shipping (Larry, Nov 18, 2026): $7 for the first book in an order, plus $2 for each additional book.
// 1 book = $7, 2 = $9, 5 = $15, 10 = $25. Always computed on the server from the book count.
export const SHIP_FIRST_CENTS = 700;
export const SHIP_EACH_EXTRA_CENTS = 200;
export function shippingCents(books: number): number {
  const n = Math.floor(Number(books) || 0);
  return n < 1 ? 0 : SHIP_FIRST_CENTS + SHIP_EACH_EXTRA_CENTS * (n - 1);
}
export function shippingLabel(books: number): string {
  const n = Math.floor(Number(books) || 0);
  return n <= 1 ? "Shipping (1 book)" : `Shipping (${n} books: $7 first + $2 each additional)`;
}
