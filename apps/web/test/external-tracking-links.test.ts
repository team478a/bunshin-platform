import { beforeEach, describe, expect, it, vi } from 'vitest';

const id = '11111111-1111-4111-8111-111111111111';
const state = vi.hoisted(() => ({
  currentUser: null as { userId: string } | null,
  createLink: vi.fn(),
  listConfiguration: vi.fn(),
  upsertIdentity: vi.fn(),
  upsertPlacement: vi.fn(),
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
    upsertMemberIdentity = state.upsertIdentity;
    createLink = state.createLink;
    activateLink = vi.fn();
    suspendLink = vi.fn();
    updateLink = vi.fn();
    listResolutionCandidates = vi.fn();
  },
  PrismaExternalLinkPlacementRepository: class {
    list = vi.fn();
    upsert = state.upsertPlacement;
    resolveForGeneration = vi.fn();
  },
}));

import {
  createExternalTrackingLinkResponse,
  exportExternalTrackingResponse,
  importExternalTrackingCsvResponse,
  listExternalTrackingConfigurationResponse,
  upsertExternalLinkPlacementResponse,
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
    state.upsertIdentity.mockResolvedValue({ id });
    state.upsertPlacement.mockResolvedValue({ id });
  });

  it('未認証では設定一覧を返さない', async () => {
    state.currentUser = null;
    const response = await listExternalTrackingConfigurationResponse(
      request(`/api/workspaces/${id}/external-tracking?groupId=${id}`),
      id,
    );
    expect(response.status).toBe(401);
  });

  it('認可済みのURL一覧をUTF-8 CSVで出力する', async () => {
    state.listConfiguration.mockResolvedValue({
      links: [
        {
          name: '参加者URL',
          effectiveStatus: 'ACTIVE',
          scopeType: 'MEMBER',
          url: 'https://example.jp/product?ref=member-a',
          startsAt: null,
          expiresAt: null,
          updatedAt: new Date('2026-08-26T00:00:00Z'),
        },
      ],
      usages: [],
    });
    const response = await exportExternalTrackingResponse(
      request(`/api/workspaces/${id}/external-tracking/export?groupId=${id}&kind=links`),
      id,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const body = new TextDecoder().decode(bytes);
    expect(body).toContain('参加者URL');
    expect(body).toContain('https://example.jp/product?ref=member-a');
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

  it('安全な差し込み設定だけを保存する', async () => {
    const response = await upsertExternalLinkPlacementResponse(
      request(`/api/workspaces/${id}/external-tracking/placements`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          productPackVersionId: id,
          platform: 'X',
          format: 'TEXT',
          target: 'BODY',
          template: '詳しくはこちら\n{{referral_url}}',
        }),
      }),
      id,
    );
    expect(response.status).toBe(200);
    expect(state.upsertPlacement).toHaveBeenCalledWith(
      expect.objectContaining({ urlLocked: true, status: 'ACTIVE' }),
    );
  });

  it('未知の変数を含む差し込み設定を保存しない', async () => {
    const response = await upsertExternalLinkPlacementResponse(
      request(`/api/workspaces/${id}/external-tracking/placements`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          productPackVersionId: id,
          platform: 'X',
          format: 'TEXT',
          target: 'BODY',
          template: '{{secret}}',
        }),
      }),
      id,
    );
    expect(response.status).toBe(400);
    expect(state.upsertPlacement).not.toHaveBeenCalled();
  });

  it('CSVの正常行だけを登録し、不正行は理由を返す', async () => {
    state.listConfiguration.mockResolvedValue({
      systems: [
        {
          id,
          status: 'ACTIVE',
          allowedDomains: [
            {
              id,
              hostname: 'example.jp',
              allowSubdomains: false,
              shortener: false,
              status: 'ACTIVE',
            },
          ],
        },
      ],
      members: [],
      products: [],
      campaigns: [],
      links: [],
    });
    const form = new FormData();
    form.set('groupId', id);
    form.set('systemId', id);
    form.set('allowedDomainId', id);
    form.set(
      'file',
      new File(
        ['url,url_name\nhttps://example.jp/good,正常\nhttps://evil.example/bad,不正'],
        'links.csv',
        { type: 'text/csv' },
      ),
    );
    const response = await importExternalTrackingCsvResponse(
      request(`/api/workspaces/${id}/external-tracking/import`, { method: 'POST', body: form }),
      id,
    );
    expect(response.status).toBe(200);
    expect(state.createLink).toHaveBeenCalledTimes(1);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({ total: 2, imported: 1, failed: 1 }),
      }),
    );
  });
});
