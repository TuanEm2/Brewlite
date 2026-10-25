import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    await this.seedDefaultProductsIfEmpty();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async seedDefaultProductsIfEmpty(): Promise<void> {
    try {
      const count = await this.product.count();
      if (count === 0) {
        const sizes: Prisma.InputJsonValue = [
          { name: 'S', price: 0 },
          { name: 'M', price: 5000 },
          { name: 'L', price: 10000 },
        ];
        const toppings: Prisma.InputJsonValue = [
          { name: 'Trân châu', price: 5000 },
          { name: 'Kem', price: 10000 },
        ];
        await this.product.createMany({
          data: [
            {
              name: 'Cà phê sữa',
              price: 35000,
              imageUrl: 'https://placehold.co/400x400?text=Ca+Phe+Sua',
              stock: 100,
              sizes,
              toppings,
            },
            {
              name: 'Americano',
              price: 40000,
              imageUrl: 'https://placehold.co/400x400?text=Americano',
              stock: 100,
              sizes,
              toppings,
            },
            {
              name: 'Cappuccino',
              price: 45000,
              imageUrl: 'https://placehold.co/400x400?text=Cappuccino',
              stock: 100,
              sizes,
              toppings,
            },
            {
              name: 'Trà đào',
              price: 39000,
              imageUrl: 'https://placehold.co/400x400?text=Tra+Dao',
              stock: 100,
              sizes,
              toppings,
            },
          ],
        });
        this.logger.log('Đã tự động khởi tạo 4 sản phẩm mẫu vào cơ sở dữ liệu.');
      }
    } catch {
      // Bỏ qua nếu bảng chưa sẵn sàng (trong quá trình chạy migration/test)
    }
  }
}
