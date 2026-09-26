import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ preview: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('../src/auth/request-security', () => ({ requireSameOrigin: vi.fn() }));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () =>
    Promise.resolve({ getCurrentUser: () => Promise.resolve({ userId: 'manager-1' }) }),
}));
vi.mock('../src/services/public-service', () => ({
  resolveManagedServiceContext: () =>
    Promise.resolve({ workspaceId: '11111111-1111-4111-8111-111111111111', serviceId: 'group-1' }),
}));
vi.mock('@bunshin/database', () => ({
  PrismaServiceLineBroadcastAudienceRepository: class {
    preview = state.preview;
  },
}));

import { previewServiceLineBroadcastResponse } from '../src/http/service-line-broadcasts';

describe('service LINE broadcast segments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.preview.mockResolvedValue({ recipientCount: 1, capped: false });
  });

  it('previews only completed registrations matching both industry and purpose', async () => {
    const industryId = '22222222-2222-4222-8222-222222222222';
    const response = await previewServiceLineBroadcastResponse(
      new Request('https://bunshin.example/api/services/demo/line-broadcasts/preview', {
        method: 'POST',
        headers: { origin: 'https://bunshin.example', 'content-type': 'application/json' },
        body: JSON.stringify({ industryIds: [industryId], purposes: ['SALES'] }),
      }),
      'demo',
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { eligibleRecipientCount: 1, capped: false },
    });
    expect(state.preview).toHaveBeenCalledWith({
      workspaceId: '11111111-1111-4111-8111-111111111111',
      groupId: 'group-1',
      actorUserId: 'manager-1',
      segment: { industryIds: [industryId], purposes: ['SALES'] },
    });
  });
});
