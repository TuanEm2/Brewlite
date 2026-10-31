import { BadRequestException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { PayosGateway, payosDataToSign } from './payos.gateway';

describe('PayosGateway signed webhook', () => {
  const gateway = new PayosGateway();
  const prior = {
    mode: process.env.PAYMENT_MODE,
    client: process.env.PAYOS_CLIENT_ID,
    api: process.env.PAYOS_API_KEY,
    key: process.env.PAYOS_CHECKSUM_KEY,
  };

  beforeEach(() => {
    process.env.PAYMENT_MODE = 'payos';
    process.env.PAYOS_CLIENT_ID = 'test-client-only';
    process.env.PAYOS_API_KEY = 'test-api-only';
    process.env.PAYOS_CHECKSUM_KEY = 'test-checksum-only';
  });

  afterAll(() => {
    for (const [envKey, value] of [
      ['PAYMENT_MODE', prior.mode],
      ['PAYOS_CLIENT_ID', prior.client],
      ['PAYOS_API_KEY', prior.api],
      ['PAYOS_CHECKSUM_KEY', prior.key],
    ] as const) {
      if (value === undefined) delete process.env[envKey];
      else process.env[envKey] = value;
    }
  });

  const signed = (data: Record<string, unknown>, success = true) => ({
    code: '00', desc: 'success', success, data,
    signature: createHmac('sha256', 'test-checksum-only')
      .update(payosDataToSign(data)).digest('hex'),
  });

  it('accepts a correctly signed successful transaction and extracts the order fields', () => {
    const payload = signed({
      orderCode: 260000021, amount: 35000,
      paymentLinkId: 'payos-link-id', reference: 'bank-reference-123',
      currency: 'VND', code: '00',
    });
    expect(gateway.verifyWebhook(payload)).toEqual({
      orderCode: 260000021, amount: 35000,
      paymentLinkId: 'payos-link-id', reference: 'bank-reference-123', success: true,
    });
  });

  it('rejects tampered payment amounts even when other data is unchanged', () => {
    const payload = signed({
      orderCode: 260000021, amount: 35000,
      paymentLinkId: 'payos-link-id', reference: 'bank-reference-123',
      currency: 'VND', code: '00',
    });
    payload.data.amount = 1;
    expect(() => gateway.verifyWebhook(payload)).toThrow(BadRequestException);
  });

  it('rejects a missing or arbitrary signature', () => {
    expect(() => gateway.verifyWebhook({ data: { amount: 1 }, signature: 'fake' }))
      .toThrow(BadRequestException);
  });

  it('never treats a signed failure as a successful payment', () => {
    const payload = signed({
      orderCode: 260000021, amount: 35000,
      paymentLinkId: 'payos-link-id', reference: 'bank-reference-123', code: '00',
    }, false);
    expect(gateway.verifyWebhook(payload).success).toBe(false);
  });
});
