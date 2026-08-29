import { beforeEach, describe, expect, it, vi } from 'vitest';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const groupId = '22222222-2222-4222-8222-222222222222';
const pilotId = '33333333-3333-4333-8333-333333333333';
const actorUserId = '44444444-4444-4444-8444-444444444444';
interface TestState {
  currentUser: { userId: string } | null;
  list: ReturnType<typeof vi.fn>;
  append: ReturnType<typeof vi.fn>;
}
const state = vi.hoisted<TestState>(() => ({
  currentUser: { userId: '44444444-4444-4444-8444-444444444444' },
  list: vi.fn(),
  append: vi.fn(),
}));

vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () =>
    Promise.resolve({ getCurrentUser: () => Promise.resolve(state.currentUser) }),
}));
vi.mock('@bunshin/database', () => ({
  PrismaSocialImagePilotEvidenceRepository: class {
    list = state.list;
    append = state.append;
  },
}));

import {
  listSocialImagePilotEvidenceResponse,
  recordSocialImagePilotEvidenceResponse,
} from '../src/http/social-image-pilot-evidence';

const record = {
  id: '55555555-5555-4555-8555-555555555555',
  workspaceId,
  groupId,
  pilotId,
  checkKey: 'MOBILE_E2E' as const,
  action: 'RECORDED' as const,
  reason: 'スマートフォンで画像の作成と保存を確認しました。',
  evidenceUrl: null,
  actorUserId,
  occurredAt: new Date('2026-08-30T09:00:00.000Z'),
};

function request(path: string, body?: unknown) {
  return new Request(
    `http://localhost:3000${path}`,
    body === undefined
      ? undefined
      : {
          method: 'POST',
          headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
}

describe('social image pilot evidence HTTP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('APP_URL', 'http://localhost:3000');
    vi.stubEnv('DATABASE_URL', 'postgresql://local');
    vi.stubEnv('DIRECT_URL', 'postgresql://local');
    vi.stubEnv('SESSION_SECRET', '12345678901234567890123456789012');
    state.currentUser = { userId: actorUserId };
    state.list.mockResolvedValue([record]);
    state.append.mockResolvedValue(record);
  });

  it('未認証では確認履歴を返さない', async () => {
    state.currentUser = null;
    const response = await listSocialImagePilotEvidenceResponse(
      request(
        `/api/admin/image-pilot-evidence?workspaceId=${workspaceId}&groupId=${groupId}&pilotId=${pilotId}`,
      ),
    );
    expect(response.status).toBe(401);
  });

  it('グループと試験設定版を指定して確認履歴を返す', async () => {
    const response = await listSocialImagePilotEvidenceResponse(
      request(
        `/api/admin/image-pilot-evidence?workspaceId=${workspaceId}&groupId=${groupId}&pilotId=${pilotId}`,
      ),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(state.list).toHaveBeenCalledWith({ workspaceId, groupId, pilotId, actorUserId });
  });

  it('確認内容を同一スコープへ追記する', async () => {
    const response = await recordSocialImagePilotEvidenceResponse(
      request('/api/admin/image-pilot-evidence', {
        workspaceId,
        groupId,
        pilotId,
        checkKey: 'MOBILE_E2E',
        action: 'RECORDED',
        reason: record.reason,
        evidenceUrl: '',
      }),
    );
    expect(response.status).toBe(201);
    expect(state.append).toHaveBeenCalledWith({
      workspaceId,
      groupId,
      pilotId,
      checkKey: 'MOBILE_E2E',
      action: 'RECORDED',
      reason: record.reason,
      evidenceUrl: null,
      actorUserId,
    });
  });

  it('不正なスコープを拒否する', async () => {
    const response = await recordSocialImagePilotEvidenceResponse(
      request('/api/admin/image-pilot-evidence', {
        workspaceId,
        groupId: 'other-group',
        pilotId,
        checkKey: 'MOBILE_E2E',
        action: 'RECORDED',
        reason: record.reason,
      }),
    );
    expect(response.status).toBe(400);
    expect(state.append).not.toHaveBeenCalled();
  });
});
