import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TV4 ingredient inventory preview', () => {
  const product = {
    id: 1,
    name: 'Cà phê sữa',
    sizes: [{ name: 'S', price: 0 }, { name: 'M', price: 5000 }],
    toppings: [{ name: 'Trân châu', price: 5000 }],
  };
  const rows = [
    { ingredientId: 1, size: 'S', topping: '', quantity: 18,
      ingredient: { id: 1, name: 'Cà phê', stock: 90, unit: 'G' } },
    { ingredientId: 2, size: 'S', topping: '', quantity: 25,
      ingredient: { id: 2, name: 'Sữa đặc', stock: 100, unit: 'ML' } },
    { ingredientId: 3, size: 'S', topping: 'Trân châu', quantity: 30,
      ingredient: { id: 3, name: 'Trân châu', stock: 60, unit: 'G' } },
    { ingredientId: 1, size: 'M', topping: '', quantity: 22,
      ingredient: { id: 1, name: 'Cà phê', stock: 90, unit: 'G' } },
    { ingredientId: 2, size: 'M', topping: '', quantity: 30,
      ingredient: { id: 2, name: 'Sữa đặc', stock: 100, unit: 'ML' } },
  ];
  const findProduct = jest.fn();
  const findRecipe = jest.fn();
  const service = new ProductsService({
    product: { findUnique: findProduct },
    productIngredient: { findMany: findRecipe },
  } as unknown as PrismaService);

  beforeEach(() => {
    findProduct.mockReset().mockResolvedValue(product);
    findRecipe.mockReset().mockResolvedValue(rows);
  });

  it('size S không topping: lấy đúng định lượng, không cộng topping chưa chọn', async () => {
    const result = await service.ingredientAvailability(1, 'S', []);
    expect(result.configured).toBe(true);
    expect(result.maxCups).toBe(4);
    expect(result.ingredients).toEqual([
      expect.objectContaining({ name: 'Cà phê', requiredForOne: 18, available: 90, maxCups: 5 }),
      expect.objectContaining({ name: 'Sữa đặc', requiredForOne: 25, available: 100, maxCups: 4 }),
    ]);
  });

  it('size S + topping trân châu: trả đúng nguyên liệu bổ sung và giới hạn số ly', async () => {
    const result = await service.ingredientAvailability(1, 'S', ['Trân châu']);
    expect(result.maxCups).toBe(2);
    expect(result.ingredients).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Trân châu', requiredForOne: 30, available: 60, maxCups: 2 }),
    ]));
  });

  it('size M: dùng công thức size M, không lẫn S', async () => {
    const result = await service.ingredientAvailability(1, 'M', []);
    expect(result.maxCups).toBe(3);
    expect(result.ingredients).toEqual([
      expect.objectContaining({ name: 'Cà phê', requiredForOne: 22 }),
      expect.objectContaining({ name: 'Sữa đặc', requiredForOne: 30 }),
    ]);
  });

  it('nguyên liệu hết: số ly khả dụng bằng 0', async () => {
    findRecipe.mockResolvedValue([
      { ...rows[0], ingredient: { ...rows[0].ingredient, stock: 0 } },
    ]);
    const result = await service.ingredientAvailability(1, 'S', []);
    expect(result.maxCups).toBe(0);
  });

  it('không có công thức: báo chưa cấu hình, không gán số tồn giả', async () => {
    findRecipe.mockResolvedValue([]);
    await expect(service.ingredientAvailability(1, 'S', []))
      .resolves.toMatchObject({ configured: false, maxCups: null, ingredients: [] });
  });

  it('chặn size, topping sai hoặc lặp và mã sản phẩm không tồn tại', async () => {
    await expect(service.ingredientAvailability(1, 'XL', [])).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.ingredientAvailability(1, 'S', ['Topping giả'])).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.ingredientAvailability(1, 'S', ['Trân châu', 'Trân châu']))
      .rejects.toBeInstanceOf(BadRequestException);
    findProduct.mockResolvedValue(null);
    await expect(service.ingredientAvailability(999, 'S', [])).rejects.toBeInstanceOf(NotFoundException);
  });
});
