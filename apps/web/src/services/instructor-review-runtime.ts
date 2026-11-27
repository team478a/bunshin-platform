import 'server-only';

import { randomUUID } from 'node:crypto';
import { PERSONAL_LEARNING_PRACTICE_MISSION } from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { prisma, type Prisma } from '@bunshin/database';
import { ApplicationError } from '@bunshin/shared';
import { z } from 'zod';
import {
  instructorReviewApplication,
  instructorReviewOfferFocus,
  instructorReviewOccupiesSlot,
  instructorReviewProduct,
  instructorReviewReply,
  type InstructorReviewApplication,
  type InstructorReviewProduct,
} from './instructor-review-contract';
import { currentInstructorReviewPractice } from './instructor-review-practice';
import { resolveManagedServiceContext, resolveMemberServiceContext } from './public-service';
import { MANABERU_SERVICE_SLUG } from './service-auth-brand';
import {
  AesGcmPaymentSecretCrypto,
  currentPaymentEnvironment,
} from '../payments/secure-configuration';
import {
  isStripeCheckoutUrl,
  StripeCheckoutAdapter,
  StripeCheckoutExpirationAdapter,
  StripeFullRefundAdapter,
} from '../payments/stripe-checkout';
import { StripeCheckoutSessionRetrievalAdapter } from '../payments/stripe-object-retrieval';
import { notifyInstructorReviewAnswered } from './instructor-review-notification';

type Scope = { workspaceId: string; groupId: string };
type Tx = Prisma.TransactionClient;
type Review = Prisma.InstructorReviewGetPayload<object>;
type LearnerKey = {
  serviceSlug: string;
  enrollmentId: string;
  userId: string;
};
const uuid = z.uuid();
const missing = () => new ApplicationError('NOT_FOUND', '講師レビューを確認できませんでした');
const conflict = (message: string) => new ApplicationError('CONFLICT', message);
const openStatuses = [...instructorReviewOccupiesSlot];
const assignedStatuses = ['IN_PROGRESS', 'ANSWERED'] as const;
const offerCreated = 'INSTRUCTOR_REVIEW_OFFER_CREATED';
const offerDismissed = 'INSTRUCTOR_REVIEW_OFFER_DISMISSED';
const offerKey = (assignmentId: string) => `instructor-review-offer:${assignmentId}`;
const dismissalKey = (offerId: string) => `instructor-review-offer-dismissed:${offerId}`;

export function instructorReviewPath(
  enrollmentId: string,
  reviewId: string,
  topicId: string | null,
) {
  const params = new URLSearchParams({ reviewId });
  if (topicId) params.set('topicId', topicId);
  return `/s/${MANABERU_SERVICE_SLUG}/programs/${enrollmentId}/learning-request/instructor-review?${params.toString()}` as const;
}

async function serviceScope(slug: string, userId: string, operator = false): Promise<Scope> {
  if (slug !== MANABERU_SERVICE_SLUG) throw missing();
  const service = await (operator ? resolveManagedServiceContext : resolveMemberServiceContext)(
    slug,
    userId,
  ).catch((error: unknown) => {
    if (error instanceof Error && error.message === 'SERVICE_NOT_FOUND') throw missing();
    throw error;
  });
  return { workspaceId: service.workspaceId, groupId: service.serviceId };
}

async function lockScope(tx: Tx, scope: Scope) {
  await tx.$queryRaw`SELECT id FROM groups
    WHERE workspace_id = ${scope.workspaceId}::uuid AND id = ${scope.groupId}::uuid
    FOR UPDATE`;
}

async function managerInside(tx: Tx, scope: Scope, userId: string) {
  if (
    !(await tx.groupMembership.findFirst({
      where: {
        ...scope,
        userId,
        status: 'ACTIVE',
        serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
      },
      select: { id: true },
    }))
  )
    throw missing();
}

