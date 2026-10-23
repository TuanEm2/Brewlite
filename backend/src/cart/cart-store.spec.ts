import {
  cartCount,
  cartKey,
  cartTotal,
  unitPrice,
  type AddToCartInput,
} from '../../../frontend/store/cart-utils';

/**
 * Monorepo: reuse the backend's installed Jest + ts-jest test runner
 * to exercise the actual frontend Zustand cart, without extra test dependencies.
 */
describe('Sprint 2 - TV1: cart logic and Zustand actions', () => {
  const memory = new Map<string, string>();
  let useCartStore: typeof import('../../../frontend/store/cart-store').useCartStore;

  const storage = {
    getItem: (key: string): string | null => memory.get(key) ?? null,
    setItem: (key: string, value: string): void => { memory.set(key, value); },
    removeItem: (key: string): void => { memory.delete(key); },
    clear: (): void => { memory.clear(); },
    key: (index: number): string | null => [...memory.keys()][index] ?? null,
    get length(): number { return memory.size; },
  };

  const cappuccino: AddToCartInput = {
    productId: 3,
    name: 'Cappuccino',
    imageUrl: '/cappuccino.png',
    basePrice: 45000,
    stock: 5,
    size: { name: 'L', price: 10000 },
    toppings: [{ name: 'Kem', price: 10000 }, { name: 'Trân châu', price: 5000 }],
  };

  beforeAll(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: storage,
    });
    // load the store only after localStorage is available in Node/Jest
    ({ useCartStore } = require('../../../frontend/store/cart-store') as
      typeof import('../../../frontend/store/cart-store'));
  });

  beforeEach(() => {
    useCartStore.getState().clearCart();
    memory.clear();
  });

  afterAll(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  it('calculates VND price and totals, regardless of topping order', () => {
    expect(unitPrice(45000, { name: 'L', price: 10000 }, cappuccino.toppings)).toBe(70000);
    expect(cartKey(3, 'L', cappuccino.toppings)).toBe(
      cartKey(3, 'L', [...cappuccino.toppings].reverse()),
    );
    expect(cartKey(3, 'S', cappuccino.toppings)).not.toBe(
      cartKey(3, 'L', cappuccino.toppings),
    );
  });

  it('adds cups with the same product, size and toppings to one line', () => {
    expect(useCartStore.getState().addItem(cappuccino).added).toBe(true);
    expect(useCartStore.getState().addItem({
      ...cappuccino,
      toppings: [...cappuccino.toppings].reverse(),
    }).added).toBe(true);
    const items = useCartStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(2);
    expect(cartCount(items)).toBe(2);
    expect(cartTotal(items)).toBe(140000);
  });

  it('creates separate lines for different sizes/toppings', () => {
    useCartStore.getState().addItem(cappuccino);
    useCartStore.getState().addItem({
      ...cappuccino,
      size: { name: 'S', price: 0 },
      toppings: [],
    });
    const items = useCartStore.getState().items;
    expect(items).toHaveLength(2);
    expect(cartTotal(items)).toBe(115000);
  });

  it('limits quantity by current stock', () => {
    expect(useCartStore.getState().addItem({ ...cappuccino, stock: 2, quantity: 2 }).added).toBe(true);
    expect(useCartStore.getState().addItem({ ...cappuccino, stock: 2 }).added).toBe(false);
    const key = useCartStore.getState().items[0].key;
    useCartStore.getState().setQuantity(key, 50);
    expect(useCartStore.getState().items[0].quantity).toBe(2);
  });

  it('never exceeds 99 cups per line, even if stock is higher', () => {
    useCartStore.getState().addItem({ ...cappuccino, stock: 200, quantity: 200 });
    expect(useCartStore.getState().items[0].quantity).toBe(99);
  });

  it('rejects invalid stock, quantity and prices', () => {
    expect(useCartStore.getState().addItem({ ...cappuccino, stock: 0 }).added).toBe(false);
    expect(useCartStore.getState().addItem({ ...cappuccino, quantity: -1 }).added).toBe(false);
    expect(useCartStore.getState().addItem({ ...cappuccino, basePrice: -10 }).added).toBe(false);
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('supports updating quantity, removing items and clearing', () => {
    useCartStore.getState().addItem(cappuccino);
    const key = useCartStore.getState().items[0].key;
    useCartStore.getState().setQuantity(key, 3);
    expect(cartTotal(useCartStore.getState().items)).toBe(210000);
    useCartStore.getState().removeItem(key);
    expect(useCartStore.getState().items).toHaveLength(0);
    useCartStore.getState().addItem(cappuccino);
    useCartStore.getState().clearCart();
    expect(cartCount(useCartStore.getState().items)).toBe(0);
  });

  it('persists only cart items in localStorage', () => {
    useCartStore.getState().addItem(cappuccino);
    const raw = memory.get('brewlite-cart-v1');
    expect(raw).toBeDefined();
    const stored = JSON.parse(raw!);
    expect(stored.state.items).toHaveLength(1);
    expect(stored.state.addItem).toBeUndefined();
  });
});
