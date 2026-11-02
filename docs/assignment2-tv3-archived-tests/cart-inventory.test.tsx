import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CartPage from '../app/cart/page';
import { useAuthStore } from '../store/auth-store';
import { useCartStore } from '../store/cart-store';
import { PENDING_CHECKOUT_KEY } from '../store/checkout-utils';

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
};

const originalFetch = globalThis.fetch;

describe('Giỏ hàng — API từ chối vì thiếu nguyên liệu', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    useCartStore.setState({ items: [] });
    useAuthStore.setState({
      token: 'test-token',
      user: { id: 7, email: 'tv3@example.com' },
    });
    mockRouter.push.mockClear();
    mockRouter.replace.mockClear();
    globalThis.fetch = jest.fn();
  });

  afterEach(() => {
    cleanup();
    useCartStore.setState({ items: [] });
    useAuthStore.setState({ token: null, user: null });
    localStorage.clear();
    sessionStorage.clear();
    globalThis.fetch = originalFetch;
  });

  it('hiện lỗi, giữ giỏ và không chuyển sang checkout khi API trả 409', async () => {
    const user = userEvent.setup();

    useCartStore.getState().addItem({
      productId: 3,
      name: 'Cappuccino',
      imageUrl: '',
      basePrice: 45000,
      stock: 10,
      size: { name: 'M', price: 5000 },
      toppings: [],
      quantity: 1,
    });

    const cartBefore = JSON.parse(
      JSON.stringify(useCartStore.getState().items),
    );

    // Chuẩn bị một yêu cầu đang chờ để không phụ thuộc
    // crypto.randomUUID trong môi trường trình duyệt giả lập.
    const items = [
      { productId: 3, size: 'M', toppings: [], quantity: 1 },
    ];
    const key = '26c0d1fa-5f34-4e1c-9d76-ff2c8854ff03';

    sessionStorage.setItem(
      'brewlite-create-order-attempt',
      JSON.stringify({
        fingerprint: JSON.stringify({ userId: 7, items }),
        key,
      }),
    );

    const message =
      'Nguyên liệu "Sữa tươi" đã hết (chỉ còn 0), không đủ cho đơn hàng này!';

    const fetchMock = globalThis.fetch as jest.Mock;
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ message }),
    });

    render(<CartPage />);

    await user.click(
      await screen.findByRole('button', { name: /^Thanh toán/ }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/orders$/),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      }),
    );

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(request.body as string)).toEqual({
      items,
      idempotencyKey: key,
    });

    expect(useCartStore.getState().items).toEqual(cartBefore);
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(PENDING_CHECKOUT_KEY)).toBeNull();
    expect(
      screen.getByRole('button', { name: /^Thanh toán/ }),
    ).toBeEnabled();
  });
});