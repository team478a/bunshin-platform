import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));

const state = vi.hoisted(() => ({
  user: { userId: 'admin-1' } as { userId: string } | null,
  create: vi.fn(),
}));

vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: () => Promise.resolve(state.user) }),
}));
vi.mock('@bunshin/database', () => ({
  PrismaServiceFoundationRepository: class {
    create = state.create;
  },
}));

import { createServiceResponse } from '../src/http/services';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const body = {
  workspaceId,
  slug: 'side-job-support',
  displayName: '投稿副業サポート',
  description: 'SNS初心者向けの投稿支援',
  operatorName: 'ワタシワークス運営事務局',
  contactEmail: '',
  visibility: 'PRIVATE',
  poweredByEnabled: true,
  termsUrl: '',
  privacyUrl: '',
  logoUrl: '',
  iconUrl: '',
  faviconUrl: '',
  primaryColor: '#0b356a',
  secondaryColor: '#ff3b30',
  fontFamily: 'system-ui',
  registrationMode: 'INVITATION_ONLY',
  emailEnabled: true,
  lineEnabled: false,
  inviteCodeEnabled: false,
  referralEnabled: false,
  reason: '第一号サービスを準備する',
};

const request = (value: unknown = body, origin = 'http://localhost:3000') =>
  new Request('http://localhost:3000/api/admin/services', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(value),
  });

describe('service admin HTTP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('APP_URL', 'http://localhost:3000');
    vi.stubEnv('DATABASE_URL', 'postgresql://local');
    vi.stubEnv('DIRECT_URL', 'postgresql://local');
    vi.stubEnv('SESSION_SECRET', '12345678901234567890123456789012');
    state.user = { userId: 'admin-1' };
    state.create.mockResolvedValue({ id: 'service-1', groupId: 'group-1', ...body });
  });

  it('requires authentication and same-origin mutation', async () => {
    state.user = null;
    expect((await createServiceResponse(request())).status).toBe(401);
    state.user = { userId: 'admin-1' };
    expect((await createServiceResponse(request(body, 'https://evil.example'))).status).toBe(403);
    expect(state.create).not.toHaveBeenCalled();
  });

  it('creates a private service without exposing a second service ID from the client', async () => {
    const response = await createServiceResponse(request());
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(state.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        actorUserId: 'admin-1',
        reason: body.reason,
        configuration: expect.objectContaining({
          slug: body.slug,
          visibility: 'PRIVATE',
          contactEmail: null,
          registration: expect.objectContaining({ mode: 'INVITATION_ONLY' }),
        }),
      }),
    );
  });

  it('rejects a malformed slug before persistence', async () => {
    expect((await createServiceResponse(request({ ...body, slug: 'Bad Slug' }))).status).toBe(400);
    expect(state.create).not.toHaveBeenCalled();
  });
});
