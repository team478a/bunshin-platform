import { beforeEach, describe, expect, it, vi } from 'vitest';

const deliveryId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
interface TestState {
  user: { userId: string } | null;
  request: ReturnType<typeof vi.fn>;
}
const state = vi.hoisted<TestState>(() => ({
  user: { userId: 'admin-a' },
  request: vi.fn(),
}));

vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({ APP_ENV: 'staging', APP_URL: 'https://staging.example.com' }),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: () => Promise.resolve(state.user) }),
}));
vi.mock('@bunshin/database', () => ({
  PrismaLineDeliveryRetryRepository: class {
    request = state.request;
  },
}));

const { retryLineDeliveryResponse } = await import('../src/http/line-delivery-retries');

function request(body: unknown, origin = 'https://staging.example.com') {
  return new Request(`https://staging.example.com/api/admin/line-deliveries/${deliveryId}/retry`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const context = { params: Promise.resolve({ deliveryId }) };

describe('LINE delivery admin retry API', () => {
  beforeEach(() => {
    state.user = { userId: 'admin-a' };
    state.request.mockReset().mockResolvedValue({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      environment: 'STAGING',
      deliveryId,
      deliveryAttemptCount: 2,
      reason: '監査理由',
      jobId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      createdAt: new Date('2026-08-22T00:00:00Z'),
    });
  });

  it('同一originの理由付き操作だけを現在環境へ登録し秘密・操作者を返さない', async () => {
    const response = await retryLineDeliveryResponse(
      request({ reason: '復旧を確認したため' }),
      context,
    );
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(state.request).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'admin-a',
        environment: 'STAGING',
        deliveryId,
        reason: '復旧を確認したため',
      }),
    );
    expect(JSON.stringify(body)).not.toContain('admin-a');
    expect(JSON.stringify(body)).not.toContain('復旧を確認したため');
  });

  it('cross-originと不正bodyを拒否する', async () => {
    expect(
      (
        await retryLineDeliveryResponse(
          request({ reason: 'valid reason' }, 'https://evil.example'),
          context,
        )
      ).status,
    ).toBe(403);
    expect((await retryLineDeliveryResponse(request({ reason: 'x' }), context)).status).toBe(400);
    expect(state.request).not.toHaveBeenCalled();
  });

  it('未認証では登録しない', async () => {
    state.user = null;
    const response = await retryLineDeliveryResponse(request({ reason: 'valid reason' }), context);
    expect(response.status).toBe(401);
    expect(state.request).not.toHaveBeenCalled();
  });
});
