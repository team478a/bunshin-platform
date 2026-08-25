import { beforeEach, describe, expect, it, vi } from 'vitest';

const id = '11111111-1111-4111-8111-111111111111';
const state = vi.hoisted(() => ({
  currentUser: null as { userId: string } | null,
  createLink: vi.fn(),
  listConfiguration: vi.fn(),
}));

vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () =>
    Promise.resolve({ getCurrentUser: () => Promise.resolve(state.currentUser) }),
}));

vi.mock('@bunshin/database', () => ({
  PrismaExternalTrackingLinkRepository: class {
    listConfiguration = state.listConfiguration;
    getAllowedDomain = vi.fn(() =>
      Promise.resolve({
        id,
        hostname: 'example.jp',
        allowSubdomains: false,
        shortener: false,
        status: 'ACTIVE',
      }),
    );
    createSystem = vi.fn();
    addAllowedDomain = vi.fn();
    upsertMemberIdentity = vi.fn();
    createLink = state.createLink;
    activateLink = vi.fn();
    suspendLink = vi.fn();
    updateLink = vi.fn();
    listResolutionCandidates = vi.fn();
  },
}));

import {
  createExternalTrackingLinkResponse,
  listExternalTrackingConfigurationResponse,
} from '../src/http/external-tracking-links';

function request(path: string, init?: RequestInit) {
  return new Request(`http://localhost:3000${path}`, {
    ...init,
    headers: { origin: 'http://localhost:3000', ...init?.headers },
  });
}

describe('external tracking admin HTTP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('APP_URL', 'http://localhost:3000');
    vi.stubEnv('DATABASE_URL', 'postgresql://local');
    vi.stubEnv('DIRECT_URL', 'postgresql://local');
    vi.stubEnv('SESSION_SECRET', '12345678901234567890123456789012');
    vi.stubEnv('LOG_LEVEL', 'info');
    state.currentUser = { userId: id };
    state.listConfiguration.mockResolvedValue({ links: [], audits: [] });
    state.createLink.mockResolvedValue({ id });
  });

  it('未認証では設定一覧を返さない', async () => {
    state.currentUser = null;
    const response = await listExternalTrackingConfigurationResponse(
      request(`/api/workspaces/${id}/external-tracking?groupId=${id}`),
      id,
    );
    expect(response.status).toBe(401);
  });

  it('許可domain外URLを保存しない', async () => {
    const response = await createExternalTrackingLinkResponse(
      request(`/api/workspaces/${id}/external-tracking/links`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemId: id,
          allowedDomainId: id,
          scopeType: 'GROUP',
          name: '不正',
          url: 'https://evil.example/path',
        }),
      }),
      id,
    );
    expect(response.status).toBe(400);
    expect(state.createLink).not.toHaveBeenCalled();
  });

  it('異なるOriginからの変更を拒否する', async () => {
    const response = await createExternalTrackingLinkResponse(
      new Request(`http://localhost:3000/api/workspaces/${id}/external-tracking/links`, {
        method: 'POST',
        headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
        body: '{}',
      }),
      id,
    );
    expect(response.status).toBe(403);
  });
});
