import 'server-only';
import { parseAiResaleOfferTerms, parseAiResaleRuntimeSettings } from '@bunshin/capability-resale';
import { parseProgramProductTerms } from '@bunshin/application';
import type { Prisma, PrismaClient } from '@bunshin/database';
import { ApplicationError } from '@bunshin/shared';
import { currentPaymentEnvironment } from './secure-configuration';

type Db = PrismaClient | Prisma.TransactionClient;

export async function validatedDirectPurchaseContext(
  db: Db,
  input: {
    workspaceId: string;
    groupId: string;
    buyerUserId: string;
    offeringId: string;
  },
  options: { requireActivePayment?: boolean; requireActiveOffering?: boolean } = {},
) {
  const now = new Date();
  const [offering, paymentConfiguration, membership] = await Promise.all([
    db.programOffering.findFirst({
      where: {
        id: input.offeringId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        status:
          options.requireActiveOffering === false
            ? { in: ['ACTIVE', 'SUSPENDED', 'SUPERSEDED'] }
            : 'ACTIVE',
        isFree: false,
        ...(options.requireActiveOffering === false
          ? {}
          : {
              OR: [{ startsAt: null }, { startsAt: { lte: now } }],
              AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
            }),
      },
    }),
    db.organizationPaymentConfiguration.findUnique({
      where: {
        workspaceId_environment_provider: {
          workspaceId: input.workspaceId,
          environment: currentPaymentEnvironment(),
          provider: 'STRIPE',
        },
      },
    }),
    db.groupMembership.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.buyerUserId,
        serviceRole: 'PARTICIPANT',
        status: 'ACTIVE',
      },
    }),
  ]);
  const terms = offering ? parseProgramProductTerms(offering.termsSnapshot) : null;
  if (!offering || !membership || !terms) {
    throw new ApplicationError('NOT_FOUND', 'program product unavailable');
  }
  if (options.requireActiveOffering !== false) {
    const legalDocuments = await db.serviceLegalDocument.findMany({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        type: { in: ['TERMS', 'PRIVACY', 'COMMERCE_DISCLOSURE'] },
        status: 'PUBLISHED',
        effectiveAt: { lte: now },
      },
      select: { type: true },
    });
    if (new Set(legalDocuments.map(({ type }) => type)).size !== 3) {
      throw new ApplicationError('CONFIGURATION_ERROR', 'commerce legal documents are not ready');
    }
  }
  if (
    !paymentConfiguration ||
    ((options.requireActivePayment ?? true)
      ? paymentConfiguration.status !== 'ACTIVE'
      : !['ACTIVE', 'DISABLED'].includes(paymentConfiguration.status)) ||
    !paymentConfiguration.lastVerifiedAt ||
    !paymentConfiguration.encryptedWebhookSecret
  ) {
    throw new ApplicationError('CONFIGURATION_ERROR', 'organization payment is not active');
  }
  const [program, enrolled] = await Promise.all([
    db.serviceProgram.findFirst({
      where: {
        id: offering.serviceProgramId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        status: 'ACTIVE',
      },
    }),
    db.programEnrollment.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        groupMembershipId: membership.id,
        serviceProgramId: offering.serviceProgramId,
      },
      select: { id: true },
    }),
  ]);
  if (!program) throw new ApplicationError('NOT_FOUND', 'program product unavailable');
  if (enrolled) throw new ApplicationError('CONFLICT', 'member already has this program');
  return { offering, paymentConfiguration, membership, program, terms };
}

export async function validatedPurchaseContext(
  db: Db,
  input: {
    workspaceId: string;
    groupId: string;
    buyerUserId: string;
    sourceEnrollmentId: string;
    offeringId: string;
  },
  options: { requireActivePayment?: boolean } = {},
) {
  const [source, offering, paymentConfiguration] = await Promise.all([
    db.programEnrollment.findFirst({
      where: {
        id: input.sourceEnrollmentId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        status: 'COMPLETED',
      },
    }),
    db.programOffering.findFirst({
      where: {
        id: input.offeringId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        status: 'ACTIVE',
        isFree: false,
      },
    }),
    db.organizationPaymentConfiguration.findUnique({
      where: {
        workspaceId_environment_provider: {
          workspaceId: input.workspaceId,
          environment: currentPaymentEnvironment(),
          provider: 'STRIPE',
        },
      },
    }),
  ]);
  if (!source || !offering) throw new ApplicationError('NOT_FOUND', 'purchase target unavailable');
  if (
    !paymentConfiguration ||
    ((options.requireActivePayment ?? true)
      ? paymentConfiguration.status !== 'ACTIVE'
      : !['ACTIVE', 'DISABLED'].includes(paymentConfiguration.status)) ||
    !paymentConfiguration.lastVerifiedAt ||
    !paymentConfiguration.encryptedWebhookSecret
  ) {
    throw new ApplicationError('CONFIGURATION_ERROR', 'organization payment is not active');
  }
  const [membership, program, selection] = await Promise.all([
    db.groupMembership.findFirst({
      where: {
        id: source.groupMembershipId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.buyerUserId,
        serviceRole: 'PARTICIPANT',
        status: 'ACTIVE',
      },
    }),
    db.serviceProgram.findFirst({
      where: {
        id: offering.serviceProgramId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        status: 'ACTIVE',
      },
    }),
    db.programActionEvent.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        programEnrollmentId: source.id,
        sourceResourceType: 'PROGRAM_OFFERING',
        sourceResourceId: offering.id,
        eventType: { in: ['STANDARD_OFFER_SELECTED', 'MONITOR_OFFER_SELECTED'] },
        actorUserId: input.buyerUserId,
      },
    }),
  ]);
  const terms = parseAiResaleOfferTerms(offering.termsSnapshot);
  const runtime = program ? parseAiResaleRuntimeSettings(program.settings) : null;
  if (!membership || !program || !terms || runtime?.policyKey !== 'PAID_90D' || !selection) {
    throw new ApplicationError('FORBIDDEN', 'selected paid offer required');
  }
  return { source, offering, paymentConfiguration, membership, program, terms, runtime };
}
