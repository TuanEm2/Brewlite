import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const sizes: Prisma.InputJsonValue = [
  { name: 'S', price: 0 },
  { name: 'M', price: 5000 },
  { name: 'L', price: 10000 },
];

const toppings: Prisma.InputJsonValue = [
  { name: 'Trân châu', price: 5000 },
  { name: 'Kem', price: 10000 },
];

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed xóa dữ liệu đơn hàng và sản phẩm, không chạy trên production.');
  }

  // Xóa sạch dữ liệu mẫu cũ và đặt lại id về 1, để mỗi lần seed sản phẩm luôn có id 1..4.
  await prisma.$executeRaw`TRUNCATE TABLE "Payment", "OrderItem", "Order", "Product" RESTART IDENTITY CASCADE`;

  await prisma.product.createMany({
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

  console.log('Seeded 4 sample products successfully.');
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    throw error;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
