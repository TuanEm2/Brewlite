"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuthStore } from "../../../store/auth-store";
import { useCartStore } from "../../../store/cart-store";
import { formatVnd } from "../../../store/cart-view";
import {
  PAYMENT_METHODS,
  PENDING_CHECKOUT_KEY,
  cartFingerprint,
  isPayable,
  methodLabel,
  paymentAttemptStorageKey,
  readSession,
  removeSession,
  reusableAttempt,
  statusLabel,
  writeSession,
  type PendingCheckout,
  type PaymentAttempt,
  type PaymentMethod,
  type PaymentOutcome,
} from "../../../store/checkout-utils";

type OrderItem = {
  id: number;
  productId: number;
  size: string;
  toppings: Array<{ name: string; price: number }>;
  quantity: number;
  lineTotal: number;
};

type Order = {
  id: number;
  status: string;
  total: number;
  discount?: number;
  voucherCode?: string | null;
  createdAt: string;
  items?: OrderItem[];
};

type PaymentResult = {
  orderId: number;
  status: string;
  outcome: PaymentOutcome;
  amount: number;
  method: PaymentMethod;
  idempotencyKey: string;
  replayed: boolean;
  message: string;
};

/** unknown = mất kết nối/timeout: chưa biết server đã xử lý hay chưa. */
type Notice = { kind: "failed" | "unknown" | "error"; text: string } | null;

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/+$/, "");

