import { BadRequestException } from '@nestjs/common';

export interface VoucherResult {
  voucherCode: string | null;
  discount: number;
  total: number;
}

export function applyVoucher(
  subtotal: number,
  rawCode?: string,
): VoucherResult {
  if (!Number.isSafeInteger(subtotal) || subtotal < 0) {
    throw new BadRequestException('Tổng tiền không hợp lệ.');
  }

  if (rawCode === undefined) {
    return { voucherCode: null, discount: 0, total: subtotal };
  }

  const voucherCode = rawCode.trim().toUpperCase();

  if (voucherCode !== 'BREW10') {
    throw new BadRequestException('Mã giảm giá không hợp lệ.');
  }

  if (subtotal < 50000) {
    throw new BadRequestException(
      'Mã BREW10 yêu cầu đơn hàng từ 50.000đ.',
    );
  }

  const discount = Math.min(Math.floor(subtotal / 10), 20000);

  return {
    voucherCode,
    discount,
    total: subtotal - discount,
  };
}