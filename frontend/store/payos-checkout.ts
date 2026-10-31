export type PayosStatus = { orderId: number; status: string; amount: number; checkoutUrl: string | null; providerStatus: string | null };
export function paymentView(info: PayosStatus) {
  if (["PAID", "PREPARING", "READY", "COMPLETED"].includes(info.status)) return "paid";
  if (info.status === "CANCELLED" || info.providerStatus === "CANCELLED") return "cancelled";
  if (info.providerStatus === "EXPIRED") return "expired";
  if (info.status === "PAYMENT_FAILED") return "failed";
  return info.status === "PENDING" ? "pending" : "closed";
}
export function payosUrl(value: unknown): string {
  if (typeof value !== "string") throw new Error("Chưa nhận được đường dẫn thanh toán.");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "pay.payos.vn" || url.username || url.password || url.port) throw new Error("Địa chỉ thanh toán không hợp lệ. Vui lòng liên hệ cửa hàng.");
  return url.href;
}
export function parsePayosStatus(value: unknown, orderId: number): PayosStatus {
  const data = value as Partial<PayosStatus> | null;
  if (!data || data.orderId !== orderId || typeof data.status !== "string" || !Number.isSafeInteger(data.amount) || Number(data.amount) < 0 || (data.checkoutUrl !== null && typeof data.checkoutUrl !== "string") || (data.providerStatus !== null && typeof data.providerStatus !== "string")) throw new Error("Thông tin thanh toán chưa hợp lệ. Vui lòng kiểm tra lại.");
  return data as PayosStatus;
}
