import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';

const m = vi.hoisted(() => ({
  actor: vi.fn(),
  member: vi.fn(),
  public: vi.fn(),
  membership: vi.fn(),
  onboarding: vi.fn(),
  business: vi.fn(),
  industry: vi.fn(),
  reward: vi.fn(),
  bunshins: vi.fn(),
  createBunshin: vi.fn(),
  referral: vi.fn(),
  createCode: vi.fn(),
  settings: vi.fn(),
  draft: vi.fn(),
  repository: vi.fn(),
  qr: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({ APP_URL: 'https://example.com' }),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: m.actor }),
}));
vi.mock('../src/services/public-service', () => ({
  resolveMemberServiceContext: m.member,
  resolvePublicServiceContext: m.public,
}));
vi.mock('qrcode', () => ({ default: { toDataURL: m.qr } }));
vi.mock('@bunshin/database', () => ({
  PrismaServiceReferralRewardRepository: class {
    completeMilestone = m.reward;
  },
  PrismaBunshinRepository: class {
    listForService = m.bunshins;
    create = m.createBunshin;
  },
  PrismaExternalTrackingLinkRepository: class {
    constructor(client: unknown, serviceId: string) {
      m.repository(client, serviceId);
    }
    listMemberSettings = m.settings;
    saveMemberDraft = m.draft;
  },
  prisma: {
    groupMembership: { findFirst: m.membership },
    industry: { findFirst: m.industry },
    $transaction: m.transaction,
  },
}));
import { saveServiceOnboardingResponse } from '../src/http/service-onboarding';
import { ensureServiceReferralCodeResponse } from '../src/http/service-referral-code';
import { saveServiceMemberTrackingLink } from '../src/http/service-member-tracking-link';

