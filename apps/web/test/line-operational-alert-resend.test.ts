import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { LineOperationalAlertResend } from '../src/line/operational-alert-resend';

const assessment = {
  environment: 'PRODUCTION' as const,
  ready: false,
  alerts: [{ code: 'DEAD_DELIVERY_JOBS', severity: 'CRITICAL' as const, count: 2 }],
  fingerprint: 'abc12345',
  checkedAt: new Date('2026-08-25T08:00:00Z'),
};

describe('Resend LINE operational alert', () => {
  it('sends only aggregate operational data with an idempotency key', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 202 }));
    const notifier = new LineOperationalAlertResend({
      apiKey: 're_secret_api_key',
      from: 'alerts@example.com',
      to: ['admin@example.com'],
      fetch: request,
    });
    await notifier.notify(assessment);
    const [url, init] = request.mock.calls[0] ?? [];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init?.headers).toMatchObject({ 'idempotency-key': 'line-PRODUCTION-abc12345' });
    const body = init?.body as string;
    expect(body).toContain('送信できず停止した通知があります');
    expect(body).not.toContain('re_secret_api_key');
    expect(body).not.toContain('userId');
  });

  it('does not expose the provider response when sending fails', async () => {
    const notifier = new LineOperationalAlertResend({
      apiKey: 're_secret_api_key',
      from: 'alerts@example.com',
      to: ['admin@example.com'],
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('provider secret', { status: 401 })),
    });
    await expect(notifier.notify(assessment)).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });
});
