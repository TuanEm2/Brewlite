import { parsePayosStatus, paymentView, payosUrl, PayosStatus } from '../../../frontend/store/payos-checkout';
const pending: PayosStatus = { orderId: 42, status: 'PENDING', amount: 40000, checkoutUrl: null, providerStatus: null };
describe('TV2 payOS checkout', () => {
  it.each(['PAID', 'PREPARING', 'READY', 'COMPLETED'])('keeps confirmation for %s', status => {
    expect(paymentView({ ...pending, status, providerStatus: 'EXPIRED' })).toBe('paid');
  });
  it('does not trust provider PAID or redirect query as order confirmation', () => {
    expect(paymentView({ ...pending, providerStatus: 'PAID' })).toBe('pending');
  });
  it.each(['EXPIRED', 'CANCELLED'])('blocks an unusable provider link: %s', providerStatus => {
    expect(paymentView({ ...pending, providerStatus })).toBe(providerStatus === 'EXPIRED' ? 'expired' : 'cancelled');
  });
  it('recognizes failure and cancelled orders', () => {
    expect(paymentView({ ...pending, status: 'PAYMENT_FAILED' })).toBe('failed');
    expect(paymentView({ ...pending, status: 'CANCELLED' })).toBe('cancelled');
  });
  it.each(['http://pay.payos.vn/web/a', 'https://pay.payos.vn.evil.test/a', 'https://evil.test', 'javascript:alert(1)', 'https://user:password@pay.payos.vn/a', 'https://pay.payos.vn:8443/a'])('rejects unsafe URL %s', url => {
    expect(() => payosUrl(url)).toThrow();
  });
  it('accepts the supported provider URL', () => expect(payosUrl('https://pay.payos.vn/web/abc')).toBe('https://pay.payos.vn/web/abc'));
  it('TV3: shows expired (not cancelled) for an order expired by the payment deadline', () => {
    expect(paymentView({ ...pending, status: 'CANCELLED', providerStatus: 'CANCELLED', expired: true })).toBe('expired');
    expect(paymentView({ ...pending, status: 'PAID', expired: true })).toBe('paid');
  });
  it('TV3: accepts deadline and drink names, rejects malformed ones', () => {
    const full = { ...pending, expiresAt: '2026-11-01T10:15:00.000Z', expired: false,
      items: [{ productName: 'Cappuccino', size: 'L', quantity: 1, lineTotal: 65000 }] };
    expect(parsePayosStatus(full, 42)).toEqual(full);
    expect(() => parsePayosStatus({ ...full, expiresAt: 'soon' }, 42)).toThrow();
    expect(() => parsePayosStatus({ ...full, items: [{ productName: 3 }] }, 42)).toThrow();
  });
  it('rejects wrong-order or malformed API data', () => {
    expect(parsePayosStatus(pending, 42)).toEqual(pending);
    expect(() => parsePayosStatus(pending, 43)).toThrow();
    expect(() => parsePayosStatus({ ...pending, amount: -1 }, 42)).toThrow();
    expect(() => parsePayosStatus({ ...pending, amount: '40000' }, 42)).toThrow();
  });
});
