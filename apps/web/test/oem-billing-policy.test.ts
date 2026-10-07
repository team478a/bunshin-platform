import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  current: vi.fn(),
  admin: vi.fn(),
  setOffering: vi.fn(),
  scheduleCutover: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({ APP_URL: 'https://app.example.test' }),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: mocks.current }),
}));
vi.mock('@bunshin/database', () => ({
  PrismaPlatformAdminRepository: class {
    findActivePlatformAdminByUserId = mocks.admin;
  },
  PrismaOemBillingAdminService: class {
    setOffering = mocks.setOffering;
    scheduleCutover = mocks.scheduleCutover;
  },
}));
import { oemBillingPolicyResponse } from '../src/http/oem-billing-policy';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const groupId = '22222222-2222-4222-8222-222222222222';
const value = {
  operation: 'SET_OFFERING',
  workspaceId,
  groupId,
  productPolicy: 'HASSY',
  classification: 'PAID',
  expectedCurrentId: null,
  reason: 'human review',
  confirmed: true,
};
const request = (body: unknown = value, origin = 'https://app.example.test') =>
  new Request(`${origin}/api/admin/commercial-billing/oem-policy`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('OEM billing preparation API', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.current.mockResolvedValue({ userId: 'server-actor' });
    mocks.admin.mockResolvedValue({ role: 'SUPER_ADMIN' });
    mocks.setOffering.mockResolvedValue({ id: 'reviewed-offering' });
  });
  it('uses the session actor and passes tenant identifiers to the reauthorizing service', async () => {
    expect((await oemBillingPolicyResponse(request())).status).toBe(200);
    expect(mocks.setOffering).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId, groupId, actorUserId: 'server-actor' }),
    );
  });
  it('denies cross-origin requests before mutation', async () => {
    expect(
      (await oemBillingPolicyResponse(request(value, 'https://evil.example.test'))).status,
    ).toBe(403);
    expect(mocks.setOffering).not.toHaveBeenCalled();
  });
  it('requires authentication and SUPER_ADMIN, not a workspace owner or ADMIN', async () => {
    mocks.current.mockResolvedValue(null);
    expect((await oemBillingPolicyResponse(request())).status).toBe(401);
    mocks.current.mockResolvedValue({ userId: 'server-actor' });
    mocks.admin.mockResolvedValue({ role: 'ADMIN' });
    expect((await oemBillingPolicyResponse(request())).status).toBe(403);
    expect(mocks.setOffering).not.toHaveBeenCalled();
  });
  it('rejects forged actors and unconfirmed operations', async () => {
    expect(
      (await oemBillingPolicyResponse(request({ ...value, actorUserId: 'forged' }))).status,
    ).toBe(400);
    expect((await oemBillingPolicyResponse(request({ ...value, confirmed: false }))).status).toBe(
      400,
    );
    expect(mocks.setOffering).not.toHaveBeenCalled();
  });
  it('returns a review conflict rather than an invoice with a guessed zero', async () => {
    mocks.setOffering.mockRejectedValue(new Error('REVIEW_REQUIRED: tenant history missing'));
    expect((await oemBillingPolicyResponse(request())).status).toBe(409);
  });
});