export default function CheckoutPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const token = useAuthStore((state) => state.token);
  const userId = useAuthStore((state) => state.user?.id);
  const cartItems = useCartStore((state) => state.items);
  const clearCart = useCartStore((state) => state.clearCart);

  const [mounted, setMounted] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [working, setWorking] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("MOCK_QR");
  const [outcome, setOutcome] = useState<PaymentOutcome>("SUCCESS");
  const [notice, setNotice] = useState<Notice>(null);
  const [paidMethod, setPaidMethod] = useState<PaymentMethod | null>(null);

  useEffect(() => setMounted(true), []);

  const loadOrder = useCallback(
    async (jwt: string, signal?: AbortSignal) => {
      const response = await fetch(`${API_URL}/orders/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${jwt}` },
        cache: "no-store",
        signal,
      });
      if (response.status === 401) throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
      if (response.status === 404) throw new Error("Không tìm thấy đơn hàng hoặc đơn không thuộc tài khoản của bạn.");
      if (!response.ok) throw new Error("Không tải được thông tin đơn hàng.");
      const data = (await response.json()) as Order;
      if (!signal?.aborted) setOrder(data);
      return data;
    },
    [id],
  );

  useEffect(() => {
    if (!mounted) return;
    if (!token) {
      router.replace(`/login?redirect=${encodeURIComponent(`/checkout/${id}`)}`);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    loadOrder(token, controller.signal)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : "Đã xảy ra lỗi.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [mounted, token, id, loadOrder, router]);

  // Khi đơn đã PAID: giỏ hàng của đơn này hoàn tất → xóa giỏ và liên kết đơn chờ.
    // Chỉ xóa giỏ nếu vẫn đúng nội dung đã dùng để tạo đơn.
  useEffect(() => {
    if (order?.status !== "PAID" || userId === undefined) return;

    const saved = readSession(PENDING_CHECKOUT_KEY);
    const pending =
      saved !== null && typeof saved === "object"
        ? (saved as Partial<PendingCheckout>)
        : null;

    if (
      pending?.orderId === order.id &&
      pending.userId === userId
    ) {
      // Đọc giỏ mới nhất ngay lúc xử lý kết quả thanh toán.
      const currentItems = useCartStore.getState().items;
      const voucher = order.voucherCode?.trim().toUpperCase() ?? "";
      const currentFingerprint =
        cartFingerprint(currentItems) +
        (voucher ? `|v:${voucher}` : "");

      if (pending.fingerprint === currentFingerprint) {
        clearCart();
      }

      // Đơn đã thanh toán nên không còn là đơn chờ,
      // kể cả khi giỏ đã thay đổi và cần được giữ lại.
      removeSession(PENDING_CHECKOUT_KEY);
    }

    removeSession(paymentAttemptStorageKey(order.id));
  }, [order, userId, clearCart]);
  async function pay() {
    if (!token || !order || working || !isPayable(order.status)) return;
    setNotice(null);
    setWorking(true);

    const storageKey = paymentAttemptStorageKey(order.id);
    const attempt: PaymentAttempt =
      reusableAttempt(readSession(storageKey), order.id, method, outcome) ?? {
        orderId: order.id,
        idempotencyKey: crypto.randomUUID(),
        method,
        outcome,
      };
    writeSession(storageKey, attempt);

    let response: Response;
    try {
      response = await fetch(`${API_URL}/payments/mock`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(attempt),
      });
    } catch {
      // Giữ khóa để gửi lại cùng yêu cầu khi chưa biết kết quả.
      setNotice({
        kind: "unknown",
        text: 'Mất kết nối khi đang thanh toán. Bấm "Thử lại": hệ thống dùng lại cùng mã giao dịch nên không bị trừ tiền hai lần.',
      });
      setWorking(false);
      return;
    }

    try {
      const data = (await response.json().catch(() => ({}))) as
        Partial<PaymentResult> & { message?: unknown };

      removeSession(storageKey);

      if (response.status === 401) {
        router.replace(
          `/login?redirect=${encodeURIComponent(`/checkout/${order.id}`)}`,
        );
        return;
      }

      if (!response.ok) {
        const message = Array.isArray(data.message)
          ? data.message.join("; ")
          : String(data.message ?? "");

        const latest = await loadOrder(token).catch(() => null);
        if (latest?.status !== "PAID") {
          setNotice({
            kind: "error",
            text: message || "Không thể xử lý thanh toán. Vui lòng thử lại.",
          });
        }
        return;
      }

      const result = data as PaymentResult;
      if (result.outcome === "SUCCESS") {
        setPaidMethod(result.method);
      } else {
        setNotice({
          kind: "failed",
          text: "Thanh toán không thành công. Giỏ hàng của bạn vẫn được giữ nguyên, bạn có thể thử lại hoặc đổi phương thức.",
        });
      }

      await loadOrder(token).catch(() => undefined);
    } finally {
      setWorking(false);
    }
  }

  const productName = (productId: number) =>
    cartItems.find((item) => item.productId === productId)?.name ??
    `Đồ uống #${productId}`;

  // ---------- Màn hình xác nhận (wireframe 5) ----------
  if (order?.status === "PAID") {
    return (
      <main className="min-h-screen bg-amber-50 px-4 py-10">
        <section
          data-testid="order-confirmation"
          className="mx-auto max-w-md rounded-2xl border border-green-200 bg-white p-8 text-center shadow-sm"
        >
          <p className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl text-green-700" aria-hidden="true">
            ✓
          </p>
          <h1 className="mt-4 text-2xl font-extrabold text-gray-900">Đặt hàng thành công</h1>
          <dl className="mt-5 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-600">Mã đơn</dt>
              <dd className="font-bold">#{order.id}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-600">Trạng thái</dt>
              <dd className="font-bold text-green-700">PAID · {statusLabel("PAID")}</dd>
            </div>
            {paidMethod && (
              <div className="flex justify-between">
                <dt className="text-gray-600">Phương thức</dt>
                <dd className="font-semibold">{methodLabel(paidMethod)}</dd>
              </div>
            )}
            {order.discount !== undefined && order.discount > 0 && (
              <div className="flex justify-between text-green-700">
                <dt className="text-gray-600">Giảm giá ({order.voucherCode || "Voucher"})</dt>
                <dd className="font-semibold">-{formatVnd(order.discount)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-amber-100 pt-2 text-base">
              <dt className="font-bold">Đã thanh toán</dt>
              <dd className="font-extrabold text-amber-700">{formatVnd(order.total)}</dd>
            </div>
          </dl>
          <p className="mt-6 rounded-xl bg-amber-50 p-3 font-semibold text-amber-900">Mời bạn tới quầy lấy nước ☕</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link href="/" className="rounded-xl bg-amber-800 px-5 py-3 font-bold text-white hover:bg-amber-900">
              Về trang chủ
            </Link>
            <Link href="/orders" className="rounded-xl border border-amber-300 px-5 py-3 font-semibold text-amber-900 hover:bg-amber-50">
              Lịch sử đơn
            </Link>
            <Link href="/menu" className="rounded-xl border border-amber-300 px-5 py-3 font-semibold text-amber-900 hover:bg-amber-50">
              Đặt thêm đồ uống
            </Link>
          </div>
        </section>
      </main>
    );
  }

  // ---------- Màn hình thanh toán (wireframe 4) ----------
  return (
    <main className="min-h-screen bg-amber-50 px-4 py-8">
      <div className="mx-auto max-w-xl">
        <Link href="/cart" className="font-semibold text-amber-900 hover:underline">
          ← Quay lại giỏ hàng
        </Link>
        <h1 className="mt-6 text-3xl font-extrabold text-amber-950">Thanh toán</h1>

        {(!mounted || loading) && !loadError && (
          <p role="status" className="mt-6 text-amber-900">
            Đang tải đơn hàng...
          </p>
        )}

        {loadError && (
          <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p>{loadError}</p>
            <Link href="/cart" className="mt-2 inline-block font-semibold underline">
              Quay lại giỏ hàng
            </Link>
          </div>
        )}

        {order && !loading && (
          <section className="mt-6 rounded-2xl border border-amber-100 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">
                Mã đơn <strong className="text-gray-900">#{order.id}</strong>
              </span>
              <span
                data-testid="order-status"
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  order.status === "PAYMENT_FAILED" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"
                }`}
              >
                {order.status} · {statusLabel(order.status)}
              </span>
            </div>

            {order.items && order.items.length > 0 && (
              <ul className="mt-4 divide-y divide-amber-100 text-sm">
                {order.items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-3 py-2">
                    <span>
                      {productName(item.productId)} {item.size} ×{item.quantity}
                      {item.toppings.length > 0 && (
                        <span className="block text-xs text-gray-500">{item.toppings.map((t) => t.name).join(", ")}</span>
                      )}
                    </span>
                    <span className="font-semibold">{formatVnd(item.lineTotal)}</span>
                  </li>
                ))}
              </ul>
            )}

            {order.discount !== undefined && order.discount > 0 && (
              <div className="mt-3 flex justify-between text-sm text-green-700">
                <span>Voucher ({order.voucherCode || "Giảm giá"}):</span>
                <span className="font-semibold">-{formatVnd(order.discount)}</span>
              </div>
            )}

            <div className="mt-3 flex justify-between border-t border-amber-100 pt-3 text-lg">
              <span className="font-bold">Tổng</span>
              <span data-testid="checkout-total" className="font-extrabold text-amber-700">
                {formatVnd(order.total)}
              </span>
            </div>

            {isPayable(order.status) ? (
              <>
                <fieldset className="mt-6" disabled={working}>
                  <legend className="text-sm font-bold text-gray-900">Phương thức thanh toán</legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {PAYMENT_METHODS.map((option) => (
                      <label
                        key={option.value}
                        className={`cursor-pointer rounded-xl border p-3 transition ${
                          method === option.value ? "border-amber-700 bg-amber-50 ring-1 ring-amber-700" : "border-gray-200 hover:border-amber-300"
                        }`}
                      >
                        <input
                          type="radio"
                          name="method"
                          value={option.value}
                          checked={method === option.value}
                          onChange={() => setMethod(option.value)}
                          className="mr-2 accent-amber-800"
                        />
                        <span className="font-semibold">{option.label}</span>
                        <span className="mt-1 block text-xs text-gray-500">{option.hint}</span>
                      </label>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-gray-500">Không dùng tiền mặt. Đây là cổng thanh toán mô phỏng, không trừ tiền thật.</p>
                </fieldset>

                <fieldset className="mt-5 rounded-xl border border-dashed border-gray-300 p-3" disabled={working}>
                  <legend className="px-1 text-xs font-semibold text-gray-600">Kết quả mô phỏng (dùng khi demo)</legend>
                  <div className="flex gap-4 text-sm">
                    <label className="cursor-pointer">
                      <input
                        type="radio"
                        name="outcome"
                        checked={outcome === "SUCCESS"}
                        onChange={() => setOutcome("SUCCESS")}
                        className="mr-1 accent-green-700"
                      />
                      Thành công
                    </label>
                    <label className="cursor-pointer">
                      <input
                        type="radio"
                        name="outcome"
                        checked={outcome === "FAILURE"}
                        onChange={() => setOutcome("FAILURE")}
                        className="mr-1 accent-red-700"
                      />
                      Thất bại
                    </label>
                  </div>
                </fieldset>

                {notice && (
                  <div
                    role="alert"
                    data-testid="payment-notice"
                    className={`mt-5 rounded-xl border p-4 text-sm ${
                      notice.kind === "unknown" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-red-200 bg-red-50 text-red-800"
                    }`}
                  >
                    {notice.text}
                    {notice.kind === "failed" && (
                      <Link href="/cart" className="mt-2 block font-semibold underline">
                        Xem lại giỏ hàng
                      </Link>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => void pay()}
                  disabled={working}
                  className="mt-5 w-full rounded-xl bg-amber-800 px-5 py-3 font-bold text-white shadow transition hover:bg-amber-900 disabled:cursor-not-allowed disabled:bg-gray-400"
                >
                  {working
                    ? "Đang xử lý thanh toán..."
                    : notice
                      ? `Thử lại · Xác nhận trả ${formatVnd(order.total)}`
                      : `Xác nhận trả ${formatVnd(order.total)}`}
                </button>
              </>
            ) : (
              <p className="mt-6 rounded-xl bg-gray-100 p-3 text-sm text-gray-700">
                Đơn ở trạng thái {statusLabel(order.status)}, không thể thanh toán.
              </p>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
