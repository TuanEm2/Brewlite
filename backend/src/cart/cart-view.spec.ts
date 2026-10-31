import { cartCount, cartTotal, type CartItem } from '../../../frontend/store/cart-utils';
import {
  badgeLabel,
  describeOptions,
  formatVnd,
  lineTotal,
  maxAllowed,
} from '../../../frontend/store/cart-view';

/**
 * Sprint 2 - TV2: helpers used by the /cart page and the cart badge.
 * Runs in the backend Jest runner, like TV1's cart-store.spec.ts.
 */
describe('Sprint 2 - TV2: cart page helpers', () => {
  const cappuccinoM: CartItem = {
    key: 'k1',
    productId: 3,
    name: 'Cappuccino',
    imageUrl: '',
    basePrice: 45000,
    size: { name: 'M', price: 5000 },
    toppings: [],
    unitPrice: 50000,
    quantity: 1,
    maxQuantity: 100,
  };
  const traDaoL: CartItem = {
    key: 'k2',
    productId: 4,
    name: 'Trà đào',
    imageUrl: '',
    basePrice: 39000,
    size: { name: 'L', price: 10000 },
    toppings: [
      { name: 'Kem', price: 10000 },
      { name: 'Trân châu', price: 5000 },
    ],
    unitPrice: 64000,
    quantity: 2,
    maxQuantity: 3,
  };

  it('formats VND without decimals', () => {
    expect(formatVnd(123000).replace(/\s/g, ' ')).toBe('123.000 ₫');
    expect(formatVnd(0).replace(/\s/g, ' ')).toBe('0 ₫');
  });

  it('computes line totals and the cart total shown on the page', () => {
    expect(lineTotal(cappuccinoM)).toBe(50000);
    expect(lineTotal(traDaoL)).toBe(128000);
    expect(cartTotal([cappuccinoM, traDaoL])).toBe(178000);
    expect(cartCount([cappuccinoM, traDaoL])).toBe(3);
  });

  it('describes size and toppings for each line', () => {
    expect(describeOptions(cappuccinoM)).toBe('Size M · Không topping');
    expect(describeOptions(traDaoL)).toBe('Size L · Kem, Trân châu');
  });

  it('limits the "+" button by stock and by 99 cups per line', () => {
    expect(maxAllowed(traDaoL)).toBe(3);
    expect(maxAllowed(cappuccinoM)).toBe(99);
  });

  it('builds the badge label: hidden when empty, capped at 99+', () => {
    expect(badgeLabel(0)).toBe('');
    expect(badgeLabel(5)).toBe('5');
    expect(badgeLabel(99)).toBe('99');
    expect(badgeLabel(150)).toBe('99+');
  });
});
