import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));

const state = vi.hoisted(
  (): {
    user: { userId: string } | null;
    create: ReturnType<typeof vi.fn>;
    platformAdmin: ReturnType<typeof vi.fn>;
    findService: ReturnType<typeof vi.fn>;
    updateService: ReturnType<typeof vi.fn>;
    updateGroup: ReturnType<typeof vi.fn>;
    upsertCommercialSetting: ReturnType<typeof vi.fn>;
    createAudit: ReturnType<typeof vi.fn>;
    organizationEntitlement: ReturnType<typeof vi.fn>;
    upsertCustomDomain: ReturnType<typeof vi.fn>;
  } => ({
    user: { userId: 'admin-1' },
    create: vi.fn(),
    platformAdmin: vi.fn(),
    findService: vi.fn(),
    updateService: vi.fn(),
    updateGroup: vi.fn(),
    upsertCommercialSetting: vi.fn(),
    createAudit: vi.fn(),
    organizationEntitlement: vi.fn(),
    upsertCustomDomain: vi.fn(),
  }),
);

vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: () => Promise.resolve(state.user) }),
}));
vi.mock('@bunshin/database', () => ({
  PrismaServiceFoundationRepository: class {
    create = state.create;
  },
  prisma: {
    $transaction: (callback: (tx: unknown) => unknown) =>
      callback({
        platformAdmin: { findFirst: state.platformAdmin },
        serviceConfiguration: {
          findUnique: state.findService,
          update: state.updateService,
        },
        serviceCommercialSetting: { upsert: state.upsertCommercialSetting },
        organizationEntitlement: { findUnique: state.organizationEntitlement },
        serviceCustomDomain: { upsert: state.upsertCustomDomain },
        group: { update: state.updateGroup },
        serviceConfigurationAudit: { create: state.createAudit },
      }),
  },
}));

