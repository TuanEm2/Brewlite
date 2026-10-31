import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PayosGateway } from './payos.gateway';
import { PayosService } from './payos.service';

@Module({
  imports: [AuthModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PayosGateway, PayosService],
  exports: [PaymentsService, PayosService],
})
export class PaymentsModule {}
