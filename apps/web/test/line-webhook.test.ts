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

const {
  handleGroupLineWebhook,
  handleLineWebhook,
  parseLineWebhookEvents,
  verifyLineWebhookSignature,
} = await import('../src/line/webhook');

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

describe('group dedicated LINE webhook adapter', () => {
  const routingKey = '02f85ef5-83bd-45b0-943e-c2e134643f45';
  const scope = {
    workspaceId: 'workspace-1',
    groupId: 'group-1',
    configurationId: 'configuration-1',
    secret: 'dedicated-messaging-secret',
  };

  it('does not reveal whether a malformed routing key exists', async () => {
    const configurations = { get: vi.fn() };
    const response = await handleGroupLineWebhook(
      new Request('https://example.com/api/line/groups/not-a-key/webhook', {
        method: 'POST',
        body: '{"events":[]}',
      }),
      'not-a-key',
      { environment: 'PRODUCTION', configurations },
    );

    expect(response.status).toBe(404);
    expect(configurations.get).not.toHaveBeenCalled();
  });

  it('rejects a signature made with a different group secret', async () => {
    const body = '{"events":[]}';
    const signature = createHmac('sha256', 'another-group-secret').update(body).digest('base64');
    const processor = { execute: vi.fn() };
    const response = await handleGroupLineWebhook(
      new Request(`https://example.com/api/line/groups/${routingKey}/webhook`, {
        method: 'POST',
        headers: { 'x-line-signature': signature },
        body,
      }),
      routingKey,
      {
        environment: 'PRODUCTION',
        configurations: { get: vi.fn().mockResolvedValue(scope) },
        processor: processor as never,
      },
    );

    expect(response.status).toBe(401);
    expect(processor.execute).not.toHaveBeenCalled();
  });

  it('passes only the resolved group scope to the group processor', async () => {
    const body = JSON.stringify({
      events: [
        {
          type: 'follow',
          timestamp: 1787378400000,
          webhookEventId: 'evt-group-follow',
          source: { type: 'user', userId: 'UgroupMember' },
        },
      ],
    });
    const signature = createHmac('sha256', scope.secret).update(body).digest('base64');
    const processor = { execute: vi.fn().mockResolvedValue(undefined) };
    const configurations = { get: vi.fn().mockResolvedValue(scope) };
    const response = await handleGroupLineWebhook(
      new Request(`https://example.com/api/line/groups/${routingKey}/webhook`, {
        method: 'POST',
        headers: { 'x-line-signature': signature },
        body,
      }),
      routingKey,
      { environment: 'PRODUCTION', configurations, processor: processor as never },
    );

    expect(response.status).toBe(200);
    expect(configurations.get).toHaveBeenCalledWith(routingKey, 'PRODUCTION');
    expect(processor.execute).toHaveBeenCalledWith({
      environment: 'PRODUCTION',
      workspaceId: scope.workspaceId,
      groupId: scope.groupId,
      configurationId: scope.configurationId,
      events: [
        {
          providerEventId: 'evt-group-follow',
          providerUserId: 'UgroupMember',
          type: 'FOLLOW',
          occurredAt: new Date(1787378400000),
        },
      ],
    });
  });
});
