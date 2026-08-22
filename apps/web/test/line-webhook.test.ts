import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({
    APP_ENV: 'production',
    APP_URL: 'https://example.com',
    ENCRYPTION_KEY: 'test-encryption-key-material',
    LINE_CONFIG_KEY_VERSION: 1,
  }),
}));

const { handleLineWebhook, parseLineWebhookEvents, verifyLineWebhookSignature } =
  await import('../src/line/webhook');

describe('LINE webhook adapter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('verifies the HMAC against the untouched raw body', () => {
    const body = '{"events":[]}';
    const signature = createHmac('sha256', 'messaging-secret').update(body).digest('base64');
    expect(verifyLineWebhookSignature(body, signature, 'messaging-secret')).toBe(true);
    expect(verifyLineWebhookSignature(`${body} `, signature, 'messaging-secret')).toBe(false);
  });

  it('maps only minimal event fields and treats unsupported events as OTHER', () => {
    expect(
      parseLineWebhookEvents(
        JSON.stringify({
          destination: 'not-persisted',
          events: [
            {
              type: 'follow',
              timestamp: 1787378400000,
              webhookEventId: 'evt-follow',
              source: { type: 'user', userId: 'U0123456789abcdef' },
              replyToken: 'not-persisted',
            },
            { type: 'message', timestamp: 1787378400000, webhookEventId: 'evt-message' },
          ],
        }),
      ),
    ).toEqual([
      {
        providerEventId: 'evt-follow',
        providerUserId: 'U0123456789abcdef',
        type: 'FOLLOW',
        occurredAt: new Date(1787378400000),
      },
      {
        providerEventId: 'evt-message',
        providerUserId: null,
        type: 'OTHER',
        occurredAt: new Date(1787378400000),
      },
    ]);
  });

  it('rejects invalid signatures before parsing or processing', async () => {
    const processor = { execute: vi.fn() };
    const response = await handleLineWebhook(
      new Request('https://example.com/api/line/webhook', {
        method: 'POST',
        headers: { 'x-line-signature': 'invalid' },
        body: '{"events":[]}',
      }),
      {
        environment: 'PRODUCTION',
        secrets: { get: vi.fn().mockResolvedValue('messaging-secret') },
        processor: processor as never,
      },
    );
    expect(response.status).toBe(401);
    expect(processor.execute).not.toHaveBeenCalled();
  });

  it('acknowledges malformed JSON when its signature is valid to stop retries', async () => {
    const body = 'not-json';
    const secret = 'messaging-secret';
    const signature = createHmac('sha256', secret).update(body).digest('base64');
    const processor = { execute: vi.fn() };
    const response = await handleLineWebhook(
      new Request('https://example.com/api/line/webhook', {
        method: 'POST',
        headers: { 'x-line-signature': signature },
        body,
      }),
      {
        environment: 'PRODUCTION',
        secrets: { get: vi.fn().mockResolvedValue(secret) },
        processor: processor as never,
      },
    );
    expect(response.status).toBe(200);
    expect(processor.execute).not.toHaveBeenCalled();
  });
});
