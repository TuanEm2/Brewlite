/** Pure cart helpers: all amounts are integer VND (no server trust implied). */
export type PricedOption = { name: string; price: number };

export type CartItem = {
  key: string;
  productId: number;
  name: string;
  imageUrl: string;
  basePrice: number;
  size: PricedOption;
  toppings: PricedOption[];
  unitPrice: number;
  quantity: number;
  maxQuantity: number;
};

export type AddToCartInput = {
  productId: number;
  name: string;
  imageUrl: string;
  basePrice: number;
  stock: number;
  size: PricedOption;
  toppings: PricedOption[];
  quantity?: number;
};

export const MAX_CART_QUANTITY = 99;

export function normalizeToppings(toppings: PricedOption[]): PricedOption[] {
  const byName = new Map<string, PricedOption>();
  for (const topping of toppings) byName.set(topping.name, topping);
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, "vi"));
}

/** Two cups are the same cart line only when product, size and topping set match. */
export function cartKey(productId: number, sizeName: string, toppings: PricedOption[]): string {
  return JSON.stringify([productId, sizeName, normalizeToppings(toppings).map((t) => t.name)]);
}

export function unitPrice(basePrice: number, size: PricedOption, toppings: PricedOption[]): number {
  return basePrice + size.price + normalizeToppings(toppings).reduce((sum, item) => sum + item.price, 0);
}

export function cartCount(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

export function cartTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
}
