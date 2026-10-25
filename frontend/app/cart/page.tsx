"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuthStore } from "../../store/auth-store";
import { useCartStore } from "../../store/cart-store";
import { cartCount, cartTotal } from "../../store/cart-utils";
import { describeOptions, formatVnd, lineTotal, maxAllowed } from "../../store/cart-view";
import {
  PENDING_CHECKOUT_KEY,
  cartFingerprint,
  pendingOrderFor,
  readSession,
  writeSession,
} from "../../store/checkout-utils";

export default function CartPage() {
  const router = useRouter();
  const items = useCartStore((state) => state.items);
  const setQuantity = useCartStore((state) => state.setQuantity);
  const removeItem = useCartStore((state) => state.removeItem);
  const clearCart = useCartStore((state) => state.clearCart);

  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);

  // The cart lives in localStorage, so render it only after hydration on the client.
  const [mounted, setMounted] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [voucherCode, setVoucherCode] = useState("");

  useEffect(() => setMounted(true), []);

  const drinks = cartCount(items);
  const total = cartTotal(items);

  const apiUrl = (
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"
  ).replace(/\/+$/, "");

  // Ước tính giảm giá nếu áp dụng voucher demo BREW10
  const normalizedVoucher = voucherCode.trim().toUpperCase();
  const estimatedDiscount =
    normalizedVoucher === "BREW10" && total >= 50000
      ? Math.min(Math.floor(total * 0.1), 20000)
      : 0;

  async function handleCreateOrder() {
    if (!token) {
      router.push("/login?redirect=/cart");
      return;
    }

    // Giỏ này kèm voucher đã có đơn chờ thanh toán (vd: lần trước thanh toán lỗi) → quay lại đúng đơn đó,
    // không tạo thêm đơn mới. Đổi món/số lượng/voucher sẽ tạo đơn mới.
    const rawFingerprint = cartFingerprint(items);
    const fingerprint = rawFingerprint + (normalizedVoucher ? `|v:${normalizedVoucher}` : "");
    const pendingOrderId = pendingOrderFor(readSession(PENDING_CHECKOUT_KEY), user?.id, fingerprint);
    if (pendingOrderId !== null) {
      router.push(`/checkout/${pendingOrderId}`);
      return;
    }

    setOrderError(null);
    setOrdering(true);

    try {
      const orderPayload = {
        items: items.map((item) => ({
          productId: item.productId,
          size: item.size.name,
          toppings: item.toppings.map((t) => t.name),
          quantity: item.quantity,
        })),
        ...(normalizedVoucher ? { voucherCode: normalizedVoucher } : {}),
      };

      // Lưu khóa theo đúng user + giỏ + voucher hiện tại. Khi timeout, retry vẫn cùng key.
      const requestFingerprint = JSON.stringify({ userId: user?.id, ...orderPayload });
      const storageKey = "brewlite-create-order-attempt";
      let existing: { fingerprint: string; key: string } | null = null;
      try {
        const saved = sessionStorage.getItem(storageKey);
        if (saved) existing = JSON.parse(saved) as { fingerprint: string; key: string };
      } catch { /* trình duyệt có thể chặn sessionStorage */ }
      const idempotencyKey = existing?.fingerprint === requestFingerprint
        ? existing.key
        : crypto.randomUUID();
      try {
        sessionStorage.setItem(storageKey, JSON.stringify({ fingerprint: requestFingerprint, key: idempotencyKey }));
      } catch { /* vẫn gửi key trong yêu cầu hiện tại */ }

      const res = await fetch(`${apiUrl}/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ...orderPayload, idempotencyKey }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login?redirect=/cart");
          throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
        }
        if (res.status === 409) {
          throw new Error(data.message || "Sản phẩm trong giỏ đã vượt quá tồn kho.");
        }
        throw new Error(data.message || "Không thể tạo đơn hàng.");
      }

      try { sessionStorage.removeItem(storageKey); } catch { /* no storage */ }
      // KHÔNG xóa giỏ ở đây: đơn mới ở PENDING. Giỏ chỉ được xóa khi thanh toán thành công
      // (US-05: thanh toán lỗi thì giỏ hàng được giữ nguyên).
      const orderId = (data as { id: number }).id;
      if (user) writeSession(PENDING_CHECKOUT_KEY, { orderId, userId: user.id, fingerprint });
      router.push(`/checkout/${orderId}`);
    } catch (err: unknown) {
      setOrderError(err instanceof Error ? err.message : "Đã có lỗi xảy ra.");
    } finally {
      setOrdering(false);
    }
  }

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
              {orderError && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
                >
                  {orderError}
                </div>
              )}

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
              <h2 className="text-lg font-bold text-gray-900">Tóm tắt đơn hàng</h2>
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
                {estimatedDiscount > 0 && (
                  <div className="flex justify-between text-sm text-green-700">
                    <dt className="font-medium">Ước tính giảm ({normalizedVoucher})</dt>
                    <dd className="font-bold">-{formatVnd(estimatedDiscount)}</dd>
                  </div>
                )}
                {estimatedDiscount > 0 && (
                  <div className="flex justify-between border-t border-amber-100 pt-2 text-base">
                    <dt className="font-bold text-gray-900">Cần thanh toán</dt>
                    <dd className="font-extrabold text-amber-800">
                      {formatVnd(total - estimatedDiscount)}
                    </dd>
                  </div>
                )}
              </dl>

              {/* Ô nhập voucher */}
              <div className="mt-4 border-t border-amber-100 pt-3">
                <label htmlFor="voucherInput" className="block text-xs font-bold text-gray-700">
                  Mã giảm giá (Voucher)
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    id="voucherInput"
                    type="text"
                    placeholder="VD: BREW10"
                    value={voucherCode}
                    onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                    className="w-full rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-amber-950 focus:border-amber-700 focus:outline-none"
                  />
                </div>
                <p className="mt-1 text-[11px] text-gray-500">
                  Mã demo: <strong className="text-amber-800">BREW10</strong> (giảm 10% tối đa 20.000đ cho đơn từ 50.000đ).
                </p>
              </div>

              {token ? (
                <button
                  type="button"
                  onClick={handleCreateOrder}
                  disabled={ordering}
                  className="mt-5 w-full rounded-xl bg-amber-800 px-5 py-3 font-bold text-white shadow transition hover:bg-amber-900 disabled:cursor-not-allowed disabled:bg-gray-400"
                >
                  {ordering ? "Đang tạo đơn hàng..." : `Thanh toán (${formatVnd(estimatedDiscount > 0 ? total - estimatedDiscount : total)})`}
                </button>
              ) : (
                <div className="mt-5 space-y-2">
                  <button
                    type="button"
                    onClick={() => router.push("/login?redirect=/cart")}
                    className="w-full rounded-xl bg-amber-800 px-5 py-3 font-bold text-white shadow transition hover:bg-amber-900"
                  >
                    Đăng nhập để thanh toán
                  </button>
                  <p className="text-center text-xs text-amber-800">
                    Chưa đăng nhập? Bạn sẽ được chuyển sang đăng nhập trước khi tạo đơn.
                  </p>
                </div>
              )}

              <p className="mt-3 text-xs text-gray-500">
                Bấm Thanh toán để tạo đơn (PENDING) rồi chọn Ví hoặc Thẻ. Giá, mã voucher và tồn kho được hệ thống kiểm tra lại; giỏ hàng chỉ được xóa khi thanh toán thành công.
              </p>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
