import { ConflictException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';

/**
 * Máy trạng thái đơn hàng (Task 10), đúng sơ đồ mục 9.1 của đề BrewLite:
 *
 *   PENDING ──thanh toán OK──▶ PAID ──barista nhận──▶ PREPARING ──pha xong──▶ READY ──giao khách──▶ COMPLETED
 *   PENDING ──thanh toán lỗi──▶ PAYMENT_FAILED ──thử lại──▶ PENDING
 *   PENDING, PAID, PAYMENT_FAILED ──hủy──▶ CANCELLED
 *
 * Mọi chuyển tiếp không có trong bảng đều bị `assertTransition` chặn.
 * COMPLETED và CANCELLED là trạng thái kết thúc.
 */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  PENDING: [OrderStatus.PAID, OrderStatus.PAYMENT_FAILED, OrderStatus.CANCELLED],
  PAYMENT_FAILED: [OrderStatus.PENDING, OrderStatus.CANCELLED],
  PAID: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  PREPARING: [OrderStatus.READY],
  READY: [OrderStatus.COMPLETED],
  COMPLETED: [],
  CANCELLED: [],
};

export class InvalidOrderTransitionException extends ConflictException {
  constructor(
    readonly from: OrderStatus,
    readonly to: OrderStatus,
  ) {
    super(`Không thể chuyển đơn từ ${from} sang ${to}.`);
  }
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export function isTerminal(status: OrderStatus): boolean {
  return ORDER_TRANSITIONS[status].length === 0;
}

/** Ném InvalidOrderTransitionException (HTTP 409) khi chuyển tiếp không có trong sơ đồ. */
export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidOrderTransitionException(from, to);
  }
}

/**
 * Đường đi trạng thái của một lần thanh toán, mỗi bước đã qua assertTransition.
 * Đơn PAYMENT_FAILED phải "thử lại" về PENDING trước rồi mới sang PAID/PAYMENT_FAILED,
 * nên trả về [PENDING, đích]. Bước trung gian và bước đích được ghi trong cùng một transaction.
 */
export function paymentTransitionPath(
  current: OrderStatus,
  target: typeof OrderStatus.PAID | typeof OrderStatus.PAYMENT_FAILED,
): OrderStatus[] {
  const path: OrderStatus[] =
    current === OrderStatus.PAYMENT_FAILED ? [OrderStatus.PENDING, target] : [target];
  let from = current;
  for (const to of path) {
    assertTransition(from, to);
    from = to;
  }
  return path;
}
