import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  current: vi.fn(),
  admin: vi.fn(),
  registerProductPolicy: vi.fn(),
  setOffering: vi.fn(),
  correctOfferingPeriod: vi.fn(),
  correctRegistrationPeriod: vi.fn(),
  correctContractPeriod: vi.fn(),
  scheduleCutover: vi.fn(),
  correctCutover: vi.fn(),
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
    registerProductPolicy = mocks.registerProductPolicy;
    setOffering = mocks.setOffering;
    correctOfferingPeriod = mocks.correctOfferingPeriod;
    correctRegistrationPeriod = mocks.correctRegistrationPeriod;
    correctContractPeriod = mocks.correctContractPeriod;
    scheduleCutover = mocks.scheduleCutover;
    correctCutover = mocks.correctCutover;
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
    mocks.registerProductPolicy.mockResolvedValue({ id: 'third-service' });
    mocks.setOffering.mockResolvedValue({ id: 'reviewed-offering' });
    mocks.correctOfferingPeriod.mockResolvedValue({ id: 'corrected-offering' });
    mocks.correctRegistrationPeriod.mockResolvedValue({ id: 'corrected-registration' });
    mocks.correctContractPeriod.mockResolvedValue({ id: 'corrected-contract-period' });
    mocks.correctCutover.mockResolvedValue({ id: 'corrected-cutover' });
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
  it('passes contract corrections with the session actor and explicit expected version', async () => {
    const response = await oemBillingPolicyResponse(
      request({
        operation: 'CORRECT_CONTRACT',
        workspaceId,
        contractPeriodId: '33333333-3333-4333-8333-333333333333',
        expectedStartsAt: '2026-09-01T00:00:00.000Z',
        expectedEndsAt: null,
        revisedStartsAt: '2026-09-02T00:00:00.000Z',
        revisedEndsAt: null,
        reason: '契約書原本に基づく開始日時の訂正',
        confirmed: true,
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.correctContractPeriod).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        actorUserId: 'server-actor',
        expectedEndsAt: null,
        confirmed: true,
      }),
    );
  });
  it('passes offering and registration corrections with session actor CAS values', async () => {
    const offering = await oemBillingPolicyResponse(
      request({
        operation: 'CORRECT_OFFERING',
        workspaceId,
        offeringPeriodId: '33333333-3333-4333-8333-333333333333',
        expectedStartsAt: '2026-09-01T00:00:00.000Z',
        expectedEndsAt: null,
        expectedClassification: 'PAID',
        revisedStartsAt: '2026-09-02T00:00:00.000Z',
        revisedEndsAt: null,
        revisedClassification: 'PAID_BUNDLE',
        reason: '契約資料に基づく提供区分と開始日時の訂正',
        confirmed: true,
      }),
    );
    expect(offering.status).toBe(200);
    expect(mocks.correctOfferingPeriod).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: 'server-actor', expectedClassification: 'PAID' }),
    );

    const registration = await oemBillingPolicyResponse(
      request({
        operation: 'CORRECT_REGISTRATION',
        workspaceId,
        registrationPeriodId: '44444444-4444-4444-8444-444444444444',
        expectedStartsAt: '2026-09-01T00:00:00.000Z',
        expectedEndsAt: null,
        revisedStartsAt: '2026-09-03T00:00:00.000Z',
        revisedEndsAt: null,
        reason: '参加承認資料に基づく正式登録日時の訂正',
        confirmed: true,
      }),
    );
    expect(registration.status).toBe(200);
    expect(mocks.correctRegistrationPeriod).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: 'server-actor', expectedEndsAt: null }),
    );
  });
  it('passes cutover cancellation and replacement with session actor CAS values', async () => {
    const response = await oemBillingPolicyResponse(
      request({
        operation: 'CORRECT_CUTOVER',
        workspaceId,
        expectedEffectiveFrom: '2026-12-01T00:00:00.000Z',
        revisedMonth: '2027-01',
        reason: '承認済みの開始利用月を契約資料に基づいて訂正',
        historyReviewed: true,
        confirmed: true,
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.correctCutover).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        actorUserId: 'server-actor',
        expectedEffectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
        revisedEffectiveFrom: new Date('2027-01-01T00:00:00.000Z'),
        historyReviewed: true,
      }),
    );
  });
  it('registers a third service product without a product-name code change', async () => {
    const response = await oemBillingPolicyResponse(
      request({
        operation: 'REGISTER_PRODUCT_POLICY',
        key: 'THIRD_SERVICE',
        displayName: '第三サービス',
        freeOfferingAllowed: true,
        requiredCapabilities: ['SOCIAL'],
        effectiveFrom: '2026-11-01',
        reason: '新しいワタシワークス商品を明示登録',
        confirmed: true,
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.registerProductPolicy).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'THIRD_SERVICE', actorUserId: 'server-actor' }),
    );
  });
});
