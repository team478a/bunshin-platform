import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  workspace: vi.fn(),
  admin: vi.fn(),
  membership: vi.fn(),
  purchases: vi.fn(),
  groups: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: mocks.actor }),
}));
vi.mock('@bunshin/database', () => ({
  prisma: {
    workspace: { findFirst: mocks.workspace },
    workspaceMembership: { findFirst: mocks.membership },
    programPurchase: { findMany: mocks.purchases },
    group: { findMany: mocks.groups },
  },
  PrismaPlatformAdminRepository: class {
    findActivePlatformAdminByUserId = mocks.admin;
  },
}));

import { organizationPaymentExportResponse } from '../src/http/organization-payment-export';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const purchase = {
  id: 'purchase',
  groupId: 'group',
  status: 'PAID',
  amountYen: 100,
  refundedAmountYen: 0,
  disputedAmountYen: 0,
  currency: 'JPY',
  createdAt: new Date('2026-09-01T00:00:00Z'),
  paidAt: null,
  refundedAt: null,
  disputedAt: null,
  disputeResolvedAt: null,
  disputeStatus: null,
  expiredAt: null,
  providerDisputeId: null,
  providerCheckoutSessionId: null,
  providerPaymentIntentId: null,
  buyer: { displayName: '購入者', email: 'buyer@example.com' },
};
const request = (query = '') => new Request(`https://example.com/api/export${query}`);

describe('payment CSV response', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.actor.mockResolvedValue({ userId: 'owner' });
    mocks.workspace.mockResolvedValue({ id: workspaceId });
    mocks.membership.mockResolvedValue({ id: 'membership' });
    mocks.admin.mockResolvedValue(null);
    mocks.purchases.mockResolvedValue([purchase]);
    mocks.groups.mockResolvedValue([{ id: 'group', name: '自組織サービス' }]);
  });

  it('applies JST boundaries to purchases while retaining workspace and group scope', async () => {
    const response = await organizationPaymentExportResponse(
      request('?from=2026-09-01&to=2026-09-30'),
      workspaceId,
    );
    expect(response.status).toBe(200);
    expect(mocks.purchases).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId,
          createdAt: {
            gte: new Date('2026-08-31T15:00:00Z'),
            lt: new Date('2026-09-30T15:00:00Z'),
          },
        },
        take: 10_001,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
    expect(mocks.membership).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId, userId: 'owner', role: { in: ['OWNER', 'ADMIN'] }, status: 'ACTIVE' },
      }),
    );
    expect(mocks.groups).toHaveBeenCalledWith({
      where: { workspaceId, id: { in: ['group'] } },
      select: { id: true, name: true },
    });
    expect(response.headers.get('content-disposition')).toContain('-2026-09-01-2026-09-30.csv');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.text()).toContain('自組織サービス');
  });

  it('preserves the unfiltered all-period query and filename', async () => {
    const response = await organizationPaymentExportResponse(request(), workspaceId);
    expect(mocks.purchases).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId } }),
    );
    expect(response.headers.get('content-disposition')).toBe(
      `attachment; filename="organization-payments-${workspaceId}.csv"`,
    );
  });

  it('exports exactly 10,000 records without dropping any', async () => {
    mocks.purchases.mockResolvedValue(Array.from({ length: 10_000 }, () => purchase));
    const response = await organizationPaymentExportResponse(request(), workspaceId);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text.trimEnd().split('\r\n')).toHaveLength(10_001);
  });

  it('refuses oversized exports without partial CSV or group lookups', async () => {
    mocks.purchases.mockResolvedValue(Array.from({ length: 10_001 }, () => purchase));
    const response = await organizationPaymentExportResponse(request(), workspaceId);
    expect(response.status).toBe(413);
    expect(response.headers.get('content-disposition')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toMatchObject({ error: { reason: 'EXPORT_LIMIT_EXCEEDED' } });
    expect(mocks.groups).not.toHaveBeenCalled();
  });

  it('exports a header-only CSV for an empty period', async () => {
    mocks.purchases.mockResolvedValue([]);
    const response = await organizationPaymentExportResponse(request(), workspaceId);
    expect(response.status).toBe(200);
    expect((await response.text()).trimEnd().split('\r\n')).toHaveLength(1);
    expect(mocks.groups).not.toHaveBeenCalled();
  });

  it.each(['?from=2026-02-30&to=2026-03-01', '?from=2026-09-01', '?to=&to=', '?workspaceId=other'])(
    'rejects invalid filters before querying personal data: %s',
    async (query) => {
      expect((await organizationPaymentExportResponse(request(query), workspaceId)).status).toBe(
        400,
      );
      expect(mocks.purchases).not.toHaveBeenCalled();
      expect(mocks.actor).not.toHaveBeenCalled();
    },
  );

  it('rejects invalid workspace UUID with a validation error', async () => {
    expect((await organizationPaymentExportResponse(request(), 'invalid')).status).toBe(400);
    expect(mocks.actor).not.toHaveBeenCalled();
  });

  it('rejects missing sessions without purchase reads', async () => {
    mocks.actor.mockResolvedValue(null);
    expect((await organizationPaymentExportResponse(request(), workspaceId)).status).toBe(401);
    expect(mocks.purchases).not.toHaveBeenCalled();
  });

  it.each(['non-manager', 'inactive-organization'])(
    'rejects unauthorized or unavailable organizations: %s',
    async (caseName) => {
      if (caseName === 'non-manager') mocks.membership.mockResolvedValue(null);
      else mocks.workspace.mockResolvedValue(null);
      expect((await organizationPaymentExportResponse(request(), workspaceId)).status).toBe(404);
      expect(mocks.purchases).not.toHaveBeenCalled();
      expect(mocks.groups).not.toHaveBeenCalled();
    },
  );

  it('preserves active platform admin access to the selected organization', async () => {
    mocks.membership.mockResolvedValue(null);
    mocks.admin.mockResolvedValue({ id: 'admin' });
    expect((await organizationPaymentExportResponse(request(), workspaceId)).status).toBe(200);
    expect(mocks.admin).toHaveBeenCalledWith('owner');
  });

  it('does not convert database failures to empty success', async () => {
    mocks.purchases.mockRejectedValue(new Error('private database details'));
    const response = await organizationPaymentExportResponse(request(), workspaceId);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('private database details');
    expect(mocks.groups).not.toHaveBeenCalled();
  });
});
