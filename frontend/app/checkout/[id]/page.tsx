"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuthStore } from "../../../store/auth-store";

type PaymentOutcome = "SUCCESS" | "FAILURE";
type PaymentMethod = "MOCK_QR" | "MOCK_CARD";
type Order = { id: number; status: string; total: number; createdAt: string };
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

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/+$/, "");
const formatVnd = (amount: number) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(amount);

export default function MockCheckoutPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const token = useAuthStore((state) => state.token);
  const [mounted, setMounted] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("MOCK_QR");
  const [error, setError] = useState("");
  const [result, setResult] = useState<PaymentResult | null>(null);

  useEffect(() => setMounted(true), []);

  const loadOrder = useCallback(async (jwt: string, signal?: AbortSignal) => {
    const response = await fetch(`${API_URL}/orders/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${jwt}` },
      cache: "no-store",
      signal,
    });
    if (response.status === 401) throw new Error("Phiên đăng nhập đã hết hạn.");
    if (response.status === 404) throw new Error("Không tìm thấy đơn hàng hoặc bạn không sở hữu đơn này.");
    if (!response.ok) throw new Error("Không tải được thông tin đơn hàng.");
    const data = await response.json() as Order;
    if (!signal?.aborted) setOrder(data);
    return data;
  }, [id]);

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
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Đã xảy ra lỗi.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [mounted, token, id, loadOrder, router]);

  async function pay(outcome: PaymentOutcome) {
    if (!token || !order || working || order.status === "PAID") return;
    setError("");
    setResult(null);
    setWorking(true);
    // Giữ lại cùng khóa cho lần retry do mạng bị ngắt; khi thay đổi payload, tạo khóa mới.
    const storageKey = `brewlite-mock-payment-${order.id}`;
    let attempt: { idempotencyKey: string; outcome: PaymentOutcome; method: PaymentMethod } | null = null;
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as typeof attempt;
        const savedAttempt = parsed as {
  outcome: string;
  method: string;
} | null;

if (
  savedAttempt?.outcome === outcome &&
  savedAttempt?.method === method
) {
  attempt = parsed;
}
      }
    } catch { /* sessionStorage can be blocked */ }
    const payload = attempt ?? { idempotencyKey: crypto.randomUUID(), outcome, method };
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(payload));
    } catch { /* continue with key in memory for this attempt */ }

    try {
      const response = await fetch(`${API_URL}/payments/mock`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId: order.id, ...payload }),
      });
      const data = await response.json();
      if (!response.ok) {
        const message = Array.isArray(data.message) ? data.message.join("; ") : data.message;
        throw new Error(message || "Không thể xử lý thanh toán.");
      }
      setResult(data as PaymentResult);
      try { sessionStorage.removeItem(storageKey); } catch { /* no storage */ }
      await loadOrder(token);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Không kết nối được máy chủ. Hãy thử lại.");
      // Chưa biết server đã nhận request chưa: giữ key để retry không ghi trùng.
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="min-h-screen bg-amber-50 px-4 py-10 text-gray-900">
      <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-white p-6 shadow-sm sm:p-9">
        <Link href="/menu" className="font-semibold text-amber-900 hover:underline">← Về Menu</Link>
        <h1 className="mt-5 text-3xl font-extrabold text-amber-950">Thanh toán mô phỏng</h1>
        <p className="mt-3 rounded-lg bg-amber-100 p-3 text-sm text-amber-900">
          Chỉ dùng để kiểm thử BrewLite: <strong>không xử lý thẻ hoặc chuyển khoản thật.</strong>
        </p>
        {(!mounted || loading) && <p className="mt-5" role="status">Đang tải đơn hàng...</p>}
        {error && <p className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
        {order && !loading && (
          <section className="mt-6">
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-3"><dt>Mã đơn</dt><dd className="font-bold">#{order.id}</dd></div>
              <div className="flex justify-between gap-3"><dt>Trạng thái</dt><dd className="font-bold">{order.status}</dd></div>
              <div className="flex justify-between gap-3 border-t pt-3 text-lg"><dt>Phải trả</dt><dd className="font-extrabold text-amber-800">{formatVnd(order.total)}</dd></div>
            </dl>
            {order.status === "PAID" ? (
              <p className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4 font-semibold text-green-800" role="status">
                Đơn này đã thanh toán thành công (mô phỏng). Không thể thanh toán lần thứ hai.
              </p>
            ) : (order.status === "PENDING" || order.status === "PAYMENT_FAILED") ? (
              <div className="mt-6 space-y-4">
                <label className="block text-sm font-semibold text-gray-800" htmlFor="paymentMethod">Phương thức thử nghiệm</label>
                <select id="paymentMethod" value={method} disabled={working} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className="w-full rounded-xl border border-amber-300 bg-white p-3">
                  <option value="MOCK_QR">QR giả lập</option>
                  <option value="MOCK_CARD">Thẻ giả lập (không nhập thông tin thẻ)</option>
                </select>
                <button type="button" disabled={working} onClick={() => void pay("SUCCESS")} className="w-full rounded-xl bg-green-700 px-5 py-3 font-bold text-white hover:bg-green-800 disabled:opacity-50">
                  {working ? "Đang xử lý..." : "Giả lập thanh toán thành công"}
                </button>
                <button type="button" disabled={working} onClick={() => void pay("FAILURE")} className="w-full rounded-xl border border-red-300 px-5 py-3 font-semibold text-red-800 hover:bg-red-50 disabled:opacity-50">
                  Giả lập thanh toán thất bại
                </button>
                {order.status === "PAYMENT_FAILED" && <p className="text-sm text-amber-800">Lần thử trước thất bại. Có thể thử lại bằng một lần thanh toán mới.</p>}
              </div>
            ) : <p className="mt-6 text-sm text-red-700">Trạng thái đơn không cho phép thanh toán.</p>}
          </section>
        )}
        {result && (
          <p role="status" className={`mt-5 rounded-lg p-4 text-sm ${result.outcome === "SUCCESS" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
            {result.message} {result.replayed ? "(Yêu cầu đã được xử lý trước đó.)" : ""}
          </p>
        )}
      </div>
    </main>
  );
}
