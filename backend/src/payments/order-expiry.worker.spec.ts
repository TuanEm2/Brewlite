import { PrismaService } from '../prisma/prisma.service';
import { OrderExpiryWorker } from './order-expiry.worker';
import { PayosService } from './payos.service';

describe('OrderExpiryWorker (lỗi 8: mặc định tắt)', () => {
  const prior = { nodeEnv: process.env.NODE_ENV, enabled: process.env.ORDER_EXPIRY_WORKER_ENABLED };
  afterEach(() => {
    jest.restoreAllMocks();
    process.env.NODE_ENV = prior.nodeEnv;
    if (prior.enabled === undefined) delete process.env.ORDER_EXPIRY_WORKER_ENABLED;
    else process.env.ORDER_EXPIRY_WORKER_ENABLED = prior.enabled;
  });

  const start = () => {
    const spy = jest.spyOn(global, 'setInterval');
    const worker = new OrderExpiryWorker({} as PrismaService, {} as PayosService);
    worker.onModuleInit();
    worker.onModuleDestroy();
    return spy;
  };

  it.each([undefined, 'false', '1', 'TRUE'])('không chạy khi ORDER_EXPIRY_WORKER_ENABLED=%s', (value) => {
    process.env.NODE_ENV = 'production';
    if (value === undefined) delete process.env.ORDER_EXPIRY_WORKER_ENABLED;
    else process.env.ORDER_EXPIRY_WORKER_ENABLED = value;
    expect(start()).not.toHaveBeenCalled();
  });

  it('chỉ chạy khi đặt rõ ORDER_EXPIRY_WORKER_ENABLED=true', () => {
    process.env.NODE_ENV = 'production';
    process.env.ORDER_EXPIRY_WORKER_ENABLED = 'true';
    expect(start()).toHaveBeenCalledTimes(1);
  });

  it('không bao giờ chạy trong test', () => {
    process.env.NODE_ENV = 'test';
    process.env.ORDER_EXPIRY_WORKER_ENABLED = 'true';
    expect(start()).not.toHaveBeenCalled();
  });
});
