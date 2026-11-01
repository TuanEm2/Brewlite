import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PayosService } from './payos.service';

@Injectable()
export class OrderExpiryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderExpiryWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private cursor = 0;
  constructor(private readonly prisma: PrismaService, private readonly payos: PayosService) {}
  onModuleInit() {
    // Mặc định TẮT: bật lần đầu trên Render sẽ hủy hàng loạt đơn chờ cũ và hủy link payOS của chúng,
    // nên trưởng nhóm phải chủ động đặt ORDER_EXPIRY_WORKER_ENABLED=true. Khi tắt, đơn vẫn được
    // đồng bộ/hết hạn lúc khách mở trang thanh toán.
    if (process.env.NODE_ENV === 'test' || process.env.ORDER_EXPIRY_WORKER_ENABLED !== 'true') return;
    this.timer = setInterval(() => void this.scan(), 30_000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async scan() {
    if (this.running) return;
    this.running = true;
    try {
      const orders = await this.prisma.order.findMany({
        where: { id: { gt: this.cursor }, status: { in: [OrderStatus.PENDING, OrderStatus.PAYMENT_FAILED] } },
        select: { id: true }, orderBy: { id: 'asc' }, take: 25,
      });
      this.cursor = orders.length === 25 ? orders[orders.length - 1].id : 0;
      for (const order of orders) {
        try { await this.payos.syncOrder(order.id); }
        catch { this.logger.warn('Cannot reconcile order #' + order.id + '; retaining stock for retry/manual reconciliation.'); }
      }
    } catch { this.logger.error('Order expiry scan failed; will retry.'); }
    finally { this.running = false; }
  }
}
