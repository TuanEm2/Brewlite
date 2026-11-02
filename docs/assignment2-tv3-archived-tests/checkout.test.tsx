import { cleanup, render, screen } from '@testing-library/react';
import CheckoutPage from '../app/checkout/[id]/page';
import { useAuthStore } from '../store/auth-store';
import { useCartStore } from '../store/cart-store';
import userEvent from '@testing-library/user-event';
import {
  cartFingerprint,
  PENDING_CHECKOUT_KEY,
} from '../store/checkout-utils';

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: '42' }),
  useRouter: () => mockRouter,
}));

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
};

const originalFetch = globalThis.fetch;

function addDrink(productId: number, name: string) {
  useCartStore.getState().addItem({
    productId,
    name,
    imageUrl: '',
    basePrice: 45000,
    stock: 10,
    size: { name: 'S', price: 0 },
    toppings: [],
    quantity: 1,
  });
}

describe('Checkout — bảo vệ giỏ khi thanh toán đơn cũ', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    useCartStore.setState({ items: [] });
    useAuthStore.setState({
      token: 'test-token',
      user: { id: 7, email: 'customer@example.com' },
    });

    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 42,
        status: 'PAID',
        total: 45000,
        discount: 0,
        voucherCode: null,
        createdAt: '2026-10-26T00:00:00.000Z',
        items: [],
      }),
    });
  });

  afterEach(() => {
    cleanup();
    useCartStore.setState({ items: [] });
    useAuthStore.setState({ token: null, user: null });
    localStorage.clear();
    sessionStorage.clear();
    globalThis.fetch = originalFetch;
  });

  it('không xóa món mới khi mở đơn cũ đã PAID', async () => {
    // Giỏ lúc tạo đơn 42 chỉ có món A.
    addDrink(1, 'Món A');

    sessionStorage.setItem(
      PENDING_CHECKOUT_KEY,
      JSON.stringify({
        orderId: 42,
        userId: 7,
        fingerprint: cartFingerprint(useCartStore.getState().items),
      }),
    );

    // Sau khi tạo đơn, khách thêm món B vào giỏ.
    addDrink(2, 'Món B');

    render(<CheckoutPage />);

    expect(
      await screen.findByRole('heading', {
        name: 'Đặt hàng thành công',
      }),
    ).toBeInTheDocument();

    // Xác nhận checkout đã gọi API đúng đơn.
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/orders\/42$/),
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-token' },
      }),
    );

    // Món mới không thuộc đơn 42 phải được giữ lại.
    const newDrink = useCartStore
      .getState()
      .items.find((item) => item.productId === 2);

    expect(newDrink).toBeDefined();
    expect(newDrink?.quantity).toBe(1);
  });

  it('xóa giỏ không thay đổi khi đúng đơn đã PAID', async () => {
    addDrink(1, 'Món A');

    sessionStorage.setItem(
      PENDING_CHECKOUT_KEY,
      JSON.stringify({
        orderId: 42,
        userId: 7,
        fingerprint: cartFingerprint(useCartStore.getState().items),
      }),
    );

    // Không thêm hoặc sửa món sau khi tạo đơn.
    render(<CheckoutPage />);

    expect(
      await screen.findByRole('heading', {
        name: 'Đặt hàng thành công',
      }),
    ).toBeInTheDocument();

    expect(useCartStore.getState().items).toHaveLength(0);
    expect(sessionStorage.getItem(PENDING_CHECKOUT_KEY)).toBeNull();
  });

  it('xóa giỏ không thay đổi khi đơn có voucher', async () => {
    addDrink(1, 'Món A');

    sessionStorage.setItem(
      PENDING_CHECKOUT_KEY,
      JSON.stringify({
        orderId: 42,
        userId: 7,
        fingerprint:
          cartFingerprint(useCartStore.getState().items) + '|v:BREW10',
      }),
    );

    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 42,
        status: 'PAID',
        total: 63000,
        discount: 7000,
        voucherCode: 'BREW10',
        createdAt: '2026-10-26T00:00:00.000Z',
        items: [],
      }),
    });

    render(<CheckoutPage />);

    expect(
      await screen.findByRole('heading', {
        name: 'Đặt hàng thành công',
      }),
    ).toBeInTheDocument();

    expect(useCartStore.getState().items).toHaveLength(0);
    expect(sessionStorage.getItem(PENDING_CHECKOUT_KEY)).toBeNull();
  });

  it('không xóa giỏ khi dữ liệu đơn chờ thuộc tài khoản khác', async () => {
    addDrink(1, 'Món A');

    const savedPending = JSON.stringify({
      orderId: 42,
      userId: 99,
      fingerprint: cartFingerprint(useCartStore.getState().items),
    });

    sessionStorage.setItem(PENDING_CHECKOUT_KEY, savedPending);

    render(<CheckoutPage />);

    expect(
      await screen.findByRole('heading', {
        name: 'Đặt hàng thành công',
      }),
    ).toBeInTheDocument();

    expect(useCartStore.getState().items).toHaveLength(1);
    expect(sessionStorage.getItem(PENDING_CHECKOUT_KEY))
      .toBe(savedPending);
  });

  it('thanh toán đơn PENDING và hiển thị xác nhận thành công', async () => {
    const user = userEvent.setup();
    addDrink(1, 'Món A');

    sessionStorage.setItem(
      PENDING_CHECKOUT_KEY,
      JSON.stringify({
        orderId: 42,
        userId: 7,
        fingerprint: cartFingerprint(useCartStore.getState().items),
      }),
    );

    // Dùng khóa đã lưu để kiểm tra gửi lại đúng yêu cầu thanh toán.
    const paymentKey = '26c0d1fa-5f34-4e1c-9d76-ff2c8854ff01';
    sessionStorage.setItem(
      'brewlite-mock-payment-42',
      JSON.stringify({
        orderId: 42,
        idempotencyKey: paymentKey,
        method: 'MOCK_QR',
        outcome: 'SUCCESS',
      }),
    );

    const pendingOrder = {
      id: 42,
      status: 'PENDING',
      total: 45000,
      discount: 0,
      voucherCode: null,
      createdAt: '2026-10-26T00:00:00.000Z',
      items: [{
        id: 1,
        productId: 1,
        size: 'S',
        toppings: [],
        quantity: 1,
        lineTotal: 45000,
      }],
    };

    const jsonResponse = (body: unknown) => ({
      ok: true,
      status: 200,
      json: async () => body,
    });

    const fetchMock = globalThis.fetch as jest.Mock;
    fetchMock.mockReset();
    fetchMock
      // Tải đơn lần đầu.
      .mockResolvedValueOnce(jsonResponse(pendingOrder))
      // API thanh toán trả thành công.
      .mockResolvedValueOnce(jsonResponse({
        orderId: 42,
        status: 'PAID',
        outcome: 'SUCCESS',
        amount: 45000,
        method: 'MOCK_QR',
        idempotencyKey: paymentKey,
        replayed: false,
        message: 'Thanh toán thành công',
      }))
      // Checkout tải lại trạng thái sau thanh toán.
      .mockResolvedValueOnce(jsonResponse({
        ...pendingOrder,
        status: 'PAID',
      }));

    render(<CheckoutPage />);

    const payButton = await screen.findByRole('button', {
      name: /Xác nhận trả/,
    });
    expect(screen.getByText(/Món A/)).toBeInTheDocument();

    await user.click(payButton);

    expect(
      await screen.findByRole('heading', {
        name: 'Đặt hàng thành công',
      }),
    ).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [paymentUrl, paymentOptions] = fetchMock.mock.calls[1];
    expect(paymentUrl).toMatch(/\/payments\/mock$/);
    expect(paymentOptions.method).toBe('POST');
    expect(paymentOptions.headers.Authorization).toBe('Bearer test-token');
    expect(JSON.parse(paymentOptions.body)).toEqual({
      orderId: 42,
      idempotencyKey: paymentKey,
      method: 'MOCK_QR',
      outcome: 'SUCCESS',
    });

    expect(useCartStore.getState().items).toHaveLength(0);
    expect(sessionStorage.getItem(PENDING_CHECKOUT_KEY)).toBeNull();
    expect(sessionStorage.getItem('brewlite-mock-payment-42')).toBeNull();
  });

  it('giữ giỏ khi mất mạng và dùng lại khóa khi thử thanh toán lại', async () => {
    const user = userEvent.setup();
    addDrink(1, 'Món A');

    sessionStorage.setItem(
      PENDING_CHECKOUT_KEY,
      JSON.stringify({
        orderId: 42,
        userId: 7,
        fingerprint: cartFingerprint(useCartStore.getState().items),
      }),
    );

    const attempt = {
      orderId: 42,
      idempotencyKey: '26c0d1fa-5f34-4e1c-9d76-ff2c8854ff01',
      method: 'MOCK_QR',
      outcome: 'SUCCESS',
    };

    sessionStorage.setItem(
      'brewlite-mock-payment-42',
      JSON.stringify(attempt),
    );

    const pendingOrder = {
      id: 42,
      status: 'PENDING',
      total: 45000,
      discount: 0,
      voucherCode: null,
      createdAt: '2026-10-26T00:00:00.000Z',
      items: [],
    };

    const jsonResponse = (body: unknown) => ({
      ok: true,
      status: 200,
      json: async () => body,
    });

    const fetchMock = globalThis.fetch as jest.Mock;
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(pendingOrder))
      // Lần thanh toán đầu mất kết nối, chưa biết kết quả.
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      // Gửi lại: backend trả kết quả đã xử lý.
      .mockResolvedValueOnce(jsonResponse({
        ...attempt,
        status: 'PAID',
        amount: 45000,
        replayed: true,
        message: 'Giao dịch đã được xử lý',
      }))
      .mockResolvedValueOnce(jsonResponse({
        ...pendingOrder,
        status: 'PAID',
      }));

    render(<CheckoutPage />);

    await user.click(
      await screen.findByRole('button', { name: /Xác nhận trả/ }),
    );

    expect(await screen.findByRole('alert'))
      .toHaveTextContent('Mất kết nối');
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(
      JSON.parse(sessionStorage.getItem('brewlite-mock-payment-42')!),
    ).toEqual(attempt);

    await user.click(
      screen.getByRole('button', { name: /Thử lại.*Xác nhận trả/ }),
    );

    expect(
      await screen.findByRole('heading', {
        name: 'Đặt hàng thành công',
      }),
    ).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledTimes(4);

    // Hai lần POST thanh toán phải gửi cùng nội dung và khóa.
    const firstPayment = fetchMock.mock.calls[1];
    const retryPayment = fetchMock.mock.calls[2];

    expect(firstPayment[0]).toMatch(/\/payments\/mock$/);
    expect(retryPayment[0]).toBe(firstPayment[0]);
    expect(firstPayment[1].method).toBe('POST');
    expect(retryPayment[1].method).toBe('POST');
    expect(JSON.parse(firstPayment[1].body)).toEqual(attempt);
    expect(JSON.parse(retryPayment[1].body)).toEqual(attempt);

    expect(useCartStore.getState().items).toHaveLength(0);
    expect(sessionStorage.getItem('brewlite-mock-payment-42')).toBeNull();
  });

  it('giữ giỏ và cho phép thử lại khi thanh toán bị từ chối', async () => {
    const user = userEvent.setup();
    addDrink(1, 'Món A');

    const pendingCheckout = {
      orderId: 42,
      userId: 7,
      fingerprint: cartFingerprint(useCartStore.getState().items),
    };

    sessionStorage.setItem(
      PENDING_CHECKOUT_KEY,
      JSON.stringify(pendingCheckout),
    );

    const attempt = {
      orderId: 42,
      idempotencyKey: '26c0d1fa-5f34-4e1c-9d76-ff2c8854ff02',
      method: 'MOCK_QR',
      outcome: 'FAILURE',
    };

    sessionStorage.setItem(
      'brewlite-mock-payment-42',
      JSON.stringify(attempt),
    );

    const pendingOrder = {
      id: 42,
      status: 'PENDING',
      total: 45000,
      discount: 0,
      voucherCode: null,
      createdAt: '2026-10-26T00:00:00.000Z',
      items: [],
    };

    const jsonResponse = (body: unknown) => ({
      ok: true,
      status: 200,
      json: async () => body,
    });

    const fetchMock = globalThis.fetch as jest.Mock;
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(pendingOrder))
      .mockResolvedValueOnce(jsonResponse({
        ...attempt,
        status: 'PAYMENT_FAILED',
        amount: 45000,
        replayed: false,
        message: 'Thanh toán thất bại',
      }))
      .mockResolvedValueOnce(jsonResponse({
        ...pendingOrder,
        status: 'PAYMENT_FAILED',
      }));

    render(<CheckoutPage />);

    await user.click(
      await screen.findByRole('radio', { name: 'Thất bại' }),
    );
    await user.click(
      screen.getByRole('button', { name: /Xác nhận trả/ }),
    );

    expect(await screen.findByRole('alert'))
      .toHaveTextContent('Thanh toán không thành công');

    expect(
      await screen.findByText('PAYMENT_FAILED · Thanh toán thất bại'),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole('heading', { name: 'Đặt hàng thành công' }),
    ).not.toBeInTheDocument();

    expect(
      screen.getByRole('button', { name: /Thử lại.*Xác nhận trả/ }),
    ).toBeEnabled();

    expect(useCartStore.getState().items).toHaveLength(1);
    expect(
      JSON.parse(sessionStorage.getItem(PENDING_CHECKOUT_KEY)!),
    ).toEqual(pendingCheckout);

    // Đã biết kết quả: bỏ khóa cũ để lần thử mới dùng khóa mới.
    expect(sessionStorage.getItem('brewlite-mock-payment-42')).toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual(attempt);
  });

});