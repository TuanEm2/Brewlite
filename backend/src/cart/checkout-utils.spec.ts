import type { CartItem } from '../../../frontend/store/cart-utils';
import {
  PAYMENT_METHODS,
  cartFingerprint,
  isPayable,
  methodLabel,
  paymentAttemptStorageKey,
  pendingOrderFor,
  reusableAttempt,
  statusLabel,
} from '../../../frontend/store/checkout-utils';

/**
 * Sprint 3 - TV2 (Task 8 UI): checkout helpers.
 * Runs in the backend Jest runner, like the other frontend cart specs.
 */
describe('Sprint 3 - TV2: checkout helpers', () => {
  const line = (overrides: Partial<CartItem> = {}): CartItem => ({
    key: 'k',
    productId: 3,
    name: 'Cappuccino',
    imageUrl: '',
    basePrice: 45000,
    size: { name: 'M', price: 5000 },
    toppings: [{ name: 'Kem', price: 10000 }],
    unitPrice: 60000,
    quantity: 1,
    maxQuantity: 10,
    ...overrides,
  });

  it('offers exactly the two cashless methods required: Ví and Thẻ', () => {
    expect(PAYMENT_METHODS.map((m) => m.label)).toEqual(['Ví điện tử', 'Thẻ ngân hàng']);
    expect(methodLabel('MOCK_QR')).toBe('Ví điện tử');
    expect(methodLabel('MOCK_CARD')).toBe('Thẻ ngân hàng');
  });

  it('only PENDING and PAYMENT_FAILED orders can be paid', () => {
    expect(isPayable('PENDING')).toBe(true);
    expect(isPayable('PAYMENT_FAILED')).toBe(true);
    for (const status of ['PAID', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED']) {
      expect(isPayable(status)).toBe(false);
    }
    expect(statusLabel('PAYMENT_FAILED')).toBe('Thanh toán thất bại');
  });

  describe('reusableAttempt (same key when retrying the same request)', () => {
    const saved = { orderId: 7, idempotencyKey: 'key-1', method: 'MOCK_QR', outcome: 'SUCCESS' };

    it('reuses the saved key for the identical retry', () => {
      expect(reusableAttempt(saved, 7, 'MOCK_QR', 'SUCCESS')?.idempotencyKey).toBe('key-1');
    });

    it('does not reuse the key for another order, method or outcome', () => {
      expect(reusableAttempt(saved, 8, 'MOCK_QR', 'SUCCESS')).toBeNull();
      expect(reusableAttempt(saved, 7, 'MOCK_CARD', 'SUCCESS')).toBeNull();
      expect(reusableAttempt(saved, 7, 'MOCK_QR', 'FAILURE')).toBeNull();
    });

    it('ignores missing or corrupted storage', () => {
      expect(reusableAttempt(null, 7, 'MOCK_QR', 'SUCCESS')).toBeNull();
      expect(reusableAttempt('oops', 7, 'MOCK_QR', 'SUCCESS')).toBeNull();
      expect(reusableAttempt({ ...saved, idempotencyKey: '' }, 7, 'MOCK_QR', 'SUCCESS')).toBeNull();
    });

    it('stores one attempt per order', () => {
      expect(paymentAttemptStorageKey(7)).not.toBe(paymentAttemptStorageKey(8));
    });
  });

  describe('pendingOrderFor (keep cart, return to the same order after a failed payment)', () => {
    const cart = [line(), line({ productId: 4, size: { name: 'L', price: 10000 }, toppings: [], quantity: 2 })];
    const fingerprint = cartFingerprint(cart);
    const pending = { orderId: 12, userId: 5, fingerprint };

    it('returns the existing order for the same user and unchanged cart', () => {
      expect(pendingOrderFor(pending, 5, cartFingerprint(cart))).toBe(12);
    });

    it('creates a new order when the cart or the user changes', () => {
      const changedQty = cartFingerprint([cart[0], { ...cart[1], quantity: 3 }]);
      const changedTopping = cartFingerprint([{ ...cart[0], toppings: [] }, cart[1]]);
      expect(pendingOrderFor(pending, 5, changedQty)).toBeNull();
      expect(pendingOrderFor(pending, 5, changedTopping)).toBeNull();
      expect(pendingOrderFor(pending, 6, fingerprint)).toBeNull();
      expect(pendingOrderFor(pending, undefined, fingerprint)).toBeNull();
      expect(pendingOrderFor(null, 5, fingerprint)).toBeNull();
    });
  });
});
