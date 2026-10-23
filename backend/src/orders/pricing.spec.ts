import { BadRequestException } from '@nestjs/common';
import { orderTotal, priceLine, PricingProduct } from './pricing';

// Bộ size/topping giống seed của TV2.
const sizes = [
  { name: 'S', price: 0 },
  { name: 'M', price: 5000 },
  { name: 'L', price: 10000 },
];
const toppings = [
  { name: 'Trân châu', price: 5000 },
  { name: 'Kem', price: 10000 },
];
const cappuccino: PricingProduct = { id: 3, name: 'Cappuccino', price: 45000, sizes, toppings };
const traDao: PricingProduct = { id: 4, name: 'Trà đào', price: 39000, sizes, toppings };

describe('priceLine', () => {
  it('Cappuccino size L + Kem = 65.000đ (ví dụ kiểm thử của TV1)', () => {
    const line = priceLine(cappuccino, 'L', ['Kem'], 1);
    expect(line.unitPrice).toBe(65000);
    expect(line.lineTotal).toBe(65000);
    expect(line.toppings).toEqual([{ name: 'Kem', price: 10000 }]);
  });

  it('size S, không topping = giá gốc; thành tiền nhân số lượng', () => {
    const line = priceLine(traDao, 'S', [], 3);
    expect(line).toEqual({
      productId: 4,
      size: 'S',
      toppings: [],
      quantity: 3,
      unitPrice: 39000,
      lineTotal: 117000,
    });
  });

  it('báo 400 khi size không thuộc sản phẩm', () => {
    expect(() => priceLine(cappuccino, 'XL', [], 1)).toThrow(BadRequestException);
  });

  it('báo 400 khi topping không thuộc sản phẩm', () => {
    expect(() => priceLine(cappuccino, 'M', ['Thạch'], 1)).toThrow(BadRequestException);
  });

  it('báo 400 khi topping bị lặp', () => {
    expect(() => priceLine(cappuccino, 'M', ['Kem', 'Kem'], 1)).toThrow(BadRequestException);
  });
});

describe('orderTotal', () => {
  it('giỏ Cappuccino M ×1 + Trà đào L (Kem, Trân châu) ×2 = 178.000đ (ví dụ kiểm thử của TV2)', () => {
    const lines = [
      priceLine(cappuccino, 'M', [], 1),
      priceLine(traDao, 'L', ['Kem', 'Trân châu'], 2),
    ];
    expect(lines.map((l) => l.lineTotal)).toEqual([50000, 128000]);
    expect(orderTotal(lines)).toBe(178000);
  });

  it('giỏ rỗng có tổng 0', () => {
    expect(orderTotal([])).toBe(0);
  });
});