const paymentWhere = (workspaceId: string) => ({
  workspaceId,
  environment: currentPaymentEnvironment(),
  provider: 'STRIPE' as const,
  status: 'ACTIVE' as const,
  lastVerifiedAt: { not: null },
  lastErrorCategory: null,
  encryptedWebhookSecret: { not: null },
});
const programWhere = (scope: Scope) => ({
  ...scope,
  status: 'ACTIVE' as const,
  settings: { path: ['moduleKey'], equals: 'AI_TRAINING_V1' },
});
const productInfo = async (tx: Tx, scope: Scope) => {
  const row = await tx.instructorReviewProduct.findUnique({
    where: { workspaceId_groupId: scope },
  });
  if (!row) return null;
  const settings = instructorReviewProduct.parse(row.settings);
  return { ...settings, revision: row.revision };
};
const occupied = (tx: Tx, scope: Scope) =>
  tx.instructorReview.count({
    where: { ...scope, status: { in: openStatuses } },
  });

async function activeIndividualOffer(
  tx: Tx,
  key: Scope & { programEnrollmentId: string; missionAssignmentId: string },
  offerId?: string,
) {
  const event = await tx.programActionEvent.findFirst({
    where: { ...key, ...(offerId ? { id: offerId } : {}), eventType: offerCreated },
    select: { id: true, metadata: true },
  });
  if (!event) return null;
  const parsed = z.object({ focus: instructorReviewOfferFocus }).safeParse(event.metadata);
  if (!parsed.success) return null;
  const dismissed = await tx.programActionEvent.findFirst({
    where: { ...key, sourceResourceId: event.id, eventType: offerDismissed },
    select: { id: true },
  });
  return dismissed ? null : { id: event.id, focus: parsed.data.focus };
}

export async function proposeIndividualInstructorReview(
  input: LearnerKey & { assignmentId: string; focus: z.output<typeof instructorReviewOfferFocus> },
) {
  const scope = await serviceScope(input.serviceSlug, input.userId, true);
  const key = {
    ...scope,
    programEnrollmentId: uuid.parse(input.enrollmentId),
    missionAssignmentId: uuid.parse(input.assignmentId),
  };
  const focus = instructorReviewOfferFocus.parse(input.focus);
  return prisma.$transaction(async (tx) => {
    await lockScope(tx, scope);
    await managerInside(tx, scope, input.userId);
    const now = new Date();
    const [target, assignment, product, payment, used, review] = await Promise.all([
      tx.programEnrollment.findFirst({
        where: {
          ...scope,
          id: key.programEnrollmentId,
          status: 'ACTIVE',
          startsAt: { lte: now },
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        },
        select: { serviceProgramId: true, groupMembershipId: true },
      }),
      tx.programMissionAssignment.findFirst({
        where: {
          ...scope,
          id: key.missionAssignmentId,
          programEnrollmentId: key.programEnrollmentId,
          missionDefinitionKey: PERSONAL_LEARNING_PRACTICE_MISSION,
          status: 'STARTED',
        },
        select: { id: true },
      }),
      productInfo(tx, scope),
      tx.organizationPaymentConfiguration.findFirst({
        where: paymentWhere(scope.workspaceId),
        select: { id: true },
      }),
      occupied(tx, scope),
      tx.instructorReview.findFirst({
        where: {
          ...scope,
          enrollmentId: key.programEnrollmentId,
          assignmentId: key.missionAssignmentId,
          status: { in: [...openStatuses, 'ANSWERED'] },
        },
        select: { id: true },
      }),
    ]);
    if (
      !target ||
      !assignment ||
      !(await tx.groupMembership.findFirst({
        where: {
          ...scope,
          id: target.groupMembershipId,
          status: 'ACTIVE',
          serviceRole: 'PARTICIPANT',
          user: { status: 'ACTIVE' },
        },
        select: { id: true },
      }))
    )
      throw missing();
    if (review) return 'existing-review' as const;
    if (
      !product?.enabled ||
      !payment ||
      !product.programIds.includes(target.serviceProgramId) ||
      used >= product.capacity ||
      !(await tx.serviceProgram.findFirst({
        where: { ...programWhere(scope), id: target.serviceProgramId },
        select: { id: true },
      }))
    )
      throw conflict('現在、対象の課題で講師レビューを新規受付できません。');
    const idempotencyKey = offerKey(key.missionAssignmentId);
    const created = await tx.programActionEvent.createMany({
      data: {
        ...key,
        eventType: offerCreated,
        idempotencyKey,
        metadata: { focus },
        actorUserId: input.userId,
        occurredAt: new Date(),
      },
      skipDuplicates: true,
    });
    return created.count === 1 ? ('proposed' as const) : ('existing-offer' as const);
  });
}

