/** Pure helpers for the checkout flow (Sprint 3, Task 8 UI – TV2). */
import type { CartItem } from "./cart-utils";

export type PaymentMethod = "MOCK_QR" | "MOCK_CARD";
export type PaymentOutcome = "SUCCESS" | "FAILURE";

/** Ví / Thẻ theo đề bài; giá trị gửi API là mã mô phỏng của backend (TV1). */
export const PAYMENT_METHODS: ReadonlyArray<{ value: PaymentMethod; label: string; hint: string }> = [
  { value: "MOCK_QR", label: "Ví điện tử", hint: "Quét mã QR ví (mô phỏng)" },
  { value: "MOCK_CARD", label: "Thẻ ngân hàng", hint: "Không cần nhập số thẻ (mô phỏng)" },
];

export function methodLabel(method: string): string {
  return PAYMENT_METHODS.find((option) => option.value === method)?.label ?? method;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Chờ thanh toán",
  PAID: "Đã thanh toán",
  PAYMENT_FAILED: "Thanh toán thất bại",
  PREPARING: "Đang pha chế",
  READY: "Sẵn sàng lấy",
  COMPLETED: "Hoàn tất",
  CANCELLED: "Đã hủy",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

/** Chỉ đơn PENDING hoặc PAYMENT_FAILED mới được thanh toán (theo máy trạng thái của đề). */
export function isPayable(status: string): boolean {
  return status === "PENDING" || status === "PAYMENT_FAILED";
}

// ---- Khóa thanh toán (Idempotency-Key) ----

export type PaymentAttempt = {
  orderId: number;
  idempotencyKey: string;
  method: PaymentMethod;
  outcome: PaymentOutcome;
};

export function paymentAttemptStorageKey(orderId: number): string {
  return `brewlite-mock-payment-${orderId}`;
}

/**
 * Dùng lại khóa đã lưu chỉ khi đang gửi lại ĐÚNG yêu cầu cũ (cùng đơn, phương thức, kết quả),
 * tức lần trước chưa biết server đã xử lý hay chưa (mất mạng, timeout).
 * Khóa chỉ bị xóa khi server đã trả lời rõ ràng; khi đó lần thử sau dùng khóa mới.
 */
export function reusableAttempt(
  saved: unknown,
  orderId: number,
  method: PaymentMethod,
  outcome: PaymentOutcome,
): PaymentAttempt | null {
  if (!saved || typeof saved !== "object") return null;
  const attempt = saved as Partial<PaymentAttempt>;
  if (
    attempt.orderId === orderId &&
    attempt.method === method &&
    attempt.outcome === outcome &&
    typeof attempt.idempotencyKey === "string" &&
    attempt.idempotencyKey.length > 0
  ) {
    return attempt as PaymentAttempt;
  }
  return null;
}

// ---- Liên kết giỏ hàng với đơn PENDING đang chờ thanh toán ----

export const PENDING_CHECKOUT_KEY = "brewlite-pending-checkout";

export type PendingCheckout = { orderId: number; userId: number; fingerprint: string };

/** Dấu vân tay nội dung giỏ: đổi món, size, topping hoặc số lượng thì dấu thay đổi. */
export function cartFingerprint(items: Pick<CartItem, "productId" | "size" | "toppings" | "quantity">[]): string {
  return JSON.stringify(
    items.map((item) => [item.productId, item.size.name, item.toppings.map((t) => t.name), item.quantity]),
  );
}

/**
 * Nếu giỏ hiện tại đã có đơn PENDING/PAYMENT_FAILED của cùng tài khoản thì quay lại đơn đó,
 * tránh tạo thêm đơn mới mỗi lần bấm "Thanh toán".
 */
export function pendingOrderFor(saved: unknown, userId: number | undefined, fingerprint: string): number | null {
  if (!saved || typeof saved !== "object" || userId === undefined) return null;
  const pending = saved as Partial<PendingCheckout>;
  if (pending.userId === userId && pending.fingerprint === fingerprint && Number.isSafeInteger(pending.orderId)) {
    return pending.orderId as number;
  }
  return null;
}

/** Đọc JSON từ sessionStorage; trả null nếu trình duyệt chặn hoặc dữ liệu hỏng. */
export function readSession(key: string): unknown {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

export function writeSession(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sessionStorage có thể bị chặn: vẫn tiếp tục trong bộ nhớ */
  }
}

export function removeSession(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* bỏ qua */
  }
}