const systemId = '00000000-0000-4000-8000-000000000001';
const domainId = '00000000-0000-4000-8000-000000000002';
const profile = {
  primaryIndustryId: systemId,
  otherIndustryText: null,
  businessName: '自分の店',
  region: null,
  productService: '相談',
  primaryPurpose: 'ATTRACT',
  targetAudience: '地域の方',
  websiteUrl: null,
  businessFeatures: '特徴',
  priceInformation: null,
  preferredTone: '親しみやすい',
  requiredContent: null,
  forbiddenContent: null,
};
function context(
  serviceId = 'service-a',
  workspaceId = 'workspace-a',
  business = false,
  mode = 'FULL',
) {
  return {
    workspaceId,
    serviceId,
    configuration: {
      registration: {
        referralEnabled: true,
        onboardingConfig: { businessProfileEnabled: business, businessProfileInputMode: mode },
        surveyConfig: { questions: ['どのSNS？'] },
      },
    },
  };
}
function request(body: unknown, origin = 'https://example.com') {
  return new Request('https://example.com/api/services/private-a/settings', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const operations = [
  { name: 'onboarding', run: saveServiceOnboardingResponse, body: { answers: ['X'] }, status: 201 },
  { name: 'referral', run: ensureServiceReferralCodeResponse, body: {}, status: 200 },
  {
    name: 'tracking',
    run: saveServiceMemberTrackingLink,
    body: { systemId, allowedDomainId: domainId, url: 'https://agency.example/path' },
    status: 201,
  },
];
function noWrites() {
  for (const fn of [
    m.onboarding,
    m.business,
    m.reward,
    m.createBunshin,
    m.createCode,
    m.draft,
    m.qr,
  ])
    expect(fn).not.toHaveBeenCalled();
}
beforeEach(() => {
  vi.resetAllMocks();
  m.actor.mockResolvedValue({ userId: 'user-a' });
  m.member.mockResolvedValue(context());
  m.membership.mockResolvedValue({ id: 'membership-a' });
  m.onboarding.mockResolvedValue({ id: 'response-a', completedAt: new Date() });
  m.business.mockResolvedValue({ id: 'business-a' });
  m.industry.mockResolvedValue({ key: 'RETAIL' });
  m.reward.mockResolvedValue([]);
  m.bunshins.mockResolvedValue([{ id: 'bunshin-a' }]);
  m.createBunshin.mockResolvedValue({ id: 'new-bunshin-a' });
  m.referral.mockResolvedValue({ code: 'CODE-A', status: 'ACTIVE' });
  m.qr.mockResolvedValue('data:image/png;base64,mocked');
  m.settings.mockResolvedValue({
    systems: [
      {
        id: systemId,
        name: 'Agency',
        domains: [
          {
            id: domainId,
            hostname: 'agency.example',
            allowSubdomains: false,
            shortener: false,
            status: 'ACTIVE',
          },
        ],
      },
    ],
    links: [],
  });
  m.draft.mockResolvedValue({ id: 'link-a', status: 'DRAFT' });
  m.transaction.mockImplementation((callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      groupMembership: { findFirst: m.membership },
      serviceOnboardingResponse: { upsert: m.onboarding },
      serviceMemberBusinessProfile: { upsert: m.business },
      serviceReferralCode: { findFirst: m.referral, createMany: m.createCode },
    }),
  );
});

describe.each(operations)('$name participant service scope', ({ run, body, status }) => {
  it('permits a private member without using the public resolver', async () => {
    const response = await run(request(body), 'private-a');
    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(m.member).toHaveBeenCalledExactlyOnceWith('private-a', 'user-a');
    expect(m.actor.mock.invocationCallOrder[0]).toBeLessThan(m.member.mock.invocationCallOrder[0]!);
    expect(m.public).not.toHaveBeenCalled();
  });
  it('rejects an anonymous actor before service resolution or writes', async () => {
    m.actor.mockResolvedValue(null);
    expect((await run(request(body), 'private-a')).status).toBe(401);
    expect(m.member).not.toHaveBeenCalled();
    noWrites();
  });
  it.each(['other-service', 'unavailable-service'])(
    'rejects %s before repository work',
    async (slug) => {
      m.member.mockRejectedValue(new ApplicationError('NOT_FOUND', 'service unavailable'));
      expect((await run(request(body), slug)).status).toBe(404);
      expect(m.membership).not.toHaveBeenCalled();
      expect(m.settings).not.toHaveBeenCalled();
      noWrites();
    },
  );
  it('preserves unknown resolver failure as server failure', async () => {
    m.member.mockRejectedValue(new Error('resolver unavailable'));
    expect((await run(request(body), 'private-a')).status).toBe(500);
    noWrites();
  });
  it('rejects cross-origin writes before auth or service resolution', async () => {
    expect((await run(request(body, 'https://foreign.example'), 'private-a')).status).toBe(403);
    expect(m.actor).not.toHaveBeenCalled();
    expect(m.member).not.toHaveBeenCalled();
    noWrites();
  });
  it('uses only the switched service and actor scope', async () => {
    m.member.mockResolvedValue(context('service-b', 'workspace-b'));
    m.actor.mockResolvedValue({ userId: 'user-b' });
    m.membership.mockResolvedValue({ id: 'membership-b' });
    expect((await run(request(body), 'private-b')).status).toBe(status);
    expect(m.member).toHaveBeenCalledExactlyOnceWith('private-b', 'user-b');
    if (run === saveServiceMemberTrackingLink) {
      expect(m.repository).toHaveBeenCalledWith(undefined, 'service-b');
      expect(m.draft).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'workspace-b',
          groupId: 'service-b',
          actorUserId: 'user-b',
        }),
      );
    } else {
      expect(m.membership).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId: 'workspace-b',
            groupId: 'service-b',
            userId: 'user-b',
            status: 'ACTIVE',
          }),
        }),
      );
      const write = run === saveServiceOnboardingResponse ? m.onboarding : m.referral;
      expect(write).toHaveBeenCalledWith(
        expect.objectContaining(
          run === saveServiceOnboardingResponse
            ? {
                create: expect.objectContaining({
                  workspaceId: 'workspace-b',
                  groupId: 'service-b',
                  userId: 'user-b',
                  groupMembershipId: 'membership-b',
                }),
              }
            : {
                where: expect.objectContaining({
                  workspaceId: 'workspace-b',
                  groupId: 'service-b',
                  userId: 'user-b',
                  groupMembershipId: 'membership-b',
                }),
              },
        ),
      );
    }
  });
});

