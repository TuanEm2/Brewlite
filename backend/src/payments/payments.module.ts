import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { OrderExpiryWorker } from './order-expiry.worker';
import { AuthModule } from '../auth/auth.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PayosGateway } from './payos.gateway';
import { PayosService } from './payos.service';

@Module({
  imports: [AuthModule, OrdersModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PayosGateway, PayosService, OrderExpiryWorker],
  exports: [PaymentsService, PayosService],
})
export class PaymentsModule {}
