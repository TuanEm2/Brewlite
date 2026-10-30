/** Pure helpers for displaying the cart (Sprint 2, Task 5 UI – TV2). */
import { MAX_CART_QUANTITY, type CartItem } from "./cart-utils";

/** Format integer VND, e.g. 123000 -> "123.000 ₫". */
export function formatVnd(value: number): string {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(value);
}

/** Money for one cart line: unit price × quantity. */
export function lineTotal(item: Pick<CartItem, "unitPrice" | "quantity">): number {
  return item.unitPrice * item.quantity;
}

/** Short description of the chosen options, e.g. "Size M · Trân châu, Kem". */
export function describeOptions(item: Pick<CartItem, "size" | "toppings">): string {
  const toppings = item.toppings.length
    ? item.toppings.map((topping) => topping.name).join(", ")
    : "Không topping";
  return `Size ${item.size.name} · ${toppings}`;
}

/** Highest quantity the "+" button may reach for this line. */
export function maxAllowed(item: Pick<CartItem, "maxQuantity">): number {
  return Math.min(item.maxQuantity, MAX_CART_QUANTITY);
}

/** Text for the cart badge: hidden at 0, capped at "99+". */
export function badgeLabel(count: number): string {
  if (count <= 0) return "";
  return count > 99 ? "99+" : String(count);
}
