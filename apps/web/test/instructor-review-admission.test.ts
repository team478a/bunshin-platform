import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as StripeCheckoutModule from '../src/payments/stripe-checkout';
import {
  beginInstructorReview,
  dismissIndividualInstructorReviewOffer,
  getAssignedInstructorReviews,
  proposeIndividualInstructorReview,
} from '../src/services/instructor-review-runtime';

const f = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    groupMembership: { findFirst: vi.fn() },
    programActionEvent: { findFirst: vi.fn(), createMany: vi.fn() },
    instructorReview: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    instructorReviewProduct: { findUnique: vi.fn() },
    organizationPaymentConfiguration: { findFirst: vi.fn() },
    programEnrollment: { findFirst: vi.fn() },
    programMissionAssignment: { findFirst: vi.fn() },
    serviceProgram: { findFirst: vi.fn() },
  };
  return { tx, current: vi.fn(), member: vi.fn(), checkout: vi.fn() };
});
vi.mock('server-only', () => ({}));
vi.mock('@bunshin/database', () => ({
  prisma: { ...f.tx, $transaction: (call: (tx: typeof f.tx) => unknown) => call(f.tx) },
}));
vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({ APP_URL: 'https://example.com' }),
}));
vi.mock('../src/services/instructor-review-practice', () => ({
  currentInstructorReviewPractice: f.current,
}));
vi.mock('../src/services/public-service', () => ({
  resolveMemberServiceContext: f.member,
  resolveManagedServiceContext: f.member,
}));
vi.mock('../src/services/instructor-review-notification', () => ({
  notifyInstructorReviewAnswered: vi.fn(),
}));
vi.mock('../src/payments/secure-configuration', () => ({
  currentPaymentEnvironment: () => 'STAGING',
  AesGcmPaymentSecretCrypto: class {
    decrypt() {
      return 'synthetic';
    }
  },
}));
vi.mock('../src/payments/stripe-checkout', async (load) => ({
  ...(await load<typeof StripeCheckoutModule>()),
  StripeCheckoutAdapter: class {
    create = f.checkout;
  },
}));

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const workspaceId = id(1);
const groupId = id(2);
const programId = id(3);
const enrollmentId = id(4);
const userId = id(5);
const groupMembershipId = id(6);
const instructorId = id(7);
const assignmentId = id(8);
const productRevision = id(9);
const paymentId = id(10);
const request = {
  serviceSlug: 'manaberu-style',
  enrollmentId,
  userId,
  submission: {
    assignmentId,
    productRevision,
    topicId: null,
    idempotencyKey: id(11),
    focus: '書き方が伝わるか',
    excerpt: '共有する一文',
  },
};

