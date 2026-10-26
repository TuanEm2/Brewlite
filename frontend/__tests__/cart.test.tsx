import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CartPage from '../app/cart/page';
import { useAuthStore } from '../store/auth-store';
import { useCartStore } from '../store/cart-store';
import { formatVnd } from '../store/cart-view';

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
};

const originalFetch = globalThis.fetch;

function addDrink() {
  useCartStore.getState().addItem({
    productId: 1,
    name: 'Cà phê thử nghiệm',
    imageUrl: '',
    basePrice: 45000,
    stock: 10,
    size: { name: 'S', price: 0 },
    toppings: [],
    quantity: 1,
  });
}

// Chuẩn hóa khoảng trắng để khớp cách jest-dom so sánh nội dung.
function expectedMoney(amount: number) {
  return formatVnd(amount).replace(/\s/g, ' ');
}

describe('Giỏ hàng — thao tác trên giao diện', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    useCartStore.setState({ items: [] });
    useAuthStore.setState({ token: null, user: null });
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

  it('hiển thị giỏ trống và không cho tạo đơn', async () => {
    render(<CartPage />);

    expect(
      await screen.findByRole('heading', {
        name: 'Giỏ hàng đang trống',
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole('link', { name: 'Xem menu' }),
    ).toHaveAttribute('href', '/menu');

    expect(
      screen.queryByRole('button', { name: /Thanh toán/i }),
    ).not.toBeInTheDocument();

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('tăng, giảm số lượng và xóa món cập nhật đúng giao diện', async () => {
    const user = userEvent.setup();
    addDrink();
    render(<CartPage />);

    expect(await screen.findByTestId('cart-total'))
      .toHaveTextContent(expectedMoney(45000));

    await user.click(
      screen.getByRole('button', {
        name: 'Tăng số lượng Cà phê thử nghiệm',
      }),
    );

    expect(screen.getByTestId('cart-line-quantity'))
      .toHaveTextContent('2');
    expect(screen.getByTestId('cart-total'))
      .toHaveTextContent(expectedMoney(90000));
    expect(useCartStore.getState().items[0].quantity).toBe(2);

    await user.click(
      screen.getByRole('button', {
        name: 'Giảm số lượng Cà phê thử nghiệm',
      }),
    );

    expect(screen.getByTestId('cart-line-quantity'))
      .toHaveTextContent('1');
    expect(screen.getByTestId('cart-total'))
      .toHaveTextContent(expectedMoney(45000));
    expect(useCartStore.getState().items[0].quantity).toBe(1);

    await user.click(
      screen.getByRole('button', { name: 'Xóa' }),
    );

    expect(
      await screen.findByRole('heading', {
        name: 'Giỏ hàng đang trống',
      }),
    ).toBeInTheDocument();

    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('chuyển tới đăng nhập và giữ giỏ khi khách chưa đăng nhập', async () => {
    const user = userEvent.setup();
    addDrink();
    render(<CartPage />);

    await user.click(
      await screen.findByRole('button', {
        name: 'Đăng nhập để thanh toán',
      }),
    );

    expect(mockRouter.push)
      .toHaveBeenCalledWith('/login?redirect=/cart');
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});