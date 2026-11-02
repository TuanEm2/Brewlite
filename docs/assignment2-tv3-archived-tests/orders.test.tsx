import {
  cleanup,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import OrderHistoryPage from '../app/orders/page';
import { useAuthStore } from '../store/auth-store';

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
};

const originalFetch = globalThis.fetch;

describe('Lịch sử đơn — xác thực và lỗi API', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    mockRouter.push.mockClear();
    mockRouter.replace.mockClear();

    useAuthStore.setState({
      token: 'test-token',
      user: { id: 7, email: 'customer@example.com' },
    });

    globalThis.fetch = jest.fn();
  });

  afterEach(() => {
    cleanup();
    useAuthStore.setState({ token: null, user: null });
    localStorage.clear();
    sessionStorage.clear();
    globalThis.fetch = originalFetch;
  });

  it('yêu cầu đăng nhập và không gọi API khi chưa có token', async () => {
    useAuthStore.setState({ token: null, user: null });

    render(<OrderHistoryPage />);

    await waitFor(() => {
      expect(mockRouter.replace)
        .toHaveBeenCalledWith('/login?redirect=/orders');
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it.each([
    {
      status: 401,
      message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    },
    {
      status: 500,
      message: 'Không thể tải danh sách đơn hàng.',
    },
  ])('hiển thị thông báo khi API trả $status', async ({
    status,
    message,
  }) => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status,
      json: async () => ({ message: 'API error' }),
    });

    render(<OrderHistoryPage />);

    expect(await screen.findByText(message)).toBeInTheDocument();

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/orders\/me$/),
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer test-token',
        },
        cache: 'no-store',
      }),
    );

    expect(
      screen.queryByText('Đang tải lịch sử đơn hàng...'),
    ).not.toBeInTheDocument();
  });

  it('hiển thị lịch sử trống và liên kết về menu', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    });

    render(<OrderHistoryPage />);

    expect(
      await screen.findByRole('heading', {
        name: 'Bạn chưa có đơn hàng nào',
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole('link', { name: 'Xem menu ngay' }),
    ).toHaveAttribute('href', '/menu');

    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('hiển thị đúng đơn đã thanh toán và liên kết chi tiết', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{
        id: 42,
        status: 'PAID',
        total: 63000,
        discount: 7000,
        voucherCode: 'BREW10',
        createdAt: '2026-10-26T00:00:00.000Z',
        items: [{
          id: 1,
          productId: 3,
          size: 'L',
          toppings: [{ name: 'Kem', price: 15000 }],
          quantity: 1,
          unitPrice: 70000,
          lineTotal: 70000,
        }],
      }],
    });

    render(<OrderHistoryPage />);

    expect(
      await screen.findByRole('heading', { name: '#42' }),
    ).toBeInTheDocument();

    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByText('Đã thanh toán (PAID)'))
      .toBeInTheDocument();
    expect(screen.getByText('Đồ uống #3 · Size L ×1'))
      .toBeInTheDocument();
    expect(screen.getByText('Topping: Kem'))
      .toBeInTheDocument();

    // Dùng biểu thức cho khoảng trắng để tránh khác biệt NBSP.
    expect(
      screen.getByText(/^Tổng thanh toán:/),
    ).toHaveTextContent(/Tổng thanh toán:\s*63\.000\s*₫/);

    expect(
      screen.getByText(/^Voucher/),
    ).toHaveTextContent(/Voucher \(BREW10\):\s*-7\.000\s*₫/);

    expect(
      screen.getByRole('link', { name: 'Xem hóa đơn / chi tiết' }),
    ).toHaveAttribute('href', '/checkout/42');

    expect(
      screen.queryByRole('link', { name: /Thanh toán ngay/ }),
    ).not.toBeInTheDocument();

    expect(
      screen.queryByRole('heading', {
        name: 'Bạn chưa có đơn hàng nào',
      }),
    ).not.toBeInTheDocument();
  });

});