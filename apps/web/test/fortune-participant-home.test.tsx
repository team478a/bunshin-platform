import type * as Application from '@bunshin/application';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ServiceMemberHome from '../app/s/[serviceSlug]/home/page';

const state = vi.hoisted(() => ({
  service: vi.fn(),
  membership: vi.fn(),
  fortune: vi.fn(),
  legal: vi.fn(),
  otherFeatures: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => ({ getCurrentUser: () => ({ userId: 'member' }) }),
}));
vi.mock('../src/services/public-service', () => ({ resolveMemberServiceContext: state.service }));
vi.mock('@bunshin/application', async (importOriginal) => ({
  ...(await importOriginal<typeof Application>()),
  ServiceParticipationService: class {
    findLegalConsentView = state.legal;
  },
}));
vi.mock('@bunshin/database', () => ({
  PrismaServiceParticipationRepository: class {},
  prisma: {
    groupMembership: { findFirst: state.membership },
    fortuneServiceSetting: { findFirst: state.fortune },
  },
  getActiveRewardsPilotAccess: state.otherFeatures,
}));

const slug = 'oracle-test';
const loadHome = () => ServiceMemberHome({ params: Promise.resolve({ serviceSlug: slug }) });

describe('Fortune service member home after invitation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    state.service.mockResolvedValue({
      workspaceId: 'workspace-oracle',
      serviceId: 'service-oracle',
      configuration: {
        slug,
        displayName: '月と星のオラクル',
        brand: { logoUrl: null },
        registration: {
          onboardingConfig: { fortunePackage: { key: 'FORTUNE_DAILY_GUIDANCE', version: 2 } },
        },
      },
    });
    state.membership.mockResolvedValue({ serviceRole: 'PARTICIPANT', consentedAt: new Date() });
    state.legal.mockResolvedValue({ legalDocuments: [], acceptedDocumentIds: [] });
    state.fortune.mockResolvedValue(null);
  });

  it('keeps the participant on the branded home with access to the manual while readings are paused', async () => {
    const html = renderToStaticMarkup(await loadHome());
    expect(html).toContain('月と星のオラクル');
    expect(html).toContain('占いは現在ご利用いただけません');
    expect(html).toContain(`href="/s/${slug}/manual"`);
    expect(html).not.toContain('投稿パートナー');
    expect(state.otherFeatures).not.toHaveBeenCalled();
  });

  it('keeps required service consent in the same service before proceeding', async () => {
    state.legal.mockResolvedValue({
      legalDocuments: [{ id: 'oracle-terms' }],
      acceptedDocumentIds: [],
    });
    await expect(loadHome()).rejects.toThrow(`REDIRECT:/s/${slug}/legal-consent`);
  });

  it('opens the same service reading page when readings are active and consent is current', async () => {
    state.fortune.mockResolvedValue({ id: 'fortune-setting' });
    await expect(loadHome()).rejects.toThrow(`REDIRECT:/s/${slug}/today`);
  });
});