describe('service-specific onboarding', () => {
  it('saves only the service question snapshot and scoped milestone without business data', async () => {
    expect(
      (await saveServiceOnboardingResponse(request({ answers: ['X'] }), 'sennokuni')).status,
    ).toBe(201);
    expect(m.onboarding).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          questionsSnapshot: ['どのSNS？'],
          answers: [{ question: 'どのSNS？', answer: 'X' }],
        }),
      }),
    );
    expect(m.reward).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-a',
        groupId: 'service-a',
        referredUserId: 'user-a',
        milestone: 'ONBOARDING_COMPLETED',
      }),
    );
    expect(m.business).not.toHaveBeenCalled();
    expect(m.industry).not.toHaveBeenCalled();
    expect(m.bunshins).not.toHaveBeenCalled();
  });
  it('rejects a business profile injected into a non-business service', async () => {
    expect(
      (
        await saveServiceOnboardingResponse(
          request({ answers: ['X'], businessProfile: profile }),
          'sennokuni',
        )
      ).status,
    ).toBe(400);
    noWrites();
  });
  it.each(['workspaceId', 'groupId', 'userId', 'groupMembershipId'])(
    'rejects injected %s',
    async (key) => {
      expect(
        (
          await saveServiceOnboardingResponse(
            request({ answers: ['X'], [key]: 'foreign' }),
            'private-a',
          )
        ).status,
      ).toBe(400);
      noWrites();
    },
  );
  it('rejects missing membership before saving', async () => {
    m.membership.mockResolvedValue(null);
    expect(
      (await saveServiceOnboardingResponse(request({ answers: ['X'] }), 'private-a')).status,
    ).toBe(403);
    noWrites();
  });
  it('requires exactly the questions from this service', async () => {
    m.member.mockResolvedValue({
      ...context(),
      configuration: {
        registration: { onboardingConfig: {}, surveyConfig: { questions: ['別質問', '追加質問'] } },
      },
    });
    expect(
      (await saveServiceOnboardingResponse(request({ answers: ['X'] }), 'private-b')).status,
    ).toBe(400);
    noWrites();
  });
  it.each(['FULL', 'MINIMAL'])('retains %s business-profile requirements', async (mode) => {
    m.member.mockResolvedValue(context('service-a', 'workspace-a', true, mode));
    expect((await saveServiceOnboardingResponse(request({ answers: ['X'] }), 'hassy')).status).toBe(
      400,
    );
    noWrites();
  });
  it('saves a full profile and reuses only this actor service Bunshin', async () => {
    m.member.mockResolvedValue(context('service-b', 'workspace-b', true));
    expect(
      (
        await saveServiceOnboardingResponse(
          request({ answers: ['X'], businessProfile: profile }),
          'hassy',
        )
      ).status,
    ).toBe(201);
    expect(m.business).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          ...profile,
          workspaceId: 'workspace-b',
          groupId: 'service-b',
          userId: 'user-a',
        }),
      }),
    );
    expect(m.bunshins).toHaveBeenCalledWith({
      workspaceId: 'workspace-b',
      groupId: 'service-b',
      actorUserId: 'user-a',
    });
    expect(m.createBunshin).not.toHaveBeenCalled();
  });
  it('keeps MINIMAL defaults and creates a service-scoped partner only when needed', async () => {
    m.member.mockResolvedValue(context('service-b', 'workspace-b', true, 'MINIMAL'));
    m.bunshins.mockResolvedValue([]);
    const response = await saveServiceOnboardingResponse(
      request({
        answers: ['X'],
        businessProfile: { ...profile, businessFeatures: '', preferredTone: '' },
      }),
      'hassy',
    );
    expect(response.status).toBe(201);
    expect((await response.json()).data.bunshinId).toBe('new-bunshin-a');
    expect(m.business).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ preferredTone: 'やさしく親しみやすい' }),
      }),
    );
    expect(m.createBunshin).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-b',
        groupId: 'service-b',
        actorUserId: 'user-a',
      }),
    );
  });
  it.each(['FULL', 'unavailable', 'OTHER'])(
    'rejects invalid industry/profile: %s',
    async (failure) => {
      m.member.mockResolvedValue(context('service-a', 'workspace-a', true));
      if (failure === 'unavailable') m.industry.mockResolvedValue(null);
      if (failure === 'OTHER') m.industry.mockResolvedValue({ key: 'OTHER' });
      const businessProfile = failure === 'FULL' ? { ...profile, preferredTone: '' } : profile;
      expect(
        (await saveServiceOnboardingResponse(request({ answers: ['X'], businessProfile }), 'hassy'))
          .status,
      ).toBe(400);
      noWrites();
    },
  );
});