export async function getIndividualInstructorReviewOffer(
  input: LearnerKey & { assignmentId: string; topicId: string | null },
) {
  const scope = await serviceScope(input.serviceSlug, input.userId);
  const event = await activeIndividualOffer(prisma, {
    ...scope,
    programEnrollmentId: input.enrollmentId,
    missionAssignmentId: input.assignmentId,
  });
  if (!event) return null;
  const state = await getInstructorReviewLearner({ ...input, reviewId: null });
  if (state.current?.assignmentId !== input.assignmentId) return null;
  if (state.review) return { kind: 'review' as const, review: state.review };
  return state.offer ? { kind: 'offer' as const, ...event } : null;
}

export async function dismissIndividualInstructorReviewOffer(
  input: LearnerKey & { offerId: string; topicId: string | null },
) {
  const practice = await currentInstructorReviewPractice(input);
  const { workspaceId, groupId } = practice.actor.scope;
  const key = {
    workspaceId,
    groupId,
    programEnrollmentId: input.enrollmentId,
    missionAssignmentId: practice.assignmentId,
  };
  await prisma.$transaction(async (tx) => {
    await lockScope(tx, { workspaceId, groupId });
    const event = await activeIndividualOffer(tx, key, uuid.parse(input.offerId));
    if (!event) return;
    await tx.programActionEvent.createMany({
      data: {
        ...key,
        eventType: offerDismissed,
        sourceResourceType: 'PROGRAM_ACTION_EVENT',
        sourceResourceId: event.id,
        idempotencyKey: dismissalKey(event.id),
        metadata: {},
        actorUserId: input.userId,
        occurredAt: new Date(),
      },
      skipDuplicates: true,
    });
  });
}

function learnerReview(row: Review) {
  return {
    id: row.id,
    assignmentId: row.assignmentId,
    title: row.title,
    status: row.status,
    focus: row.focus,
    excerpt: row.excerpt,
    answer: row.answer,
    dueAt: row.dueAt,
    checkoutUrl: row.status === 'PENDING_PAYMENT' ? row.checkoutUrl : null,
    priceYen: row.amountYen,
    description: row.description,
    responseHours: row.responseHours,
    cancellationTerms: row.cancellationTerms,
    topicId: row.topicId,
    planRevision: row.planRevision,
  };
}

