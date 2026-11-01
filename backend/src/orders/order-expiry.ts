import { OrderStatus } from '@prisma/client';

/** Thời gian giữ đơn chờ thanh toán (và giữ kho nguyên liệu) mặc định: 15 phút. */
export const DEFAULT_PAYMENT_TTL_MINUTES = 15;

/**
 * Số phút một đơn được chờ thanh toán, đọc từ ORDER_PAYMENT_TTL_MINUTES.
 * Giới hạn 2–1440 phút: link payOS cần hạn ở tương lai và không giữ kho quá một ngày.
 */
export function paymentTtlMinutes(env: NodeJS.ProcessEnv = process.env): number {
  const value = Number(env.ORDER_PAYMENT_TTL_MINUTES ?? DEFAULT_PAYMENT_TTL_MINUTES);
  if (!Number.isInteger(value) || value < 2 || value > 1440) return DEFAULT_PAYMENT_TTL_MINUTES;
  return value;
}

/** Hạn thanh toán của đơn = thời điểm tạo + TTL. Kho nguyên liệu được giữ đến lúc này. */
export function paymentDeadline(createdAt: Date, ttlMinutes = paymentTtlMinutes()): Date {
  return new Date(createdAt.getTime() + ttlMinutes * 60_000);
}

/** Đơn còn chờ thanh toán (chưa trả tiền, chưa kết thúc). */
export function isAwaitingPayment(status: OrderStatus): boolean {
  return status === OrderStatus.PENDING || status === OrderStatus.PAYMENT_FAILED;
}

/** Không tạo link payOS khi đơn còn ít hơn chừng này giây: payOS cần hạn ở tương lai và khách cần thời gian quét QR. */
export const MIN_PAYMENT_LINK_SECONDS = 120;

export function secondsUntilDeadline(createdAt: Date, now = new Date(), ttlMinutes = paymentTtlMinutes()): number {
  return Math.floor((paymentDeadline(createdAt, ttlMinutes).getTime() - now.getTime()) / 1000);
}

export function isPaymentOverdue(createdAt: Date, now = new Date(), ttlMinutes = paymentTtlMinutes()): boolean {
  return now.getTime() >= paymentDeadline(createdAt, ttlMinutes).getTime();
}
