import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  OpsMorningDigestResend,
  OpsMorningDigestSendError,
} from '../src/email/ops-morning-digest-resend';

describe('OpsMorningDigestResend', () => {
  it('uses the existing Resend API with a stable environment and date idempotency key', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    await new OpsMorningDigestResend().send({
      apiKey: 'secret-value',
      from: 'ops@example.test',
      to: ['admin@example.test'],
      environment: 'PRODUCTION',
      targetDate: '2026-10-19',
      subject: 'subject',
      text: 'body',
      fetch,
    });
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(new Headers(init.headers).get('idempotency-key')).toBe(
      'ops-morning-digest-PRODUCTION-2026-10-19',
    );
    expect(JSON.parse(init.body as string)).toMatchObject({
      from: 'ops@example.test',
      to: ['admin@example.test'],
      subject: 'subject',
      text: 'body',
    });
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer secret-value');
  });

  it('classifies provider failures and ambiguous network outcomes without exposing response data', async () => {
    const adapter = new OpsMorningDigestResend();
    const base = {
      apiKey: 'secret-value',
      from: 'ops@example.test',
      to: ['admin@example.test'],
      environment: 'PRODUCTION' as const,
      targetDate: '2026-10-19',
      subject: 'subject',
      text: 'body',
    };
    await expect(
      adapter.send({
        ...base,
        fetch: vi.fn().mockResolvedValue(new Response('private provider body', { status: 500 })),
      }),
    ).rejects.toMatchObject({ category: 'EMAIL_PROVIDER_FAILED' });
    await expect(
      adapter.send({
        ...base,
        fetch: vi.fn().mockRejectedValue(new Error('private network detail')),
      }),
    ).rejects.toMatchObject({ category: 'EMAIL_DELIVERY_UNCONFIRMED' });
    try {
      await adapter.send({
        ...base,
        fetch: vi.fn().mockRejectedValue(new Error('private network detail')),
      });
    } catch (error) {
      expect(error).toBeInstanceOf(OpsMorningDigestSendError);
      expect(String(error)).not.toContain('private network detail');
    }
  });
});