export async function getInstructorReviewLearner(
  input: LearnerKey & {
    topicId: string | null;
    reviewId: string | null;
  },
) {
  const scope = await serviceScope(input.serviceSlug, input.userId);
  const enrollmentId = uuid.parse(input.enrollmentId);
  const buyer = { ...scope, enrollmentId, buyerUserId: input.userId };
  const previous = input.reviewId
    ? await prisma.instructorReview.findFirst({
        where: { ...buyer, id: uuid.parse(input.reviewId) },
      })
    : null;
  if (input.reviewId && !previous) throw missing();

  const active = await currentInstructorReviewPractice({
    ...input,
    topicId: previous?.topicId ?? input.topicId,
  }).catch((error: unknown) => {
    if (error instanceof ApplicationError && error.code === 'NOT_FOUND') return null;
    throw error;
  });
  const current = active
    ? {
        assignmentId: active.assignmentId,
        title: active.title,
        draft: active.draft,
        topicId: active.actor.topicId ?? null,
      }
    : null;
  const review =
    previous ??
    (await prisma.instructorReview.findFirst({
      where: {
        ...buyer,
        ...(active
          ? { assignmentId: active.assignmentId, status: { notIn: ['CANCELLED', 'REFUNDED'] } }
          : { topicId: input.topicId }),
      },
      orderBy: { createdAt: 'desc' },
    }));
  if (!active)
    return {
      current,
      review: review ? learnerReview(review) : null,
      offer: null,
      unavailable: '実践中の課題から講師に相談できます。',
    };

  const [offer, payment, enrollment, used] = await Promise.all([
    productInfo(prisma, scope),
    prisma.organizationPaymentConfiguration.findFirst({
      where: paymentWhere(scope.workspaceId),
      select: { id: true },
    }),
    prisma.programEnrollment.findFirst({
      where: { ...scope, id: enrollmentId },
      select: { serviceProgramId: true },
    }),
    occupied(prisma, scope),
  ]);
  const unavailable =
    !offer ||
    !offer.enabled ||
    !payment ||
    !enrollment ||
    !offer.programIds.includes(enrollment.serviceProgramId)
      ? '現在、講師レビューの新規受付を行っていません。'
      : used >= offer.capacity
        ? '現在、受付枠が埋まっています。'
        : null;
  return {
    current,
    offer: unavailable ? null : offer,
    unavailable,
    review: review ? learnerReview(review) : null,
  };
}

async function paymentSecret(review: Review) {
  const payment = await prisma.organizationPaymentConfiguration.findFirst({
    where: {
      id: review.paymentConfigurationId,
      workspaceId: review.workspaceId,
      environment: currentPaymentEnvironment(),
      provider: 'STRIPE',
    },
    select: { encryptedSecretKey: true },
  });
  if (!payment) throw missing();
  return new AesGcmPaymentSecretCrypto().decrypt(payment.encryptedSecretKey);
}

async function ensureCheckout(review: Review, secret: string) {
  if (review.providerCheckoutSessionId && isStripeCheckoutUrl(review.checkoutUrl))
    return { id: review.providerCheckoutSessionId, url: review.checkoutUrl };
  const path = instructorReviewPath(review.enrollmentId, review.id, review.topicId);
  const url = new URL(path, getServerEnvironment().APP_URL);
  const checkout = await new StripeCheckoutAdapter().create({
    secretKey: secret,
    idempotencyKey: `instructor-review-checkout:${review.id}`,
    purchaseId: review.id,
    workspaceId: review.workspaceId,
    offeringId: review.productRevision,
    productName: 'マナベル 講師レビュー（課題1件）',
    amountYen: review.amountYen,
    successUrl: `${url}&result=payment-return`,
    cancelUrl: `${url}&result=payment-cancel`,
    instructorReview: { terms: `回答目安 決済完了から${review.responseHours}時間以内` },
  });
  await prisma.instructorReview.updateMany({
    where: { id: review.id, status: 'PENDING_PAYMENT', providerCheckoutSessionId: null },
    data: { providerCheckoutSessionId: checkout.id, checkoutUrl: checkout.url },
  });
  return checkout;
}

