import { ConflictException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import {
  assertTransition,
  canTransition,
  InvalidOrderTransitionException,
  isTerminal,
  ORDER_TRANSITIONS,
  paymentTransitionPath,
} from './order-state';

const { PENDING, PAID, PAYMENT_FAILED, PREPARING, READY, COMPLETED, CANCELLED } = OrderStatus;
const ALL = Object.values(OrderStatus);

// Các mũi tên trong sơ đồ mục 9.1 của đề, viết lại độc lập với bảng trong code để test thật sự đối chiếu.
const ARROWS: Array<[OrderStatus, OrderStatus]> = [
  [PENDING, PAID],
  [PAID, PREPARING],
  [PREPARING, READY],
  [READY, COMPLETED],
  [PENDING, PAYMENT_FAILED],
  [PAYMENT_FAILED, PENDING],
  [PENDING, CANCELLED],
  [PAID, CANCELLED],
  [PAYMENT_FAILED, CANCELLED],
];
const isArrow = (from: OrderStatus, to: OrderStatus) =>
  ARROWS.some(([f, t]) => f === from && t === to);

describe('Order State Machine (Task 10)', () => {
  it('bảng chuyển tiếp có đủ 7 trạng thái của enum OrderStatus', () => {
    expect(Object.keys(ORDER_TRANSITIONS).sort()).toEqual([...ALL].sort());
  });

  describe('đúng từng cặp trong 7 × 7 = 49 cặp trạng thái', () => {
    const pairs = ALL.flatMap((from) => ALL.map((to) => [from, to] as const));

    it.each(pairs.filter(([f, t]) => isArrow(f, t)))('cho phép %s → %s', (from, to) => {
      expect(canTransition(from, to)).toBe(true);
      expect(() => assertTransition(from, to)).not.toThrow();
    });

    it.each(pairs.filter(([f, t]) => !isArrow(f, t)))('chặn %s → %s', (from, to) => {
      expect(canTransition(from, to)).toBe(false);
      expect(() => assertTransition(from, to)).toThrow(InvalidOrderTransitionException);
    });
  });

  it('luồng chính PENDING → PAID → PREPARING → READY → COMPLETED đi được hết', () => {
    const flow = [PENDING, PAID, PREPARING, READY, COMPLETED];
    for (let i = 1; i < flow.length; i++) {
      expect(() => assertTransition(flow[i - 1], flow[i])).not.toThrow();
    }
  });

  it.each<[OrderStatus, OrderStatus, string]>([
    [PENDING, PREPARING, 'bỏ qua thanh toán'],
    [PENDING, COMPLETED, 'nhảy thẳng tới hoàn tất'],
    [PAYMENT_FAILED, PAID, 'thanh toán lại mà không qua PENDING'],
    [PREPARING, CANCELLED, 'hủy khi đang pha'],
    [READY, PAID, 'đi lùi'],
    [COMPLETED, CANCELLED, 'hủy đơn đã hoàn tất'],
    [CANCELLED, PENDING, 'mở lại đơn đã hủy'],
  ])('chặn %s → %s (%s)', (from, to, _reason) => {
    expect(() => assertTransition(from, to)).toThrow(InvalidOrderTransitionException);
  });

  it('lỗi là 409 Conflict và nói rõ trạng thái đi/đến', () => {
    const error = (() => {
      try {
        assertTransition(CANCELLED, PAID);
      } catch (e) {
        return e as InvalidOrderTransitionException;
      }
      throw new Error('assertTransition phải ném lỗi');
    })();
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getStatus()).toBe(409);
    expect(error.message).toBe('Không thể chuyển đơn từ CANCELLED sang PAID.');
  });

  it('COMPLETED và CANCELLED là trạng thái kết thúc, còn lại thì không', () => {
    expect(ALL.filter(isTerminal).sort()).toEqual([CANCELLED, COMPLETED]);
  });

  describe('paymentTransitionPath', () => {
    it('PENDING thanh toán thẳng sang PAID hoặc PAYMENT_FAILED', () => {
      expect(paymentTransitionPath(PENDING, PAID)).toEqual([PAID]);
      expect(paymentTransitionPath(PENDING, PAYMENT_FAILED)).toEqual([PAYMENT_FAILED]);
    });

    it('PAYMENT_FAILED phải thử lại về PENDING trước', () => {
      expect(paymentTransitionPath(PAYMENT_FAILED, PAID)).toEqual([PENDING, PAID]);
      expect(paymentTransitionPath(PAYMENT_FAILED, PAYMENT_FAILED)).toEqual([
        PENDING,
        PAYMENT_FAILED,
      ]);
    });

    it.each([PAID, PREPARING, READY, COMPLETED, CANCELLED])(
      'chặn thanh toán đơn đang ở %s',
      (status) => {
        expect(() => paymentTransitionPath(status, PAID)).toThrow(InvalidOrderTransitionException);
      },
    );
  });
});
