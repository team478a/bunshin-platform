import { beforeEach, describe, expect, it, vi } from 'vitest';

const deliveryId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const serviceId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
interface TestState {
  user: { userId: string } | null;
  request: ReturnType<typeof vi.fn>;
}
const state = vi.hoisted<TestState>(() => ({
  user: { userId: 'service-admin-a' },
  request: vi.fn(),
}));

vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({ APP_ENV: 'staging', APP_URL: 'https://staging.example.com' }),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: () => Promise.resolve(state.user) }),
}));
vi.mock('../src/services/public-service', () => ({
  resolveManagedServiceContext: () => Promise.resolve({ serviceId }),
}));
vi.mock('@bunshin/database', () => ({
  PrismaLineDeliveryRetryRepository: class {
    request = state.request;
  },
}));

const { retryServiceLineDeliveryResponse } =
  await import('../src/http/service-line-delivery-retries');

function request(body: unknown, origin = 'https://staging.example.com') {
  return new Request(
    `https://staging.example.com/api/services/test-service/line-deliveries/${deliveryId}/retry`,
    {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}
const context = { params: Promise.resolve({ serviceSlug: 'test-service', deliveryId }) };

describe('service LINE delivery retry API', () => {
  beforeEach(() => {
    state.user = { userId: 'service-admin-a' };
    state.request.mockReset().mockResolvedValue({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      environment: 'STAGING',
      deliveryId,
      deliveryAttemptCount: 2,
      reason: '接続状態を確認したため',
      jobId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      createdAt: new Date('2026-09-01T00:00:00Z'),
    });
  });

  it('サービス管理者の再送は自サービスのIDを必ず渡し、理由や操作者を返さない', async () => {
    const response = await retryServiceLineDeliveryResponse(
      request({ reason: '接続状態を確認したため' }),
      context,
    );
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(state.request).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'service-admin-a',
        environment: 'STAGING',
        deliveryId,
        groupId: serviceId,
      }),
    );
    expect(JSON.stringify(body)).not.toContain('service-admin-a');
    expect(JSON.stringify(body)).not.toContain('接続状態を確認したため');
  });

  it('cross-originと不正な理由を拒否する', async () => {
    expect(
      (
        await retryServiceLineDeliveryResponse(
          request({ reason: 'valid reason' }, 'https://evil.example'),
          context,
        )
      ).status,
    ).toBe(403);
    expect((await retryServiceLineDeliveryResponse(request({ reason: 'x' }), context)).status).toBe(
      400,
    );
    expect(state.request).not.toHaveBeenCalled();
  });
});
