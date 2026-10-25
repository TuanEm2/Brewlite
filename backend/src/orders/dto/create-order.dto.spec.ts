import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateOrderDto } from './create-order.dto';

const validItem = { productId: 3, size: 'M', toppings: ['Kem'], quantity: 1 };

async function errorsFor(body: unknown): Promise<string[]> {
  const errors = await validate(plainToInstance(CreateOrderDto, body));
  // Gom tên thuộc tính lỗi, kể cả lỗi lồng trong items[i].
  const names: string[] = [];
  const walk = (list: typeof errors, prefix: string) =>
    list.forEach((e) => {
      const path = prefix ? `${prefix}.${e.property}` : e.property;
      if (e.constraints) names.push(path);
      walk(e.children ?? [], path);
    });
  walk(errors, '');
  return names;
}

describe('CreateOrderDto', () => {
  it('chấp nhận giỏ hợp lệ, topping có thể rỗng', async () => {
    expect(await errorsFor({ items: [validItem, { ...validItem, size: 'S', toppings: [] }] })).toEqual([]);
  });

  it.each([
    ['thiếu items', {}, 'items'],
    ['items rỗng', { items: [] }, 'items'],
    ['quantity = 0', { items: [{ ...validItem, quantity: 0 }] }, 'items.0.quantity'],
    ['quantity = 100', { items: [{ ...validItem, quantity: 100 }] }, 'items.0.quantity'],
    ['quantity thập phân', { items: [{ ...validItem, quantity: 1.5 }] }, 'items.0.quantity'],
    ['size XL', { items: [{ ...validItem, size: 'XL' }] }, 'items.0.size'],
    ['productId = 0', { items: [{ ...validItem, productId: 0 }] }, 'items.0.productId'],
    ['productId là chuỗi', { items: [{ ...validItem, productId: '3' }] }, 'items.0.productId'],
    ['topping lặp', { items: [{ ...validItem, toppings: ['Kem', 'Kem'] }] }, 'items.0.toppings'],
    ['topping rỗng', { items: [{ ...validItem, toppings: [''] }] }, 'items.0.toppings'],
  ])('từ chối khi %s', async (_case, body, field) => {
    expect(await errorsFor(body)).toContain(field);
  });
});