import {
  createServiceResponse,
  updateServiceCommercialSettingsResponse,
  updateServiceCustomDomainResponse,
  updateServiceLifecycleResponse,
} from '../src/http/services';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const configurationId = '22222222-2222-4222-8222-222222222222';
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
    state.platformAdmin.mockResolvedValue({ id: 'platform-admin-1' });
    state.findService.mockResolvedValue({
      id: configurationId,
      workspaceId,
      groupId: 'group-1',
      visibility: 'PRIVATE',
      poweredByEnabled: true,
      startsAt: null,
      endsAt: null,
      group: { status: 'ACTIVE' },
      commercialSetting: null,
    });
    state.updateService.mockResolvedValue({
      visibility: 'PUBLIC',
      poweredByEnabled: true,
      startsAt: null,
      endsAt: null,
    });
    state.updateGroup.mockResolvedValue({ status: 'ACTIVE' });
    state.upsertCommercialSetting.mockResolvedValue({
      planName: '法人プラン',
      billingMode: 'MANUAL_INVOICE',
      status: 'ACTIVE',
      monthlyPriceYen: 10000,
      includedMemberLimit: 30,
      monthlyAiGenerationLimit: 100,
      monthlyImageGenerationLimit: 30,
      monthlyVideoGenerationLimit: 10,
      startsAt: null,
      endsAt: null,
    });
    state.createAudit.mockResolvedValue({ id: 'audit-1' });
    state.organizationEntitlement.mockResolvedValue(null);
    state.upsertCustomDomain.mockResolvedValue({
      hostname: 'service.example.com',
      status: 'DRAFT',
      verificationNote: null,
      verifiedAt: null,
      activatedAt: null,
    });
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

  it('stores the recommended onboarding copy and questions from the selected template', async () => {
    const response = await createServiceResponse(
      request({ ...body, templateKey: 'SIDE_HUSTLE_AFFILIATE' }),
    );
    expect(response.status).toBe(201);
    expect(state.create).toHaveBeenCalledWith(
      expect.objectContaining({
        configuration: expect.objectContaining({
          registration: expect.objectContaining({
            onboardingConfig: expect.objectContaining({
              templateKey: 'SIDE_HUSTLE_AFFILIATE',
              welcomeTitle: expect.any(String),
              welcomeMessage: expect.any(String),
            }),
            surveyConfig: { questions: expect.arrayContaining(['どのSNSで発信したいですか？']) },
          }),
        }),
      }),
    );
  });

  it('keeps onboarding empty for a custom service', async () => {
    const response = await createServiceResponse(request({ ...body, templateKey: 'CUSTOM' }));
    expect(response.status).toBe(201);
    expect(state.create).toHaveBeenCalledWith(
      expect.objectContaining({
        configuration: expect.objectContaining({
          registration: expect.objectContaining({
            onboardingConfig: {
              templateKey: 'CUSTOM',
              welcomeTitle: '',
              welcomeMessage: '',
            },
            surveyConfig: { questions: [] },
          }),
        }),
      }),
    );
  });

  it('rejects a malformed slug before persistence', async () => {
    expect((await createServiceResponse(request({ ...body, slug: 'Bad Slug' }))).status).toBe(400);
    expect(state.create).not.toHaveBeenCalled();
  });

  it('updates platform-owned lifecycle settings and records the reason', async () => {
    const response = await updateServiceLifecycleResponse(
      new Request(`http://localhost:3000/api/admin/services/${configurationId}`, {
        method: 'PATCH',
        headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
        body: JSON.stringify({
          visibility: 'PUBLIC',
          status: 'ACTIVE',
          poweredByEnabled: true,
          startsAt: null,
          endsAt: null,
          reason: '公開準備が完了したため',
        }),
      }),
      configurationId,
    );
    expect(response.status).toBe(200);
    expect(state.updateService).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: configurationId } }),
    );
    expect(state.createAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reason: '公開準備が完了したため' }),
      }),
    );
  });

  it('rejects lifecycle changes from users who are not platform super administrators', async () => {
    state.platformAdmin.mockResolvedValue(null);
    const response = await updateServiceLifecycleResponse(
      new Request(`http://localhost:3000/api/admin/services/${configurationId}`, {
        method: 'PATCH',
        headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
        body: JSON.stringify({
          visibility: 'PRIVATE',
          status: 'SUSPENDED',
          poweredByEnabled: false,
          startsAt: null,
          endsAt: null,
          reason: '運用を一時停止するため',
        }),
      }),
      configurationId,
    );
    expect(response.status).toBe(403);
    expect(state.updateService).not.toHaveBeenCalled();
  });

  it('rejects hiding the platform brand when OEM is not included in the contract', async () => {
    state.organizationEntitlement.mockResolvedValue({ oemEnabled: false, suspended: false });
    const response = await updateServiceLifecycleResponse(
      new Request(`http://localhost:3000/api/admin/services/${configurationId}`, {
        method: 'PATCH',
        headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
        body: JSON.stringify({
          visibility: 'PRIVATE',
          status: 'ACTIVE',
          poweredByEnabled: false,
          startsAt: null,
          endsAt: null,
          reason: 'OEM表示へ切り替えるため',
        }),
      }),
      configurationId,
    );
    expect(response.status).toBe(403);
    expect(state.updateService).not.toHaveBeenCalled();
  });

  it('stores a provider-independent commercial plan and audit reason', async () => {
    const response = await updateServiceCommercialSettingsResponse(
      new Request(
        `http://localhost:3000/api/admin/services/${configurationId}/commercial-settings`,
        {
          method: 'PUT',
          headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
          body: JSON.stringify({
            planName: '法人プラン',
            billingMode: 'MANUAL_INVOICE',
            status: 'ACTIVE',
            monthlyPriceYen: 10000,
            includedMemberLimit: 30,
            monthlyAiGenerationLimit: 100,
            monthlyImageGenerationLimit: 30,
            monthlyVideoGenerationLimit: 10,
            startsAt: null,
            endsAt: null,
            reason: 'テストサービスの契約条件を登録',
          }),
        },
      ),
      configurationId,
    );
    expect(response.status).toBe(200);
    expect(state.upsertCommercialSetting).toHaveBeenCalledWith(
      expect.objectContaining({ where: { groupId: 'group-1' } }),
    );
    expect(state.createAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'COMMERCIAL_SETTINGS_UPDATED' }),
      }),
    );
  });

  it('rejects a custom domain when it is not included in the organization contract', async () => {
    state.findService.mockResolvedValue({
      id: configurationId,
      workspaceId,
      groupId: 'group-1',
      customDomain: null,
    });
    state.organizationEntitlement.mockResolvedValue({
      customDomainEnabled: false,
      suspended: false,
    });
    const response = await updateServiceCustomDomainResponse(
      new Request(`http://localhost:3000/api/admin/services/${configurationId}/custom-domain`, {
        method: 'PUT',
        headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
        body: JSON.stringify({
          hostname: 'service.example.com',
          status: 'DRAFT',
          verificationNote: '',
          reason: '独自ドメインを設定するため',
        }),
      }),
      configurationId,
    );
    expect(response.status).toBe(403);
    expect(state.upsertCustomDomain).not.toHaveBeenCalled();
  });
});
