import { BadRequestException } from '@nestjs/common';
import { applyVoucher } from './voucher';

describe('Voucher BREW10', () => {
  it('không có mã thì giữ nguyên giá', () => {
    expect(applyVoucher(70000)).toEqual({
      voucherCode: null,
      discount: 0,
      total: 70000,
    });
  });

  it('chuẩn hóa mã và giảm 10%', () => {
    expect(applyVoucher(70000, ' brew10 ')).toEqual({
      voucherCode: 'BREW10',
      discount: 7000,
      total: 63000,
    });
  });

  it('chấp nhận đơn đúng ngưỡng 50.000đ', () => {
    expect(applyVoucher(50000, 'BREW10').discount).toBe(5000);
  });

  it('từ chối đơn dưới ngưỡng', () => {
    expect(() => applyVoucher(49999, 'BREW10'))
      .toThrow(BadRequestException);
  });

  it('giới hạn mức giảm tối đa 20.000đ', () => {
    expect(applyVoucher(300000, 'BREW10')).toEqual({
      voucherCode: 'BREW10',
      discount: 20000,
      total: 280000,
    });
  });

  it('làm tròn tiền giảm xuống số nguyên VND', () => {
    expect(applyVoucher(50009, 'BREW10').discount).toBe(5000);
  });

  it.each(['INVALID', '', '   '])('từ chối mã "%s"', (code) => {
    expect(() => applyVoucher(70000, code))
      .toThrow(BadRequestException);
  });

  it.each([-1, 1.5, NaN, Infinity])(
    'từ chối tổng tiền không hợp lệ: %s',
    (subtotal) => {
      expect(() => applyVoucher(subtotal))
        .toThrow(BadRequestException);
    },
  );
});