describe('instructor review admission', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    f.member.mockResolvedValue({ workspaceId, serviceId: groupId });
    f.current.mockResolvedValue({
      assignmentId,
      title: '週報',
      planRevision: 1,
      actor: { scope: { workspaceId, groupId, groupMembershipId } },
    });
    f.tx.instructorReviewProduct.findUnique.mockResolvedValue({
      revision: productRevision,
      settings: {
        enabled: true,
        programIds: [programId],
        instructorUserIds: [instructorId],
        priceYen: 1500,
        description: '文章レビュー',
        responseHours: 48,
        cancellationTerms: '受付前取消',
        capacity: 1,
      },
    });
    f.tx.organizationPaymentConfiguration.findFirst.mockResolvedValue({
      id: paymentId,
      encryptedSecretKey: 'synthetic',
    });
    f.tx.programEnrollment.findFirst.mockResolvedValue({ serviceProgramId: programId });
    f.tx.programMissionAssignment.findFirst.mockResolvedValue({ id: assignmentId });
    f.tx.instructorReview.count.mockResolvedValue(0);
    f.tx.instructorReview.findFirst.mockResolvedValue(null);
    f.tx.instructorReview.create.mockResolvedValue({
      id: id(12),
      workspaceId,
      groupId,
      assignmentId,
      enrollmentId,
      status: 'PENDING_PAYMENT',
      paymentConfigurationId: paymentId,
      productRevision,
      amountYen: 1500,
      responseHours: 48,
    });
    f.checkout.mockResolvedValue({ id: 'cs_test_1', url: 'https://checkout.stripe.com/example' });
  });

  it('checks the last slot after locking the service and rejects before calling Stripe', async () => {
    f.tx.instructorReview.count.mockResolvedValue(1);
    await expect(beginInstructorReview(request)).rejects.toThrow('受付枠が埋まっています');
    const lockOrder = f.tx.$queryRaw.mock.invocationCallOrder[0] ?? 0;
    const capacityOrder = f.tx.instructorReview.count.mock.invocationCallOrder[0] ?? 0;
    expect(lockOrder).toBeGreaterThan(0);
    expect(lockOrder).toBeLessThan(capacityOrder);
    expect(f.tx.instructorReview.create).not.toHaveBeenCalled();
    expect(f.checkout).not.toHaveBeenCalled();
  });

  it('reuses the existing checkout for a second tab on the same assignment', async () => {
    f.tx.instructorReview.findFirst.mockResolvedValue({
      id: id(12),
      workspaceId,
      groupId,
      assignmentId,
      enrollmentId,
      status: 'PENDING_PAYMENT',
      paymentConfigurationId: paymentId,
      requestKey: id(13),
      providerCheckoutSessionId: 'cs_test_1',
      checkoutUrl: 'https://checkout.stripe.com/original',
    });
    await expect(beginInstructorReview(request)).resolves.toEqual({
      url: 'https://checkout.stripe.com/original',
    });
    expect(f.tx.instructorReview.create).not.toHaveBeenCalled();
    expect(f.checkout).not.toHaveBeenCalled();
  });

  it('filters the lecturer reads to the current service and assigned identity', async () => {
    f.tx.instructorReview.findMany.mockResolvedValue([]);
    await expect(getAssignedInstructorReviews('manaberu-style', userId)).rejects.toThrow();
    await expect(getAssignedInstructorReviews('hassy', instructorId)).rejects.toThrow();
    expect(f.tx.instructorReview.findMany).not.toHaveBeenCalled();
    await expect(getAssignedInstructorReviews('manaberu-style', instructorId)).resolves.toEqual([]);
    expect(f.tx.instructorReview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId,
          groupId,
          instructorUserId: instructorId,
          contentRedactedAt: null,
        }),
      }),
    );
  });

  it('creates one proposal only for an eligible current task and reuses the assignment key', async () => {
    f.tx.groupMembership.findFirst.mockResolvedValue({ id: groupMembershipId });
    f.tx.programEnrollment.findFirst.mockResolvedValue({
      serviceProgramId: programId,
      groupMembershipId,
    });
    f.tx.serviceProgram.findFirst.mockResolvedValue({ id: programId });
    f.tx.programActionEvent.createMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const input = {
      serviceSlug: request.serviceSlug,
      enrollmentId,
      userId,
      assignmentId,
      focus: 'STRUCTURE' as const,
    };
    await expect(proposeIndividualInstructorReview(input)).resolves.toBe('proposed');
    await expect(proposeIndividualInstructorReview(input)).resolves.toBe('existing-offer');
    expect(f.tx.programActionEvent.createMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId,
        groupId,
        programEnrollmentId: enrollmentId,
        missionAssignmentId: assignmentId,
        idempotencyKey: `instructor-review-offer:${assignmentId}`,
        metadata: { focus: 'STRUCTURE' },
      }),
      skipDuplicates: true,
    });
    f.tx.instructorReview.findFirst.mockResolvedValue({ id: id(12) });
    await expect(proposeIndividualInstructorReview(input)).resolves.toBe('existing-review');
    f.tx.programMissionAssignment.findFirst.mockResolvedValue(null);
    await expect(proposeIndividualInstructorReview(input)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(f.tx.programActionEvent.createMany).toHaveBeenCalledTimes(2);
  });

  it('records the operator source only for an active offer on the buyer’s assignment', async () => {
    const offerId = id(14);
    const input = { ...request, individualOfferId: offerId };
    f.tx.programActionEvent.findFirst.mockResolvedValueOnce(null);
    await expect(beginInstructorReview(input)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(f.checkout).not.toHaveBeenCalled();
    f.tx.programActionEvent.findFirst
      .mockResolvedValueOnce({ id: offerId, metadata: { focus: 'CLARITY' } })
      .mockResolvedValueOnce(null);
    await expect(beginInstructorReview(input)).resolves.toEqual({
      url: 'https://checkout.stripe.com/example',
    });
    expect(f.tx.programActionEvent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: offerId,
          workspaceId,
          groupId,
          programEnrollmentId: enrollmentId,
          missionAssignmentId: assignmentId,
        }),
      }),
    );
    expect(f.tx.instructorReview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ source: 'OPERATOR_OFFER' }),
      }),
    );
  });

  it('does not re-show or overwrite a dismissal when the action is retried', async () => {
    const offerId = id(14);
    const input = {
      serviceSlug: request.serviceSlug,
      enrollmentId,
      userId,
      offerId,
      topicId: null,
    };
    f.tx.programActionEvent.findFirst.mockResolvedValue({
      id: offerId,
      metadata: { focus: 'STRUCTURE' },
    });
    f.tx.programActionEvent.findFirst
      .mockResolvedValueOnce({ id: offerId, metadata: { focus: 'STRUCTURE' } })
      .mockResolvedValueOnce(null);
    await dismissIndividualInstructorReviewOffer(input);
    await dismissIndividualInstructorReviewOffer(input);
    expect(f.tx.programActionEvent.createMany).toHaveBeenCalledTimes(1);
    expect(f.tx.programActionEvent.createMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        idempotencyKey: `instructor-review-offer-dismissed:${offerId}`,
        sourceResourceId: offerId,
      }),
      skipDuplicates: true,
    });
  });
});
