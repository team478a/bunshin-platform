import { describe, expect, it, vi } from 'vitest';
import { CommercialBillingReminderResend } from '../src/email/commercial-billing-reminder';

const input = {
  apiKey: 'secret',
  from: 'billing@example.com',
  to: 'customer@example.com',
  invoiceNumber: 'WW-2026-09-001',
  billingName: '運営会社A',
  amountYen: 39_800,
  dueAt: new Date('2026-09-30T14:59:59.000Z'),
  checkoutUrl: 'https://checkout.stripe.com/example',
  overdue: false,
  idempotencyKey: 'commercial-invoice-initial-2026-09-20',
};

describe('CommercialBillingReminderResend', () => {
  it('sends invoice facts and the server-owned checkout URL', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));

    await new CommercialBillingReminderResend(request).send(input);

    expect(request).toHaveBeenCalledOnce();
    const [, init] = request.mock.calls[0]!;
    expect(typeof init?.body).toBe('string');
    const payload = JSON.parse(init?.body as string) as {
      to: string[];
      subject: string;
      text: string;
    };
    expect(payload.to).toEqual(['customer@example.com']);
    expect(payload.subject).toContain('月額利用料のお支払い案内');
    expect(payload.text).toContain('39,800円');
    expect(payload.text).toContain(input.checkoutUrl);
    expect(new Headers(init?.headers).get('idempotency-key')).toBe(input.idempotencyKey);
  });

  it('uses an overdue subject and does not invent a payment URL', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));

    await new CommercialBillingReminderResend(request).send({
      ...input,
      overdue: true,
      checkoutUrl: null,
    });

    const [, init] = request.mock.calls[0]!;
    expect(typeof init?.body).toBe('string');
    const payload = JSON.parse(init?.body as string) as { subject: string; text: string };
    expect(payload.subject).toContain('お支払期限を過ぎています');
    expect(payload.text).toContain('別途ご案内している請求書');
    expect(payload.text).not.toContain('checkout.stripe.com');
  });

  it('fails closed when the email provider rejects the request', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));

    await expect(new CommercialBillingReminderResend(request).send(input)).rejects.toThrow(
      'commercial billing reminder unavailable',
    );
  });
});
