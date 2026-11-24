import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ActivityPage from '../app/s/[serviceSlug]/activity/page';
import CreditsPage from '../app/s/[serviceSlug]/credits/page';
import PurchasePage from '../app/s/[serviceSlug]/fortune-purchase/page';
import OpportunitiesPage from '../app/s/[serviceSlug]/fortune-opportunities/page';
import ManualPage from '../app/s/[serviceSlug]/manual/page';
import { ServiceLegalPage } from '../app/s/[serviceSlug]/service-legal-page';
import { defaultFortuneAppearance } from '../src/fortune/appearance';

const fixture = vi.hoisted(() => ({
  page: vi.fn(),
  fortuneSetting: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => ({ getCurrentUser: () => ({ userId: 'member' }) }),
}));
vi.mock('../src/services/public-service', () => ({
  resolveVisitorServiceContext: () => service,
}));
vi.mock('../src/services/member-service-page', () => ({
  resolveAuthenticatedMemberServicePage: fixture.page,
}));
vi.mock('../src/fortune/page-context', () => ({ resolveFortunePage: fixture.page }));
vi.mock('../src/fortune/commerce', () => ({
  availableFortuneProduct: () => null,
  fortunePurchaseHistory: () => [],
  startFortuneCheckout: vi.fn(),
}));
vi.mock('@bunshin/database', () => ({
  FORTUNE_FOLLOW_UP_CREDIT_NAME: 'クレジット',
  readFortuneFollowUpCreditBalance: () => ({ available: 2 }),
  getActiveRewardsPilotAccess: () => null,
  prisma: {
    groupMembership: { findFirst: () => ({ id: 'membership' }) },
    serviceCreditAccount: { findFirst: () => null },
    serviceReferralQualificationPolicyVersion: { findFirst: () => null },
    fortuneServiceSetting: { findFirst: fixture.fortuneSetting },
    fortuneProductHypothesis: { findMany: () => [] },
    serviceLegalDocument: { findFirst: () => null },
  },
}));

const serviceSlug = 'tarot';
const service = {
  workspaceId: 'workspace',
  serviceId: 'group',
  configuration: {
    id: 'configuration',
    workspaceId: 'workspace',
    groupId: 'group',
    slug: serviceSlug,
    displayName: '月と星のオラクル',
    visibility: 'PRIVATE',
    registration: { referralEnabled: false },
    brand: { logoUrl: null, primaryColor: '#28234f', secondaryColor: '#a47935' },
  },
};

describe('Oracle design on member and entry routes', () => {
  const params = Promise.resolve({ serviceSlug });
  const searchParams = Promise.resolve({});
  const appearance = { ...defaultFortuneAppearance, enabled: true, palette: 'night' };
  beforeEach(() => {
    const setting = { enabled: true, guidanceSettings: { appearance } };
    fixture.fortuneSetting.mockResolvedValue(setting);
    fixture.page.mockResolvedValue({
      actor: { userId: 'member' },
      setting,
      service,
    });
  });

  it.each([
    ['友だちに紹介する', () => ActivityPage({ params }), true],
    ['クレジット', () => CreditsPage({ params }), true],
    ['深層鑑定の購入', () => PurchasePage({ params, searchParams }), true],
    ['今後の企画', () => OpportunitiesPage({ params, searchParams }), true],
    ['かんたん使い方', () => ManualPage({ params }), true],
    ['利用規約', () => ServiceLegalPage({ serviceSlug, type: 'TERMS' }), false],
  ] as const)('renders %s with the service palette', async (title, page, hasNav) => {
    const markup = renderToStaticMarkup(await page());
    expect(markup).toContain(title);
    expect(markup).toContain('--fortune-canvas:#17162b');
    expect(markup.includes('aria-label="占いメニュー"')).toBe(hasNav);
  });

  it('keeps generic credit pages on the shared service design', async () => {
    fixture.fortuneSetting.mockResolvedValue(null);
    const markup = renderToStaticMarkup(await CreditsPage({ params }));
    expect(markup).toContain('使える画像作成回数');
    expect(markup).not.toContain('class="fortune-appearance"');
  });
});
