export type PayosItem = { productName: string; size: string; quantity: number; lineTotal: number };
export type PayosStatus = {
  orderId: number; status: string; amount: number; checkoutUrl: string | null; providerStatus: string | null;
  /** TV3: hạn thanh toán (ISO), danh sách món kèm tên đồ uống và cờ đơn đã hết hạn/hủy link. */
  expiresAt?: string; expired?: boolean; items?: PayosItem[];
};
export function paymentView(info: PayosStatus) {
  if (["PAID", "PREPARING", "READY", "COMPLETED"].includes(info.status)) return "paid";
  if (info.expired) return "expired";
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
function isItem(value: unknown): value is PayosItem {
  const item = value as Partial<PayosItem> | null;
  return !!item && typeof item.productName === "string" && typeof item.size === "string" &&
    Number.isSafeInteger(item.quantity) && Number.isSafeInteger(item.lineTotal);
}
export function parsePayosStatus(value: unknown, orderId: number): PayosStatus {
  const data = value as Partial<PayosStatus> | null;
  if (!data || data.orderId !== orderId || typeof data.status !== "string" || !Number.isSafeInteger(data.amount) || Number(data.amount) < 0 || (data.checkoutUrl !== null && typeof data.checkoutUrl !== "string") || (data.providerStatus !== null && typeof data.providerStatus !== "string")) throw new Error("Thông tin thanh toán chưa hợp lệ. Vui lòng kiểm tra lại.");
  if ((data.expiresAt !== undefined && (typeof data.expiresAt !== "string" || Number.isNaN(Date.parse(data.expiresAt)))) ||
      (data.expired !== undefined && typeof data.expired !== "boolean") ||
      (data.items !== undefined && (!Array.isArray(data.items) || !data.items.every(isItem)))) throw new Error("Thông tin thanh toán chưa hợp lệ. Vui lòng kiểm tra lại.");
  return data as PayosStatus;
}
