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
    accessToken: 'dedicated-access-token',
    serviceSlug: 'sample-service',
    serviceName: 'サンプルサービス',
    registrationMode: 'INVITATION_ONLY',
    registrationLineEnabled: true,
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

  it('persists every text and image event as one inbox batch before acknowledging', async () => {
    const body = JSON.stringify({
      events: [
        {
          type: 'message',
          timestamp: 1787378400000,
          webhookEventId: 'evt-text',
          source: { type: 'user', userId: 'ULearner' },
          message: { type: 'text', id: 'message-text', text: '今日の練習を相談したい' },
        },
        {
          type: 'message',
          timestamp: 1787378400001,
          webhookEventId: 'evt-image',
          source: { type: 'user', userId: 'ULearner' },
          message: { type: 'image', id: 'line-image-id' },
        },
        {
          type: 'message',
          timestamp: 1787378400002,
          webhookEventId: 'evt-no-source',
          message: { type: 'text', id: 'message-no-source', text: '参加者不明の受信記録' },
        },
      ],
    });
    const signature = createHmac('sha256', scope.secret).update(body).digest('base64');
    let persisted = false;
    const learningInbox = {
      persist: vi.fn((input: unknown) => {
        expect(persisted).toBe(false);
        expect(input).toMatchObject({
          configurationId: scope.configurationId,
          events: [
            {
              providerEventId: 'evt-text',
              message: { type: 'TEXT', text: '今日の練習を相談したい' },
            },
            {
              providerEventId: 'evt-image',
              message: { type: 'IMAGE', lineMessageId: 'line-image-id' },
            },
            {
              providerEventId: 'evt-no-source',
              providerUserId: null,
              message: { type: 'TEXT', text: '参加者不明の受信記録' },
            },
          ],
        });
        persisted = true;
        return Promise.resolve();
      }),
    };
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
        learningInbox,
        processor: { execute: vi.fn() } as never,
      },
    );

    expect(response.status).toBe(200);
    expect(persisted).toBe(true);
    expect(learningInbox.persist).toHaveBeenCalledTimes(1);
  });

  it('returns 500 and does not acknowledge when inbox persistence fails', async () => {
    const body = JSON.stringify({
      events: [
        {
          type: 'message',
          timestamp: 1787378400000,
          webhookEventId: 'evt-failed-save',
          source: { type: 'user', userId: 'ULearner' },
          message: { type: 'text', id: 'message-text', text: '相談です' },
        },
      ],
    });
    const signature = createHmac('sha256', scope.secret).update(body).digest('base64');
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
        learningInbox: { persist: vi.fn().mockRejectedValue(new Error('database unavailable')) },
        processor: { execute: vi.fn() } as never,
      },
    );

    expect(response.status).toBe(500);
  });

  it('replies with the service participation button only for a newly applied follow event', async () => {
    const body = JSON.stringify({
      events: [
        {
          type: 'follow',
          timestamp: 1787378400000,
          webhookEventId: 'evt-new-follow',
          replyToken: 'reply-token',
          source: { type: 'user', userId: 'UnewFollower' },
        },
      ],
    });
    const signature = createHmac('sha256', scope.secret).update(body).digest('base64');
    const processor = {
      execute: vi.fn().mockResolvedValue({ outcomes: { APPLIED: 1 } }),
    };
    const followReply = { send: vi.fn().mockResolvedValue(true) };

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
        followReply,
      },
    );

    expect(response.status).toBe(200);
    expect(followReply.send).toHaveBeenCalledWith({
      accessToken: scope.accessToken,
      replyToken: 'reply-token',
      serviceName: scope.serviceName,
      participationUrl: 'https://example.com/s/sample-service',
    });
  });

  it('creates an individual one-use invitation for a new follower of an invitation-only service', async () => {
    const body = JSON.stringify({
      events: [
        {
          type: 'follow',
          timestamp: 1787378400000,
          webhookEventId: 'evt-invite-follow',
          replyToken: 'reply-token',
          source: { type: 'user', userId: 'UnewFollower' },
        },
      ],
    });
    const signature = createHmac('sha256', scope.secret).update(body).digest('base64');
    const processor = {
      execute: vi.fn().mockResolvedValue({ outcomes: { CONNECTION_NOT_FOUND: 1 } }),
    };
    const followInvitations = { create: vi.fn().mockResolvedValue(true) };
    const followReply = { send: vi.fn().mockResolvedValue(true) };

    await handleGroupLineWebhook(
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
        followInvitations,
        followReply,
      },
    );

    expect(followInvitations.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        sourceEventId: 'evt-invite-follow',
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        expiresAt: expect.any(Date),
      }),
    );
    const sent = followReply.send.mock.calls[0]?.[0];
    expect(sent?.participationUrl).toMatch(
      /^https:\/\/example\.com\/s\/sample-service\/join\/[A-Za-z0-9_-]{43}$/,
    );
  });

  it('also sends a one-use invitation when invite-only registration requires manual approval', async () => {
    const body = JSON.stringify({
      events: [
        {
          type: 'follow',
          timestamp: 1787378400000,
          webhookEventId: 'evt-manual-invite-follow',
          replyToken: 'reply-token',
          source: { type: 'user', userId: 'UmanualInviteFollower' },
        },
      ],
    });
    const signature = createHmac('sha256', scope.secret).update(body).digest('base64');
    const followInvitations = { create: vi.fn().mockResolvedValue(true) };
    const followReply = { send: vi.fn().mockResolvedValue(true) };

    const response = await handleGroupLineWebhook(
      new Request(`https://example.com/api/line/groups/${routingKey}/webhook`, {
        method: 'POST',
        headers: { 'x-line-signature': signature },
        body,
      }),
      routingKey,
      {
        environment: 'PRODUCTION',
        configurations: {
          get: vi.fn().mockResolvedValue({
            ...scope,
            registrationMode: 'INVITATION_APPROVAL_REQUIRED',
          }),
        },
        processor: {
          execute: vi.fn().mockResolvedValue({ outcomes: { CONNECTION_NOT_FOUND: 1 } }),
        } as never,
        followInvitations,
        followReply,
      },
    );

    expect(response.status).toBe(200);
    expect(followInvitations.create).toHaveBeenCalledOnce();
    expect(followReply.send).toHaveBeenCalledWith(
      expect.objectContaining({ participationUrl: expect.stringContaining('/join/') }),
    );
  });

  it('does not send an invitation when the invitation record cannot be created', async () => {
    const body = JSON.stringify({
      events: [
        {
          type: 'follow',
          timestamp: 1787378400000,
          webhookEventId: 'evt-failed-invite',
          replyToken: 'reply-token',
        },
      ],
    });
    const signature = createHmac('sha256', scope.secret).update(body).digest('base64');
    const followReply = { send: vi.fn().mockResolvedValue(true) };

    await handleGroupLineWebhook(
      new Request(`https://example.com/api/line/groups/${routingKey}/webhook`, {
        method: 'POST',
        headers: { 'x-line-signature': signature },
        body,
      }),
      routingKey,
      {
        environment: 'PRODUCTION',
        configurations: { get: vi.fn().mockResolvedValue(scope) },
        processor: {
          execute: vi.fn().mockResolvedValue({ outcomes: { CONNECTION_NOT_FOUND: 1 } }),
        } as never,
        followInvitations: { create: vi.fn().mockResolvedValue(false) },
        followReply,
      },
    );
    expect(followReply.send).not.toHaveBeenCalled();
  });

  it('does not mint invitation links when LINE registration is disabled for the service', async () => {
    const body = JSON.stringify({
      events: [
        {
          type: 'follow',
          timestamp: 1787378400000,
          webhookEventId: 'evt-line-disabled',
          replyToken: 'reply-token',
        },
      ],
    });
    const signature = createHmac('sha256', scope.secret).update(body).digest('base64');
    const followInvitations = { create: vi.fn().mockResolvedValue(true) };
    const followReply = { send: vi.fn().mockResolvedValue(true) };

    await handleGroupLineWebhook(
      new Request(`https://example.com/api/line/groups/${routingKey}/webhook`, {
        method: 'POST',
        headers: { 'x-line-signature': signature },
        body,
      }),
      routingKey,
      {
        environment: 'PRODUCTION',
        configurations: {
          get: vi.fn().mockResolvedValue({ ...scope, registrationLineEnabled: false }),
        },
        processor: {
          execute: vi.fn().mockResolvedValue({ outcomes: { CONNECTION_NOT_FOUND: 1 } }),
        } as never,
        followInvitations,
        followReply,
      },
    );

    expect(followInvitations.create).not.toHaveBeenCalled();
    expect(followReply.send).toHaveBeenCalledWith(
      expect.objectContaining({ participationUrl: 'https://example.com/s/sample-service' }),
    );
  });

  it('does not reply again when LINE retries an already processed follow event', async () => {
    const body = JSON.stringify({
      events: [
        {
          type: 'follow',
          timestamp: 1787378400000,
          webhookEventId: 'evt-duplicate-follow',
          replyToken: 'retry-reply-token',
          source: { type: 'user', userId: 'UnewFollower' },
        },
      ],
    });
    const signature = createHmac('sha256', scope.secret).update(body).digest('base64');
    const followReply = { send: vi.fn().mockResolvedValue(true) };
    const followInvitations = { create: vi.fn().mockResolvedValue(true) };

    await handleGroupLineWebhook(
      new Request(`https://example.com/api/line/groups/${routingKey}/webhook`, {
        method: 'POST',
        headers: { 'x-line-signature': signature },
        body,
      }),
      routingKey,
      {
        environment: 'PRODUCTION',
        configurations: { get: vi.fn().mockResolvedValue(scope) },
        processor: {
          execute: vi.fn().mockResolvedValue({ outcomes: { APPLIED: 0, DUPLICATE: 1 } }),
        } as never,
        followReply,
        followInvitations,
      },
    );

    expect(followReply.send).not.toHaveBeenCalled();
    expect(followInvitations.create).not.toHaveBeenCalled();
  });

  it('replies to a follow event before the user has completed participation registration', async () => {
    const body = JSON.stringify({
      events: [
        {
          type: 'follow',
          timestamp: 1787378400000,
          webhookEventId: 'evt-unregistered-follow',
          replyToken: 'unregistered-reply-token',
          source: { type: 'user', userId: 'UunregisteredFollower' },
        },
      ],
    });
    const signature = createHmac('sha256', scope.secret).update(body).digest('base64');
    const followReply = { send: vi.fn().mockResolvedValue(true) };
    const followInvitations = { create: vi.fn().mockResolvedValue(true) };

    await handleGroupLineWebhook(
      new Request(`https://example.com/api/line/groups/${routingKey}/webhook`, {
        method: 'POST',
        headers: { 'x-line-signature': signature },
        body,
      }),
      routingKey,
      {
        environment: 'PRODUCTION',
        configurations: { get: vi.fn().mockResolvedValue(scope) },
        processor: {
          execute: vi.fn().mockResolvedValue({
            outcomes: { APPLIED: 0, CONNECTION_NOT_FOUND: 1 },
          }),
        } as never,
        followReply,
        followInvitations,
      },
    );

    expect(followReply.send).toHaveBeenCalledWith({
      accessToken: scope.accessToken,
      replyToken: 'unregistered-reply-token',
      serviceName: scope.serviceName,
      participationUrl: expect.stringMatching(
        /^https:\/\/example\.com\/s\/sample-service\/join\/[A-Za-z0-9_-]{43}$/,
      ),
    });
  });
});