export async function beginInstructorReview(
  input: LearnerKey & {
    submission: InstructorReviewApplication;
    individualOfferId?: string | undefined;
  },
) {
  const submission = instructorReviewApplication.parse(input.submission);
  const practice = await currentInstructorReviewPractice({ ...input, topicId: submission.topicId });
  if (practice.assignmentId !== submission.assignmentId)
    throw conflict('課題が変わりました。申込内容を確認し直してください。');
  const { workspaceId, groupId, groupMembershipId } = practice.actor.scope;
  const scope = { workspaceId, groupId };
  const review = await prisma.$transaction(async (tx) => {
    await lockScope(tx, scope);
    const buyer = {
      ...scope,
      enrollmentId: input.enrollmentId,
      groupMembershipId,
      buyerUserId: input.userId,
    };
    const existing = await tx.instructorReview.findFirst({
      where: {
        ...buyer,
        OR: [
          { requestKey: submission.idempotencyKey },
          { assignmentId: submission.assignmentId, status: { in: openStatuses } },
        ],
      },
    });
    if (existing) {
      if (
        existing.requestKey === submission.idempotencyKey &&
        (existing.focus !== submission.focus || existing.excerpt !== submission.excerpt)
      )
        throw conflict('共有する内容が変更されました。申込を確認してください。');
      return existing;
    }

    const now = new Date();
    const [offer, payment, enrollment, assignment] = await Promise.all([
      productInfo(tx, scope),
      tx.organizationPaymentConfiguration.findFirst({
        where: paymentWhere(workspaceId),
        select: { id: true },
      }),
      tx.programEnrollment.findFirst({
        where: {
          ...scope,
          id: input.enrollmentId,
          groupMembershipId,
          status: 'ACTIVE',
          startsAt: { lte: now },
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        },
        select: { serviceProgramId: true },
      }),
      tx.programMissionAssignment.findFirst({
        where: {
          ...scope,
          id: practice.assignmentId,
          programEnrollmentId: input.enrollmentId,
          status: 'STARTED',
        },
        select: { id: true },
      }),
    ]);
    if (
      !offer?.enabled ||
      !payment ||
      !enrollment ||
      !assignment ||
      !offer.programIds.includes(enrollment.serviceProgramId)
    )
      throw conflict('現在、講師レビューを受け付けていません。');
    if (offer.revision !== submission.productRevision)
      throw conflict('料金や受付条件が変わりました。申込内容を確認し直してください。');
    if ((await occupied(tx, scope)) >= offer.capacity)
      throw conflict('現在、受付枠が埋まっています。');
    if (
      input.individualOfferId &&
      !(await activeIndividualOffer(
        tx,
        {
          ...scope,
          programEnrollmentId: input.enrollmentId,
          missionAssignmentId: assignment.id,
        },
        uuid.parse(input.individualOfferId),
      ))
    )
      throw conflict('提案の受付状況が変わりました。申込内容を確認し直してください。');
    return tx.instructorReview.create({
      data: {
        ...buyer,
        assignmentId: assignment.id,
        topicId: practice.actor.topicId ?? null,
        paymentConfigurationId: payment.id,
        productRevision: offer.revision,
        requestKey: submission.idempotencyKey,
        source: input.individualOfferId ? 'OPERATOR_OFFER' : 'LEARNER',
        title: practice.title,
        planRevision: practice.planRevision,
        focus: submission.focus,
        excerpt: submission.excerpt,
        description: offer.description,
        amountYen: offer.priceYen,
        responseHours: offer.responseHours,
        cancellationTerms: offer.cancellationTerms,
        liveMode: currentPaymentEnvironment() === 'PRODUCTION',
      },
    });
  });
  if (review.assignmentId !== submission.assignmentId) throw conflict('申込内容が変わりました。');
  if (review.status !== 'PENDING_PAYMENT')
    return { url: instructorReviewPath(review.enrollmentId, review.id, review.topicId) };
  if (review.contentRedactedAt) throw missing();
  return { url: (await ensureCheckout(review, await paymentSecret(review))).url };
}

async function ownedReview(input: LearnerKey & { reviewId: string }) {
  const scope = await serviceScope(input.serviceSlug, input.userId);
  const review = await prisma.instructorReview.findFirst({
    where: {
      ...scope,
      id: uuid.parse(input.reviewId),
      enrollmentId: uuid.parse(input.enrollmentId),
      buyerUserId: input.userId,
    },
  });
  if (!review) throw missing();
  return { scope, review };
}

