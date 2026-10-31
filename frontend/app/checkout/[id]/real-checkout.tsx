"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "../../../store/auth-store";
import { useCartStore } from "../../../store/cart-store";
import { formatVnd } from "../../../store/cart-view";
import { cartFingerprint, pendingOrderFor, PENDING_CHECKOUT_KEY, readSession, removeSession, statusLabel } from "../../../store/checkout-utils";
import { parsePayosStatus, paymentView, payosUrl, type PayosStatus } from "../../../store/payos-checkout";
const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/+$/, "");
const TEXT = {
  pending: ["Chờ thanh toán", "Mở trang payOS để quét VietQR. Khi thanh toán xong, quay lại đây để xem xác nhận."],
  paid: ["Thanh toán thành công", "Cửa hàng đã nhận xác nhận thanh toán. Theo dõi tiến độ trong lịch sử đơn hàng."],
  failed: ["Thanh toán chưa thành công", "Giỏ hàng vẫn được giữ nguyên. Kiểm tra trạng thái trước khi thử thanh toán lại."],
  expired: ["Liên kết đã hết hạn", "Liên kết này không còn dùng được. Vui lòng liên hệ cửa hàng để được hỗ trợ."],
  cancelled: ["Thanh toán đã hủy", "Đơn hoặc liên kết thanh toán đã được hủy. Không chuyển tiền qua liên kết cũ."],
  closed: ["Chưa thể thanh toán", "Vui lòng kiểm tra trạng thái đơn hoặc liên hệ cửa hàng để được hỗ trợ."],
};
export default function RealCheckoutPage() {
  const { id } = useParams<{ id: string }>();
  const token = useAuthStore(s => s.token);
  const user = useAuthStore(s => s.user);
  const items = useCartStore(s => s.items);
  const clearCart = useCartStore(s => s.clearCart);
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [info, setInfo] = useState<PayosStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [checkedAt, setCheckedAt] = useState("");
  const [reload, setReload] = useState(0);
  const creatingRef = useRef(false);
  const request = useRef<AbortController | null>(null);
  const view = info ? paymentView(info) : null;
  const terminal = view === "paid" || view === "cancelled" || view === "expired" || view === "closed";
  useEffect(() => setMounted(true), []);
  useEffect(() => { setInfo(null); setLoading(true); setError(""); setCheckedAt(""); }, [id, token]);
  useEffect(() => {
    if (!mounted) return;
    if (!token) { router.replace(`/login?redirect=${encodeURIComponent(`/checkout/${id}`)}`); return; }
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) { setError("Mã đơn không hợp lệ."); setLoading(false); return; }
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController;
    async function poll() {
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(`${API}/payments/payos/status/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal });
        if (response.status === 401) { router.replace(`/login?redirect=${encodeURIComponent(`/checkout/${id}`)}`); throw new Error("Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại."); }
        if (response.status === 404) throw new Error("Không tìm thấy đơn hàng thuộc tài khoản của bạn.");
        if (!response.ok) throw new Error("Chưa kiểm tra được thanh toán. Giữ lại mã đơn và kiểm tra lại; không chuyển tiền lần nữa khi chưa rõ kết quả.");
        const latest = parsePayosStatus(await response.json(), Number(id));
        if (active) { setInfo(latest); setError(""); setCheckedAt(new Date().toLocaleTimeString("vi-VN")); }
      } catch (cause) {
        if (active) setError(cause instanceof Error && cause.name !== "AbortError" ? cause.message : "Kết nối bị gián đoạn. Chưa xác định được kết quả thanh toán.");
      } finally {
        clearTimeout(timeout);
        if (active) { setLoading(false); if (!terminal) timer = setTimeout(poll, 5000); }
      }
    }
    void poll();
    return () => { active = false; clearTimeout(timer); controller?.abort(); };
  }, [mounted, token, id, reload, terminal, router]);
  useEffect(() => () => request.current?.abort(), [id, token]);
  useEffect(() => {
    if (view !== "paid" || !info) return;
    if (pendingOrderFor(readSession(PENDING_CHECKOUT_KEY), user?.id, cartFingerprint(items)) === info.orderId) {
      clearCart(); removeSession(PENDING_CHECKOUT_KEY);
    }
  }, [view, info, items, user?.id, clearCart]);
  async function openPayment() {
    if (!token || !info || creatingRef.current || error || !["pending", "failed"].includes(view ?? "")) return;
    creatingRef.current = true; setCreating(true); setError("");
    const controller = new AbortController(); request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${API}/payments/payos/create`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ orderId: info.orderId }), signal: controller.signal });
      const body = await response.json().catch(() => ({}));
      if (controller.signal.aborted) return;
      if (response.status === 401) { router.replace(`/login?redirect=${encodeURIComponent(`/checkout/${id}`)}`); return; }
      if (!response.ok) throw new Error("Chưa mở được thanh toán. Kiểm tra lại trạng thái hoặc liên hệ cửa hàng nếu lỗi tiếp diễn.");
      window.location.assign(payosUrl(body.checkoutUrl));
    } catch (cause) {
      if (request.current === controller) setError(cause instanceof Error && cause.name !== "AbortError" ? cause.message : "Kết nối bị gián đoạn khi tạo thanh toán. Kiểm tra lại trạng thái trước khi thử tiếp.");
    } finally { clearTimeout(timeout); creatingRef.current = false; setCreating(false); }
  }
  const content = view ? TEXT[view] : null;
  return <main className="min-h-screen bg-amber-50 px-4 py-6 sm:py-10">
    <div className="mx-auto max-w-2xl">
      <Link href="/orders" className="text-sm font-semibold text-amber-900 hover:underline">← Lịch sử đơn hàng</Link>
      <section aria-labelledby="checkout-heading" aria-busy={loading} className="mt-5 overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm">
        <div className="border-b border-amber-100 p-5 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-800">BrewLite · VietQR qua payOS</p>
          <h1 id="checkout-heading" className="mt-3 text-2xl font-extrabold text-amber-950 sm:text-3xl">Thanh toán đơn hàng</h1>
          <p className="mt-2 text-sm leading-6 text-gray-600">Kiểm tra số tiền và mã đơn trước khi chuyển sang trang thanh toán.</p>
        </div>
        <div className="space-y-5 p-5 sm:p-8">
          {(!mounted || loading) && <p role="status" className="rounded-xl bg-amber-50 p-4 text-amber-900">Đang kiểm tra đơn hàng…</p>}
          {info && content && <>
            <dl className="grid grid-cols-1 gap-3 rounded-xl bg-amber-50 p-4 sm:grid-cols-2">
              <div><dt className="text-sm text-gray-600">Mã đơn hàng</dt><dd className="mt-1 break-all text-lg font-bold text-amber-950">#{info.orderId}</dd></div>
              <div><dt className="text-sm text-gray-600">Số tiền thanh toán</dt><dd data-testid="checkout-total" className="mt-1 break-words text-2xl font-extrabold text-amber-900">{formatVnd(info.amount)}</dd></div>
            </dl>
            <div role="status" aria-live="polite" className={`rounded-xl border p-4 ${view === "paid" ? "border-green-200 bg-green-50 text-green-900" : view === "pending" ? "border-amber-200 bg-amber-50 text-amber-950" : "border-red-200 bg-red-50 text-red-900"}`}>
              <h2 data-testid="payment-status" className="font-bold">{content[0]}</h2>
              <p className="mt-2 text-sm leading-6">{content[1]}</p>
              {view === "paid" && <p className="mt-2 text-sm font-semibold">Trạng thái đơn: {statusLabel(info.status)}</p>}
            </div>
            {["pending", "failed"].includes(view ?? "") && <>
              <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-gray-700"><li>Mở trang thanh toán payOS bằng nút bên dưới.</li><li>Quét VietQR và kiểm tra thông tin trên ứng dụng ngân hàng.</li><li>Quay lại BrewLite để xem kết quả được xác nhận.</li></ol>
              <button type="button" onClick={() => void openPayment()} disabled={creating || Boolean(error)} className="min-h-12 w-full rounded-xl bg-amber-800 px-4 py-3 font-bold text-white hover:bg-amber-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800 disabled:cursor-not-allowed disabled:bg-gray-400">{creating ? "Đang mở thanh toán…" : info.checkoutUrl ? "Tiếp tục thanh toán trên payOS" : "Thanh toán bằng VietQR"}</button>
              <p className="text-xs leading-5 text-gray-600">payOS sử dụng thanh toán tiền thật. Chỉ tiếp tục khi bạn muốn thanh toán đơn này.</p>
            </>}
          </>}
          {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-900">{error}</div>}
          {mounted && token && <button type="button" disabled={loading || creating} onClick={() => { setLoading(true); setReload(n => n + 1); }} className="min-h-12 w-full rounded-xl border border-amber-300 px-4 py-3 font-semibold text-amber-900 hover:bg-amber-50 disabled:opacity-50">{loading ? "Đang kiểm tra…" : "Kiểm tra lại trạng thái"}</button>}
          {checkedAt && <p className="text-center text-xs text-gray-500">Kiểm tra gần nhất: {checkedAt}{!terminal && " · Tự cập nhật mỗi 5 giây"}</p>}
          <p className="text-xs leading-5 text-gray-600">Nếu đã chuyển tiền nhưng chưa thấy xác nhận, giữ lại mã đơn và kiểm tra lại. Không chuyển thêm lần nữa.</p>
          <Link href={view === "paid" ? "/menu" : "/cart"} className="block text-center text-sm font-semibold text-amber-900 underline underline-offset-4">{view === "paid" ? "Chọn thêm đồ uống" : "Xem lại giỏ hàng"}</Link>
        </div>
      </section>
    </div>
  </main>;
}
