"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuthStore } from "../../store/auth-store";
import { formatVnd } from "../../store/cart-view";
import { PENDING_CHECKOUT_KEY, isPayable, readSession, removeSession, statusLabel } from "../../store/checkout-utils";

interface OrderItem {
  id: number;
  productId: number;
  productName: string;
  size: string;
  toppings: Array<{ name: string; price: number }>;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface Order {
  id: number;
  status: string;
  total: number;
  discount: number;
  voucherCode: string | null;
  createdAt: string;
  items: OrderItem[];
}

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/+$/, "");

function statusBadgeClass(status: string): string {
  switch (status) {
    case "PAID":
      return "bg-green-100 text-green-800 border-green-200";
    case "PENDING":
      return "bg-amber-100 text-amber-900 border-amber-200";
    case "PREPARING":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "READY":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "COMPLETED":
      return "bg-gray-100 text-gray-800 border-gray-200";
    case "PAYMENT_FAILED":
    case "CANCELLED":
      return "bg-red-100 text-red-800 border-red-200";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

export default function OrderHistoryPage() {
  const router = useRouter();
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);

  const [mounted, setMounted] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  useEffect(() => setMounted(true), []);

  const loadOrders = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/orders/me`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.status === 401) {
        throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
      }
      if (!res.ok) {
        throw new Error("Không thể tải danh sách đơn hàng.");
      }
      const data = (await res.json()) as Order[];
      setOrders(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Đã có lỗi xảy ra.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  async function cancelOrder(orderId: number) {
    if (!token || cancellingId !== null) return;
    if (!window.confirm(`Bạn muốn hủy đơn #${orderId}? Tồn kho sẽ được hoàn lại.`)) return;
    setCancellingId(orderId);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/orders/${orderId}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message || "Không thể hủy đơn hàng.");
      }
      const pending = readSession(PENDING_CHECKOUT_KEY) as { orderId?: number } | null;
      if (pending?.orderId === orderId) removeSession(PENDING_CHECKOUT_KEY);
      await loadOrders();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Không thể hủy đơn.");
    } finally {
      setCancellingId(null);
    }
  }

  useEffect(() => {
    if (!mounted) return;
    if (!token) {
      router.replace("/login?redirect=/orders");
      return;
    }
    void loadOrders();
  }, [mounted, token, router, loadOrders]);

  return (
    <main className="min-h-screen bg-amber-50 px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <Link href="/menu" className="font-semibold text-amber-900 hover:underline">
              ← Tiếp tục chọn món
            </Link>
            <h1 className="mt-3 text-3xl font-extrabold text-amber-950 sm:text-4xl">
              📜 Lịch sử đơn hàng
            </h1>
            {user && (
              <p className="mt-1 text-sm text-gray-600">
                Tài khoản: <strong>{user.email}</strong>
              </p>
            )}
          </div>
          <Link
            href="/menu"
            className="inline-flex items-center justify-center rounded-xl bg-amber-800 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-amber-900"
          >
            + Đặt đồ uống mới
          </Link>
        </div>

        {(!mounted || loading) && (
          <div className="mt-12 text-center text-amber-900">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-amber-800 border-t-transparent" />
            <p className="mt-3 font-semibold">Đang tải lịch sử đơn hàng...</p>
          </div>
        )}

        {error && !loading && (
          <div
            role="alert"
            className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-red-800 shadow-sm"
          >
            <p className="font-bold">⚠️ Có lỗi xảy ra</p>
            <p className="mt-1 text-sm">{error}</p>
            <button
              type="button"
              onClick={() => void loadOrders()}
              className="mt-4 rounded-xl bg-red-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-red-800"
            >
              Thử lại
            </button>
          </div>
        )}

        {mounted && !loading && !error && orders.length === 0 && (
          <section className="mt-8 rounded-2xl border border-amber-100 bg-white p-12 text-center shadow-sm">
            <p className="text-5xl" aria-hidden="true">☕</p>
            <h2 className="mt-4 text-xl font-bold text-gray-900">Bạn chưa có đơn hàng nào</h2>
            <p className="mt-2 text-sm text-gray-500">
              Hãy chọn những ly cà phê hoặc trà thơm ngon từ Menu của chúng tôi.
            </p>
            <Link
              href="/menu"
              className="mt-6 inline-flex rounded-xl bg-amber-800 px-6 py-3 font-bold text-white transition hover:bg-amber-900"
            >
              Xem menu ngay
            </Link>
          </section>
        )}

        {mounted && !loading && !error && orders.length > 0 && (
          <div className="mt-8 space-y-6">
            {orders.map((order) => {
              const dateStr = new Date(order.createdAt).toLocaleString("vi-VN", {
                dateStyle: "medium",
                timeStyle: "short",
              });
              const payable = isPayable(order.status);

              return (
                <article
                  key={order.id}
                  className="rounded-2xl border border-amber-100 bg-white p-6 shadow-sm transition hover:shadow-md"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-100 pb-4">
                    <div>
                      <span className="text-xs font-semibold text-gray-500">Mã đơn hàng</span>
                      <h2 className="text-lg font-extrabold text-amber-950">#{order.id}</h2>
                      <time className="text-xs text-gray-500">{dateStr}</time>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-bold ${statusBadgeClass(
                          order.status,
                        )}`}
                      >
                        {statusLabel(order.status)} ({order.status})
                      </span>
                    </div>
                  </div>

                  {/* Danh sách món */}
                  <ul className="mt-4 divide-y divide-gray-100 text-sm">
                    {order.items.map((item) => (
                      <li key={item.id} className="flex justify-between py-2.5">
                        <div>
                          <p className="font-semibold text-gray-900">
                            {item.productName} · Size {item.size} ×{item.quantity}
                          </p>
                          {item.toppings && item.toppings.length > 0 && (
                            <p className="text-xs text-gray-500">
                              Topping: {item.toppings.map((t) => t.name).join(", ")}
                            </p>
                          )}
                        </div>
                        <span className="font-medium text-gray-700">
                          {formatVnd(item.lineTotal)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {/* Tổng kết và nút hành động */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-amber-100 pt-4">
                    <div>
                      {order.discount > 0 && (
                        <p className="text-xs font-semibold text-green-700">
                          Voucher {order.voucherCode ? `(${order.voucherCode})` : ""}: -{formatVnd(order.discount)}
                        </p>
                      )}
                      <p className="text-base font-extrabold text-amber-900">
                        Tổng thanh toán: {formatVnd(order.total)}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {["PENDING", "PAYMENT_FAILED", "PAID"].includes(order.status) && (
                        <button
                          type="button"
                          onClick={() => void cancelOrder(order.id)}
                          disabled={cancellingId !== null}
                          className="rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-xs font-bold text-red-800 transition hover:bg-red-100 disabled:opacity-50"
                        >
                          {cancellingId === order.id ? "Đang hủy..." : "Hủy đơn"}
                        </button>
                      )}
                      {payable ? (
                        <Link
                          href={`/checkout/${order.id}`}
                          className="rounded-xl bg-amber-800 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-amber-900"
                        >
                          Thanh toán ngay →
                        </Link>
                      ) : (
                        <Link
                          href={`/checkout/${order.id}`}
                          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
                        >
                          Xem hóa đơn / chi tiết
                        </Link>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