export async function resumeInstructorReview(input: LearnerKey & { reviewId: string }) {
  const { review } = await ownedReview(input);
  if (review.status !== 'PENDING_PAYMENT')
    return { url: instructorReviewPath(review.enrollmentId, review.id, review.topicId) };
  if (review.contentRedactedAt) throw missing();
  return { url: (await ensureCheckout(review, await paymentSecret(review))).url };
}

export async function cancelInstructorReview(input: LearnerKey & { reviewId: string }) {
  const { scope, review } = await ownedReview(input);
  if (review.status === 'CANCELLED') return;
  if (review.status !== 'PENDING_PAYMENT') throw conflict('決済済みの依頼は運営にご相談ください。');
  const secret = await paymentSecret(review);
  const session = await ensureCheckout(review, secret);
  try {
    await new StripeCheckoutExpirationAdapter().expire(
      secret,
      session.id,
      `instructor-review-expire:${review.id}`,
    );
  } catch (error) {
    const actual = z
      .object({ id: z.string(), status: z.string() })
      .parse(await new StripeCheckoutSessionRetrievalAdapter().retrieve(secret, session.id));
    if (actual.id !== session.id || actual.status !== 'expired') throw error;
  }
  await prisma.instructorReview.updateMany({
    where: { ...scope, id: review.id, status: 'PENDING_PAYMENT' },
    data: { status: 'CANCELLED', checkoutUrl: null },
  });
}

