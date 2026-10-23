"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCartStore } from "../../store/cart-store";
import { cartCount, cartTotal } from "../../store/cart-utils";
import { describeOptions, formatVnd, lineTotal, maxAllowed } from "../../store/cart-view";

export default function CartPage() {
  const items = useCartStore((state) => state.items);
  const setQuantity = useCartStore((state) => state.setQuantity);
  const removeItem = useCartStore((state) => state.removeItem);
  const clearCart = useCartStore((state) => state.clearCart);

  // The cart lives in localStorage, so render it only after hydration on the client.
  const [mounted, setMounted] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => setMounted(true), []);

  const drinks = cartCount(items);
  const total = cartTotal(items);

  return (
    <main className="min-h-screen bg-amber-50 px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <Link href="/menu" className="font-semibold text-amber-900 hover:underline">
          ← Tiếp tục chọn món
        </Link>

        <h1 className="mt-6 text-3xl font-extrabold text-amber-950 sm:text-4xl">🛒 Giỏ hàng</h1>

        {!mounted && (
          <p role="status" className="mt-8 text-amber-900">
            Đang tải giỏ hàng...
          </p>
        )}

        {mounted && items.length === 0 && (
          <section className="mt-8 rounded-2xl border border-amber-100 bg-white p-10 text-center shadow-sm">
            <p className="text-5xl" aria-hidden="true">
              ☕
            </p>
            <h2 className="mt-4 text-xl font-bold text-gray-900">Giỏ hàng đang trống</h2>
            <p className="mt-2 text-sm text-gray-500">
              Chọn một đồ uống trong menu để bắt đầu đặt hàng.
            </p>
            <Link
              href="/menu"
              className="mt-6 inline-flex rounded-xl bg-amber-800 px-5 py-3 font-bold text-white transition hover:bg-amber-900"
            >
              Xem menu
            </Link>
          </section>
        )}

        {mounted && items.length > 0 && (
          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_18rem]">
            <section aria-label="Danh sách món trong giỏ" className="space-y-4">
              {items.map((item) => {
                const max = maxAllowed(item);
                return (
                  <article
                    key={item.key}
                    data-testid="cart-line"
                    className="flex flex-col gap-4 rounded-2xl border border-amber-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center"
                  >
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-amber-100 text-3xl">
                      {item.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                      ) : (
                        <span aria-hidden="true">🍹</span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/products/${item.productId}`}
                        className="text-lg font-bold text-gray-900 hover:underline"
                      >
                        {item.name}
                      </Link>
                      <p className="text-sm text-gray-600">{describeOptions(item)}</p>
                      <p className="mt-1 text-sm text-amber-800">Đơn giá: {formatVnd(item.unitPrice)}</p>
                    </div>

                    <div className="flex items-center gap-2" aria-label={`Số lượng ${item.name}`}>
                      <button
                        type="button"
                        onClick={() => setQuantity(item.key, item.quantity - 1)}
                        disabled={item.quantity <= 1}
                        aria-label={`Giảm số lượng ${item.name}`}
                        className="h-9 w-9 rounded-lg border border-amber-300 font-bold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        −
                      </button>
                      <span data-testid="cart-line-quantity" className="w-8 text-center font-bold" aria-live="polite">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => setQuantity(item.key, item.quantity + 1)}
                        disabled={item.quantity >= max}
                        aria-label={`Tăng số lượng ${item.name}`}
                        className="h-9 w-9 rounded-lg border border-amber-300 font-bold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
                      <p data-testid="cart-line-total" className="font-extrabold text-amber-700">
                        {formatVnd(lineTotal(item))}
                      </p>
                      <button
                        type="button"
                        onClick={() => removeItem(item.key)}
                        className="text-sm font-semibold text-red-700 hover:underline"
                      >
                        Xóa
                      </button>
                    </div>
                    {item.quantity >= max && (
                      <p className="text-xs text-gray-500 sm:basis-full">Đã đạt số lượng tối đa ({max} ly).</p>
                    )}
                  </article>
                );
              })}

              <div className="flex justify-end">
                {confirmClear ? (
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-gray-700">Xóa toàn bộ giỏ hàng?</span>
                    <button
                      type="button"
                      onClick={() => {
                        clearCart();
                        setConfirmClear(false);
                      }}
                      className="font-semibold text-red-700 hover:underline"
                    >
                      Xóa hết
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClear(false)}
                      className="font-semibold text-gray-600 hover:underline"
                    >
                      Hủy
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmClear(true)}
                    className="text-sm font-semibold text-gray-600 hover:text-red-700 hover:underline"
                  >
                    Xóa toàn bộ giỏ hàng
                  </button>
                )}
              </div>
            </section>

            <aside className="h-fit rounded-2xl border border-amber-100 bg-white p-5 shadow-sm lg:sticky lg:top-6">
              <h2 className="text-lg font-bold text-gray-900">Tóm tắt</h2>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-600">Số ly</dt>
                  <dd className="font-semibold">{drinks}</dd>
                </div>
                <div className="flex justify-between border-t border-amber-100 pt-2 text-base">
                  <dt className="font-bold text-gray-900">Tổng tiền</dt>
                  <dd data-testid="cart-total" className="font-extrabold text-amber-700">
                    {formatVnd(total)}
                  </dd>
                </div>
              </dl>
              <button
                type="button"
                disabled
                title="Đặt hàng và thanh toán được nối ở Task 6–8"
                className="mt-5 w-full rounded-xl bg-gray-400 px-5 py-3 font-bold text-white disabled:cursor-not-allowed"
              >
                Thanh toán {formatVnd(total)}
              </button>
              <p className="mt-2 text-xs text-gray-500">
                Đặt hàng và thanh toán sẽ được nối ở các task tiếp theo. Giá sẽ được kiểm tra lại khi đặt hàng.
              </p>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
