import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CartPage from '../app/cart/page';
import { useAuthStore } from '../store/auth-store';
import { useCartStore } from '../store/cart-store';
import {
  cartFingerprint,
  PENDING_CHECKOUT_KEY,
} from '../store/checkout-utils';

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
};

const originalFetch = globalThis.fetch;

describe('Giỏ hàng — tạo đơn thành công', () => {
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

  it('gửi đúng yêu cầu, mở checkout và giữ giỏ khi đơn mới PENDING', async () => {
    const user = userEvent.setup();

    useCartStore.getState().addItem({
      productId: 3,
      name: 'Cappuccino',
      imageUrl: '',
      basePrice: 45000,
      stock: 10,
      size: { name: 'M', price: 5000 },
      toppings: [{ name: 'Kem', price: 10000 }],
      quantity: 2,
    });

    const cartBefore = JSON.parse(
      JSON.stringify(useCartStore.getState().items),
    );
    const fingerprint = cartFingerprint(
      useCartStore.getState().items,
    );

    const items = [
      {
        productId: 3,
        size: 'M',
        toppings: ['Kem'],
        quantity: 2,
      },
    ];
    const key = '26c0d1fa-5f34-4e1c-9d76-ff2c8854ff04';

    // Chuẩn bị khóa hợp lệ cho đúng tài khoản và nội dung yêu cầu.
    sessionStorage.setItem(
      'brewlite-create-order-attempt',
      JSON.stringify({
        fingerprint: JSON.stringify({ userId: 7, items }),
        key,
      }),
    );

    const fetchMock = globalThis.fetch as jest.Mock;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        id: 42,
        status: 'PENDING',
        total: 120000,
        discount: 0,
        voucherCode: null,
      }),
    });

    render(<CartPage />);

    await user.click(
      await screen.findByRole('button', { name: /^Thanh toán/ }),
    );

    await waitFor(() => {
      expect(mockRouter.push).toHaveBeenCalledWith('/checkout/42');
    });

    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/orders$/),
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
        },
      }),
    );

    const request = fetchMock.mock.calls[0][1] as RequestInit;

    // Chỉ gửi lựa chọn và số lượng; không gửi giá tự quyết định.
    expect(JSON.parse(request.body as string)).toEqual({
      items,
      idempotencyKey: key,
    });

    expect(useCartStore.getState().items).toEqual(cartBefore);

    expect(
      JSON.parse(sessionStorage.getItem(PENDING_CHECKOUT_KEY)!),
    ).toEqual({
      orderId: 42,
      userId: 7,
      fingerprint,
    });

    expect(
      sessionStorage.getItem('brewlite-create-order-attempt'),
    ).toBeNull();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});