describe('referral and tracking policies', () => {
  it('returns an existing active code without minting a new one', async () => {
    const response = await ensureServiceReferralCodeResponse(request({}), 'private-a');
    expect((await response.json()).data.referralUrl).toBe('https://example.com/r/CODE-A');
    expect(m.createCode).not.toHaveBeenCalled();
  });
  it.each(['disabled', 'membership', 'suspended'])(
    'refuses unavailable referral: %s',
    async (failure) => {
      if (failure === 'disabled') {
        const value = context();
        value.configuration.registration.referralEnabled = false;
        m.member.mockResolvedValue(value);
      }
      if (failure === 'membership') m.membership.mockResolvedValue(null);
      if (failure === 'suspended')
        m.referral.mockResolvedValue({ code: 'CODE-A', status: 'SUSPENDED' });
      expect((await ensureServiceReferralCodeResponse(request({}), 'private-a')).status).toBe(403);
      noWrites();
    },
  );
  it('uses a stable scoped code and skipDuplicates for retries', async () => {
    const codes: string[] = [];
    for (let retry = 0; retry < 2; retry++) {
      m.referral.mockResolvedValueOnce(null);
      expect((await ensureServiceReferralCodeResponse(request({}), 'private-a')).status).toBe(200);
      codes.push(String(m.createCode.mock.calls[retry]![0].data[0].code));
    }
    expect(codes[0]).toMatch(/^[A-F0-9]{16}$/);
    expect(codes[1]).toBe(codes[0]);
    expect(m.createCode).toHaveBeenCalledWith({
      skipDuplicates: true,
      data: [
        expect.objectContaining({
          workspaceId: 'workspace-a',
          groupId: 'service-a',
          groupMembershipId: 'membership-a',
          userId: 'user-a',
        }),
      ],
    });
  });
  it('does not share referral keys between services and memberships', async () => {
    m.referral.mockResolvedValueOnce(null);
    expect((await ensureServiceReferralCodeResponse(request({}), 'private-a')).status).toBe(200);
    const firstCode = m.createCode.mock.calls[0]![0].data[0].code;
    m.member.mockResolvedValue(context('service-b', 'workspace-b'));
    m.membership.mockResolvedValue({ id: 'membership-b' });
    m.referral.mockResolvedValueOnce(null);
    expect((await ensureServiceReferralCodeResponse(request({}), 'private-b')).status).toBe(200);
    expect(m.createCode.mock.calls[1]![0].data[0].code).not.toBe(firstCode);
  });
  it.each(['membership', 'domain', 'save'])('refuses missing tracking %s', async (failure) => {
    if (failure === 'membership') m.settings.mockResolvedValue(null);
    if (failure === 'domain') m.settings.mockResolvedValue({ systems: [], links: [] });
    if (failure === 'save') m.draft.mockResolvedValue(null);
    expect(
      (await saveServiceMemberTrackingLink(request(operations[2]!.body), 'private-a')).status,
    ).toBe(404);
    if (failure !== 'save') expect(m.draft).not.toHaveBeenCalled();
  });
  it.each([
    'https://other.example/path',
    'http://agency.example/path',
    'https://agency.example/?email=private',
  ])('retains URL rejection: %s', async (url) => {
    expect(
      (await saveServiceMemberTrackingLink(request({ ...operations[2]!.body, url }), 'private-a'))
        .status,
    ).toBe(400);
    expect(m.draft).not.toHaveBeenCalled();
  });
  it.each(['workspaceId', 'groupId', 'actorUserId', 'groupMembershipId'])(
    'rejects tracking scope injection: %s',
    async (key) => {
      expect(
        (
          await saveServiceMemberTrackingLink(
            request({ ...operations[2]!.body, [key]: 'foreign' }),
            'private-a',
          )
        ).status,
      ).toBe(400);
      expect(m.draft).not.toHaveBeenCalled();
    },
  );
});
