import { createHmac, timingSafeEqual } from 'node:crypto';
import { Problem, requireCondition as check } from '../errors.js';
import type { Quote } from './model.js';
import type { ModularSaasService, PaymentProvider } from './service.js';
import { boundedBody, response } from './http.js';
import { object, text } from './validation.js';

/** Payment collection adapter. It never treats a browser redirect as proof of payment. */
export class PaystackProvider implements PaymentProvider {
  constructor(private secret: string, private callbackUrl: string,
    private transport: typeof fetch = fetch) {
    check(secret.startsWith('sk_'), 'Use a server-side Paystack secret');
    check(new URL(callbackUrl).protocol === 'https:', 'Use an HTTPS payment callback');
  }
  private async call(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    const result = await this.transport('https://api.paystack.co' + path, {
      ...init, headers: { Authorization: 'Bearer ' + this.secret, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000)
    });
    check(result.ok, 'Payment provider is temporarily unavailable', 502);
    const body = object(await result.json() as unknown, 'Provider response');
    check(body.status === true, 'Payment provider did not accept the request', 502);
    return object(body.data, 'Provider data');
  }
  async initialise(request: { tenant_id: string; quote: Quote; email: string }): Promise<{ reference: string; authorization_url: string }> {
    const reference = 'GR-' + request.quote.id;
    const result = await this.call('/transaction/initialize', { method: 'POST', body: JSON.stringify({
      email: request.email, amount: request.quote.due_minor, currency: request.quote.currency,
      reference, callback_url: this.callbackUrl,
      metadata: { tenant_id: request.tenant_id, quote_id: request.quote.id }
    }) });
    const authorizationUrl = text(result, 'authorization_url', undefined, 2000);
    check(new URL(authorizationUrl).protocol === 'https:', 'Invalid provider checkout URL', 502);
    return { reference, authorization_url: authorizationUrl };
  }
  async webhook(request: Request, service: ModularSaasService): Promise<Response> {
    try {
      check(request.method === 'POST', 'Method not allowed', 405);
      const raw = await boundedBody(request, 1_048_576);
      const signature = request.headers.get('x-paystack-signature') ?? '';
      const expected = createHmac('sha512', this.secret).update(raw).digest('hex');
      check(/^[0-9a-f]{128}$/i.test(signature)
        && timingSafeEqual(Buffer.from(signature.toLowerCase()), Buffer.from(expected)), 'Webhook signature refused', 401);
      const event = object(JSON.parse(raw) as unknown, 'Webhook');
      if (event.event !== 'charge.success') return response(200, { ignored: true });
      const reference = text(object(event.data, 'Webhook data'), 'reference');
      check(/^[A-Za-z0-9_-]{1,150}$/.test(reference), 'Invalid payment reference');
      const transaction = await this.call('/transaction/verify/' + encodeURIComponent(reference));
      check(transaction.status === 'success' && transaction.reference === reference, 'Transaction is not a verified success', 409);
      const metadata = object(transaction.metadata, 'Verified transaction metadata');
      const amount = transaction.amount;
      check(typeof amount === 'number' && Number.isSafeInteger(amount), 'Invalid verified amount', 409);
      const result = await service.settlePayment(text(metadata, 'tenant_id'), text(metadata, 'quote_id'), reference,
        amount, text(transaction, 'currency'));
      return response(200, result);
    } catch (error) {
      const p = error instanceof Problem ? error : new Problem('Webhook processing failed', 502);
      return response(p.status, { error: p.message });
    }
  }
}
