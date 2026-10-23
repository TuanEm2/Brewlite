import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';

// Chưa có controller: `POST /orders` là phần của TV4 (Task 6 – API), dùng OrdersService.createPending.
@Module({
  imports: [ProductsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}

