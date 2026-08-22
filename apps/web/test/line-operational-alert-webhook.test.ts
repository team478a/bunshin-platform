import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { LineOperationalAlertWebhook } from '../src/line/operational-alert-webhook';

const assessment = {
  environment: 'PRODUCTION' as const,
  ready: false,
  alerts: [{ code: 'DEAD_DELIVERY_JOBS', severity: 'CRITICAL' as const, count: 2 }],
  fingerprint: 'abc12345',
  checkedAt: new Date('2026-08-22T08:00:00Z'),
};

describe('LINE operational alert webhook', () => {
  it('sends only aggregate alert data to an explicitly allowed HTTPS host', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const notifier = new LineOperationalAlertWebhook({
      url: 'https://alerts.example.com/bunshin',
      allowedHosts: ['alerts.example.com'],
      token: 'external-alert-secret',
      fetch: request,
    });

    await notifier.notify(assessment);

    const [url, init] = request.mock.calls[0] ?? [];
    expect(url).toBeInstanceOf(URL);
    expect((url as URL).href).toBe('https://alerts.example.com/bunshin');
    expect(init?.redirect).toBe('error');
    expect(init?.headers).toMatchObject({
      authorization: 'Bearer external-alert-secret',
      'x-bunshin-alert-key': 'abc12345',
    });
    expect(typeof init?.body).toBe('string');
    const body = init?.body as string;
    expect(body).toContain('DEAD_DELIVERY_JOBS');
    expect(body).not.toContain('external-alert-secret');
    expect(body).not.toContain('userId');
    expect(body).not.toContain('mission');
  });

  it.each([
    'http://alerts.example.com/hook',
    'https://user:password@alerts.example.com/hook',
    'https://alerts.example.com/hook?secret=value',
    'https://not-allowed.example.com/hook',
  ])('rejects an unsafe or non-allowlisted URL: %s', (url) => {
    expect(
      () =>
        new LineOperationalAlertWebhook({
          url,
          allowedHosts: ['alerts.example.com'],
        }),
    ).toThrow('unsafe LINE alert webhook URL');
  });

  it('maps non-success responses without reading provider bodies', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('secret-provider-response', { status: 503 }));
    const notifier = new LineOperationalAlertWebhook({
      url: 'https://alerts.example.com/hook',
      allowedHosts: ['alerts.example.com'],
      fetch: request,
    });

    await expect(notifier.notify(assessment)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });
});