async function availableInstructors(tx: Tx, scope: Scope) {
  const rows = await tx.groupMembership.findMany({
    where: { ...scope, status: 'ACTIVE', user: { status: 'ACTIVE' } },
    select: { userId: true, user: { select: { displayName: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((row) => ({
    id: row.userId,
    label: row.user.displayName || row.user.email || row.userId,
  }));
}

export async function getInstructorReviewOperations(serviceSlug: string, userId: string) {
  const scope = await serviceScope(serviceSlug, userId, true);
  const [product, programs, instructors, rows] = await Promise.all([
    productInfo(prisma, scope),
    prisma.serviceProgram.findMany({
      where: programWhere(scope),
      select: { id: true, displayName: true },
      orderBy: { displayName: 'asc' },
    }),
    availableInstructors(prisma, scope),
    prisma.instructorReview.findMany({
      where: scope,
      take: 100,
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, instructorUserId: true, status: true, dueAt: true },
    }),
  ]);
  return {
    product,
    programs: programs.map(({ id, displayName }) => ({ id, label: displayName })),
    instructors,
    rows,
  };
}

export async function configureInstructorReview(
  serviceSlug: string,
  userId: string,
  product: InstructorReviewProduct,
) {
  const scope = await serviceScope(serviceSlug, userId, true);
  const settings = instructorReviewProduct.parse(product);
  await prisma.$transaction(async (tx) => {
    await lockScope(tx, scope);
    await managerInside(tx, scope, userId);
    const [programs, instructors] = await Promise.all([
      tx.serviceProgram.count({
        where: { ...programWhere(scope), id: { in: settings.programIds } },
      }),
      tx.groupMembership.count({
        where: {
          ...scope,
          status: 'ACTIVE',
          userId: { in: settings.instructorUserIds },
          user: { status: 'ACTIVE' },
        },
      }),
    ]);
    if (
      settings.enabled &&
      (programs !== settings.programIds.length || instructors !== settings.instructorUserIds.length)
    )
      throw missing();
    const revision = randomUUID();
    await tx.instructorReviewProduct.upsert({
      where: { workspaceId_groupId: scope },
      create: { ...scope, revision, settings },
      update: { revision, settings },
    });
  });
}

export async function assignInstructorReview(
  serviceSlug: string,
  userId: string,
  reviewId: string,
  instructorUserId: string,
) {
  const scope = await serviceScope(serviceSlug, userId, true);
  await prisma.$transaction(async (tx) => {
    await lockScope(tx, scope);
    await managerInside(tx, scope, userId);
    const product = await productInfo(tx, scope);
    const assignee = await tx.groupMembership.findFirst({
      where: {
        ...scope,
        status: 'ACTIVE',
        userId: uuid.parse(instructorUserId),
        user: { status: 'ACTIVE' },
      },
      select: { id: true },
    });
    if (!assignee || !product?.instructorUserIds.includes(instructorUserId)) throw missing();
    const updated = await tx.instructorReview.updateMany({
      where: {
        ...scope,
        id: uuid.parse(reviewId),
        buyerUserId: { not: instructorUserId },
        status: { in: ['ACCEPTED', 'IN_PROGRESS'] },
      },
      data: { instructorUserId, status: 'IN_PROGRESS' },
    });
    if (!updated.count) throw missing();
  });
}

export async function refundInstructorReview(
  serviceSlug: string,
  userId: string,
  reviewId: string,
) {
  const scope = await serviceScope(serviceSlug, userId, true);
  const review = await prisma.$transaction(async (tx) => {
    await lockScope(tx, scope);
    await managerInside(tx, scope, userId);
    const current = await tx.instructorReview.findFirst({
      where: {
        ...scope,
        id: uuid.parse(reviewId),
        status: { in: ['ACCEPTED', 'IN_PROGRESS', 'REFUND_PENDING'] },
      },
    });
    if (!current?.providerPaymentIntentId) throw missing();
    if (current.status !== 'REFUND_PENDING')
      await tx.instructorReview.update({
        where: { id: current.id },
        data: { status: 'REFUND_PENDING' },
      });
    return { review: current, intentId: current.providerPaymentIntentId };
  });
  await new StripeFullRefundAdapter().request(
    await paymentSecret(review.review),
    review.intentId,
    `instructor-review-refund:${review.review.id}`,
  );
}

export async function getAssignedInstructorReviews(serviceSlug: string, userId: string) {
  const scope = await serviceScope(serviceSlug, userId);
  const product = await productInfo(prisma, scope);
  if (!product?.instructorUserIds.includes(userId)) throw missing();
  return prisma.instructorReview.findMany({
    where: {
      ...scope,
      instructorUserId: userId,
      status: { in: [...assignedStatuses] },
      contentRedactedAt: null,
      membership: { user: { status: 'ACTIVE' } },
    },
    orderBy: { dueAt: 'asc' },
    take: 100,
    select: { id: true, title: true, focus: true, excerpt: true, planRevision: true, answer: true },
  });
}

export async function answerInstructorReview(
  serviceSlug: string,
  userId: string,
  reviewId: string,
  answer: string,
) {
  const scope = await serviceScope(serviceSlug, userId);
  const input = instructorReviewReply.parse({ reviewId, answer });
  const updated = await prisma.$transaction(async (tx) => {
    await lockScope(tx, scope);
    const product = await productInfo(tx, scope);
    if (!product?.instructorUserIds.includes(userId)) throw missing();
    if (
      !(await tx.groupMembership.findFirst({
        where: { ...scope, userId, status: 'ACTIVE', user: { status: 'ACTIVE' } },
        select: { id: true },
      }))
    )
      throw missing();
    const review = await tx.instructorReview.findFirst({
      where: {
        ...scope,
        id: input.reviewId,
        instructorUserId: userId,
        status: { in: [...assignedStatuses] },
        contentRedactedAt: null,
      },
    });
    if (!review || (review.answer !== null && review.answer !== input.answer)) throw missing();
    if (review.status === 'ANSWERED') return review;
    return tx.instructorReview.update({
      where: { id: review.id },
      data: { answer: input.answer, answeredAt: new Date(), status: 'ANSWERED' },
    });
  });
  await notifyInstructorReviewAnswered(
    updated,
    instructorReviewPath(updated.enrollmentId, updated.id, updated.topicId),
  );
}
