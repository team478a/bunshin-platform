import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  admin: vi.fn(),
  current: vi.fn(),
  history: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: mocks.actor }),
}));
vi.mock('@bunshin/database', () => ({
  PrismaPlatformAdminRepository: class {
    findActivePlatformAdminByUserId = mocks.admin;
  },
  PrismaOemBillingAdminService: class {
    listOfferingPolicyMigrations = mocks.current;
    listOfferingPolicyHistory = mocks.history;
  },
}));

import {
  currentOfferingPolicyCsvRows,
  oemOfferingPolicyExportResponse,
  offeringPolicyHistoryCsvRows,
} from '../src/http/oem-offering-policy-export';

const request = (query: string) =>
  new Request(`https://example.com/api/admin/commercial-billing/offering-policies/export${query}`);
const offering = {
  id: 'offering',
  workspaceId: 'workspace',
  groupId: 'group',
  productId: 'product',
  productPolicyVersionId: 'v1',
  productPolicy: 'SOCIAL_SERVICE',
  classification: 'PAID',
  startsAt: new Date('2026-10-01T00:00:00Z'),
  endsAt: null,
  actorUserId: 'actor',
  reason: '=review',
  productPolicyVersion: { id: 'v1', version: 1 },
  product: {
    displayName: 'SNS支援',
    status: 'ACTIVE',
    policyVersions: [
      { id: 'v1', version: 1, effectiveFrom: new Date('2026-10-01T00:00:00Z') },
      { id: 'v2', version: 2, effectiveFrom: new Date('2026-10-10T00:00:00Z') },
    ],
  },
  group: {
    name: 'Service',
    workspace: { name: 'Organization' },
    serviceConfiguration: { displayName: 'OEM Service', slug: 'oem-service' },
  },
  targetPolicyReviews: [{ policyVersionId: 'v2', blockers: [] }],
};

describe('OEM offering policy CSV export', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.actor.mockResolvedValue({ userId: 'actor' });
    mocks.admin.mockResolvedValue({ role: 'SUPER_ADMIN' });
    mocks.current.mockResolvedValue([offering]);
    mocks.history.mockResolvedValue({
      entries: [{ ...offering, actorDisplayName: '管理者' }],
      truncated: false,
    });
  });

  it('exports the filtered current review list with spreadsheet-safe cells', async () => {
    const response = await oemOfferingPolicyExportResponse(
      request('?scope=current&q=OEM&product=SOCIAL_SERVICE&state=NEEDS_MIGRATION'),
    );
    expect(response.status).toBe(200);
    expect(mocks.current).toHaveBeenCalledWith(
      'actor',
      { query: 'OEM', productKey: 'SOCIAL_SERVICE' },
      10_001,
    );
    const body = await response.text();
    expect(body).toContain('要レビュー');
    expect(body).toContain("'=review");
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('exports the immutable period history separately', async () => {
    const response = await oemOfferingPolicyExportResponse(request('?scope=history&q=OEM'));
    expect(response.status).toBe(200);
    expect(mocks.history).toHaveBeenCalledWith('actor', { query: 'OEM' }, 10_000);
    expect(await response.text()).toContain('管理者');
  });

  it('exports compatibility blockers and supports the blocked filter', async () => {
    mocks.current.mockResolvedValue([
      {
        ...offering,
        targetPolicyReviews: [
          {
            policyVersionId: 'v2',
            blockers: ['OEM_PRODUCT_CAPABILITY_POLICY_REQUIRED'],
          },
        ],
      },
    ]);
    const response = await oemOfferingPolicyExportResponse(request('?scope=current&state=BLOCKED'));
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('互換性ブロック');
    expect(body).toContain('OEM_PRODUCT_CAPABILITY_POLICY_REQUIRED');
  });

  it('rejects oversized exports without returning a partial CSV', async () => {
    mocks.current.mockResolvedValue(Array.from({ length: 10_001 }, () => offering));
    const response = await oemOfferingPolicyExportResponse(request('?scope=current'));
    expect(response.status).toBe(413);
    expect(response.headers.get('content-disposition')).toBeNull();
    expect(await response.json()).toMatchObject({ error: { reason: 'EXPORT_LIMIT_EXCEEDED' } });
  });

  it.each([
    '?scope=unknown',
    '?scope=current&product=invalid',
    '?scope=history&state=ALL',
    '?scope=current&extra=1',
  ])('rejects invalid filters before authentication: %s', async (query) => {
    expect((await oemOfferingPolicyExportResponse(request(query))).status).toBe(400);
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.current).not.toHaveBeenCalled();
  });

  it('requires an active SUPER_ADMIN before reading offering data', async () => {
    mocks.admin.mockResolvedValue({ role: 'AUDITOR' });
    expect((await oemOfferingPolicyExportResponse(request('?scope=current'))).status).toBe(403);
    expect(mocks.current).not.toHaveBeenCalled();
  });

  it('builds current and history rows without mutating period data', () => {
    expect(currentOfferingPolicyCsvRows([offering] as never, '2026-10-11')).toHaveLength(2);
    expect(
      offeringPolicyHistoryCsvRows([{ ...offering, actorDisplayName: '管理者' }] as never),
    ).toHaveLength(2);
  });
});
