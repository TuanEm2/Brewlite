"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuthStore } from "../../../store/auth-store";
import { useCartStore } from "../../../store/cart-store";
import { formatVnd } from "../../../store/cart-view";
import { PENDING_CHECKOUT_KEY, readSession, removeSession } from "../../../store/checkout-utils";

type Status = {
  orderId: number;
  status: string;
  amount: number;
  checkoutUrl: string | null;
  providerStatus: string | null;
  expiresAt: string;
  expired: boolean;
  items: Array<{ productName: string; size: string; quantity: number; lineTotal: number }>;
};
const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/+$/, "");

export default function RealCheckoutPage() {
  const { id } = useParams<{ id: string }>();
  const token = useAuthStore((s) => s.token);
  const clearCart = useCartStore((s) => s.clearCart);
  const router = useRouter();
  const [info, setInfo] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const remaining = info ? Math.max(0, Math.ceil((Date.parse(info.expiresAt) - now) / 1000)) : 0;

  const refresh = useCallback(async () => {
    if (!token) return;
    const response = await fetch(API + "/payments/payos/status/" + encodeURIComponent(id), {
      headers: { Authorization: "Bearer " + token }, cache: "no-store",
    });
    if (response.status === 401) {
      router.replace("/login?redirect=" + encodeURIComponent("/checkout/" + id));
      return;
    }
    if (!response.ok) throw new Error("Không đọc được trạng thái thanh toán.");
    setInfo((await response.json()) as Status);
    setError("");
  }, [token, id, router]);

  useEffect(() => {
    if (!token) {
      router.replace("/login?redirect=" + encodeURIComponent("/checkout/" + id));
      return;
    }
    let cancelled = false;
    void refresh().catch((e: unknown) => {
      if (!cancelled) setError(e instanceof Error ? e.message : "Lỗi kết nối.");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    const interval = window.setInterval(() => {
      void refresh().catch(() => setError("Chưa đồng bộ được với cổng thanh toán. Hệ thống sẽ thử lại; chưa thể kết luận giao dịch thất bại."));
    }, 5000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [token, id, refresh, router]);

  useEffect(() => {
    if (info?.status !== "PAID") return;
    const pending = readSession(PENDING_CHECKOUT_KEY) as { orderId?: number } | null;
    if (pending?.orderId === info.orderId) {
      clearCart();
      removeSession(PENDING_CHECKOUT_KEY);
    }
  }, [info?.status, info?.orderId, clearCart]);

  async function openPayment() {
    if (!token || !info || creating || !["PENDING", "PAYMENT_FAILED"].includes(info.status)) return;
    setError("");
    setCreating(true);
    try {
      const res = await fetch(API + "/payments/payos/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ orderId: info.orderId }),
      });
      const body = (await res.json().catch(() => ({}))) as { checkoutUrl?: string; message?: string };
      if (!res.ok || !body.checkoutUrl) {
        throw new Error(body.message || "Không tạo được link thanh toán.");
      }
      const url = new URL(body.checkoutUrl);
      if (url.protocol !== "https:" || url.hostname !== "pay.payos.vn") {
        throw new Error("Địa chỉ cổng thanh toán không hợp lệ.");
      }
      window.location.assign(url.href);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Thanh toán không khả dụng.");
      setCreating(false);
      void refresh().catch(() => {});
    }
  }

  return (
    <main className="min-h-screen bg-amber-50 px-4 py-10">
      <section className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-white p-7 shadow-sm">
        <Link href="/orders" className="text-sm font-semibold text-amber-800">← Lịch sử đơn hàng</Link>
        <h1 className="mt-4 text-3xl font-extrabold text-amber-950">Thanh toán VietQR thật</h1>
        {loading && <p className="mt-5">Đang kiểm tra đơn hàng...</p>}
        {info && (
          <div className="mt-5 space-y-3">
            <p>Đơn hàng: <strong>#{info.orderId}</strong></p>
            <ul className="divide-y divide-amber-100 text-sm">
              {info.items.map((item, index) => <li key={index} className="flex justify-between gap-3 py-2">
                <span>{item.productName} {item.size} ×{item.quantity}</span><strong>{formatVnd(item.lineTotal)}</strong>
              </li>)}
            </ul>
            <p>Số tiền: <strong>{formatVnd(info.amount)}</strong></p>
            <p>Trạng thái: <strong>{info.status === "PAID" ? "Đã nhận xác nhận thanh toán" : info.status}</strong></p>
            {info.status === "PAID" ? (
              <p className="rounded-xl bg-green-50 p-4 text-green-800">✓ Thanh toán đã được xác nhận với payOS.</p>
            ) : ["PENDING", "PAYMENT_FAILED"].includes(info.status) ? (
              <>
                <p className="text-sm text-gray-600">Chọn thanh toán để tới trang VietQR do payOS cung cấp. BrewLite chỉ xác nhận sau khi nhận thông báo giao dịch thực tế.</p>
                <p className="text-sm font-semibold text-amber-900">{remaining > 0
                  ? 'Thời gian thanh toán còn lại: ' + Math.floor(remaining / 60) + ':' + String(remaining % 60).padStart(2, '0')
                  : 'Đã hết thời gian thanh toán. Đang đối soát với payOS, vui lòng chờ xác nhận.'}</p>
                <button type="button" disabled={creating || remaining === 0} onClick={() => void openPayment()}
                  className="w-full rounded-xl bg-amber-800 px-5 py-3 font-semibold text-white disabled:opacity-50">
                  {creating ? "Đang tạo yêu cầu..." : "Thanh toán bằng VietQR"}
                </button>
              </>
            ) : (
              <p className="rounded-xl bg-gray-100 p-4">{info.expired ? "Đơn đã hết hạn hoặc link thanh toán đã bị hủy. Bạn có thể đặt đơn mới." : "Đơn hàng không thể thanh toán ở trạng thái này."}</p>
            )}
          </div>
        )}
        {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
        <p className="mt-6 text-xs text-gray-500">Khi quay lại trang này, trạng thái được tải từ Backend 5 giây/lần. Trang chuyển hướng không được dùng làm bằng chứng đã nhận tiền.</p>
      </section>
    </main>
  );
}
