import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { OrdersService } from './orders.service';

// Chưa có controller: `POST /orders` là phần của TV4 (Task 6 – API), dùng OrdersService.createPending.
@Module({
  imports: [ProductsModule],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
