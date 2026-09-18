import {
  AI_RESALE_OFFER_DECLINE_REASONS,
  AI_RESALE_V1_MODULE_KEY,
  parseAiResaleOfferTerms,
  parseAiResaleRuntimeSettings,
  resolveAiResaleOfferState,
  type AiResaleOfferAction,
  type AiResaleOfferDeclineReason,
  type AiResaleOfferKind,
  type AiResaleOfferOption,
  type AiResaleOfferRepository,
  type DaySevenClassification,
} from '@bunshin/capability-resale';
import { Prisma, type PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;
type OfferInput = {
  workspaceId: string;
  groupId: string;
  actorUserId: string;
  freeEnrollmentId: string;
  now: Date;
};

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function eventOfferKind(value: unknown): AiResaleOfferKind | null {
  if (!object(value)) return null;
  return ['STANDARD', 'MONITOR'].includes(String(value['offerKind']))
    ? (value['offerKind'] as AiResaleOfferKind)
    : null;
}

function eventDeclineReason(value: unknown): AiResaleOfferDeclineReason | null {
  if (!object(value)) return null;
  return AI_RESALE_OFFER_DECLINE_REASONS.includes(value['reason'] as AiResaleOfferDeclineReason)
    ? (value['reason'] as AiResaleOfferDeclineReason)
    : null;
}

async function loadOfferState(db: Db, input: OfferInput) {
  const freeEnrollment = await db.programEnrollment.findFirst({
    where: {
      id: input.freeEnrollmentId,
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      status: 'COMPLETED',
      startsAt: { not: null },
    },
  });
  if (!freeEnrollment) return null;
  const [membership, freeProgram, progress] = await Promise.all([
    db.groupMembership.findFirst({
      where: {
        id: freeEnrollment.groupMembershipId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.actorUserId,
        serviceRole: 'PARTICIPANT',
        status: 'ACTIVE',
      },
    }),
    db.serviceProgram.findFirst({
      where: {
        id: freeEnrollment.serviceProgramId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        status: 'ACTIVE',
        settings: { path: ['moduleKey'], equals: AI_RESALE_V1_MODULE_KEY },
      },
    }),
    db.programProgressSnapshot.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        programEnrollmentId: freeEnrollment.id,
      },
    }),
  ]);
  if (!membership || !freeProgram || !progress) return null;
  const freeSettings = parseAiResaleRuntimeSettings(freeProgram.settings);
  if (freeSettings?.policyKey !== 'FREE_7D') return null;
  if (!['NOT_STARTED', 'PARTIAL', 'LISTED'].includes(progress.bottleneckKey ?? '')) return null;
  const classification = progress.bottleneckKey as DaySevenClassification;

  const programRows = await db.serviceProgram.findMany({
    where: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      status: 'ACTIVE',
      settings: { path: ['moduleKey'], equals: AI_RESALE_V1_MODULE_KEY },
    },
  });
  const paidPrograms = programRows.flatMap((program) => {
    try {
      const settings = parseAiResaleRuntimeSettings(program.settings);
      return settings?.policyKey === 'PAID_90D' ? [{ program, settings }] : [];
    } catch {
      return [];
    }
  });
  const paidProgramIds = paidPrograms.map(({ program }) => program.id);
  const [offeringRows, events, paidEnrollment] = await Promise.all([
    paidProgramIds.length === 0
      ? Promise.resolve([])
      : db.programOffering.findMany({
          where: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            serviceProgramId: { in: paidProgramIds },
            status: 'ACTIVE',
            isFree: false,
            OR: [{ startsAt: null }, { startsAt: { lte: input.now } }],
            AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: input.now } }] }],
          },
          orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
        }),
    db.programActionEvent.findMany({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        programEnrollmentId: freeEnrollment.id,
        eventType: {
          in: ['STANDARD_OFFER_DECLINED', 'STANDARD_OFFER_SELECTED', 'MONITOR_OFFER_SELECTED'],
        },
      },
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
    }),
    paidProgramIds.length === 0
      ? Promise.resolve(null)
      : db.programEnrollment.findFirst({
          where: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            groupMembershipId: membership.id,
            serviceProgramId: { in: paidProgramIds },
            status: 'ACTIVE',
            startsAt: { lte: input.now },
            OR: [{ endsAt: null }, { endsAt: { gt: input.now } }],
          },
          orderBy: { startsAt: 'desc' },
        }),
  ]);

  const options = offeringRows.flatMap((offering): AiResaleOfferOption[] => {
    const terms = parseAiResaleOfferTerms(offering.termsSnapshot);
    const runtime = paidPrograms.find(({ program }) => program.id === offering.serviceProgramId);
    if (
      !terms ||
      !offering.priceReference ||
      !runtime ||
      !terms.supportModes.includes(runtime.settings.supportMode)
    ) {
      return [];
    }
    return [
      {
        offeringId: offering.id,
        serviceProgramId: offering.serviceProgramId,
        displayName: runtime.program.displayName,
        priceReference: offering.priceReference,
        terms,
      },
    ];
  });
  const standardOffer = options.find(({ terms }) => terms.offerKey === 'STANDARD') ?? null;
  const monitorOffer = options.find(({ terms }) => terms.offerKey === 'MONITOR') ?? null;
  const decline = [...events]
    .reverse()
    .find(({ eventType }) => eventType === 'STANDARD_OFFER_DECLINED');
  const selection = [...events]
    .reverse()
    .find(({ eventType }) =>
      ['STANDARD_OFFER_SELECTED', 'MONITOR_OFFER_SELECTED'].includes(eventType),
    );
  return resolveAiResaleOfferState({
    freeEnrollmentId: freeEnrollment.id,
    classification,
    standardOffer,
    monitorOffer,
    declineReason: decline ? eventDeclineReason(decline.metadata) : null,
    selectedOfferKind: selection ? eventOfferKind(selection.metadata) : null,
    paidEnrollmentId: paidEnrollment?.id ?? null,
  });
}

function eventFor(action: AiResaleOfferAction) {
  if (action.type === 'VIEW') {
    return action.offerKind === 'STANDARD' ? 'STANDARD_OFFER_SHOWN' : 'MONITOR_OFFER_SHOWN';
  }
  if (action.type === 'DECLINE_STANDARD') return 'STANDARD_OFFER_DECLINED';
  return action.offerKind === 'STANDARD' ? 'STANDARD_OFFER_SELECTED' : 'MONITOR_OFFER_SELECTED';
}

function keyFor(input: OfferInput, action: AiResaleOfferAction, offeringId: string) {
  return action.type === 'VIEW'
    ? `ai-resale:offer:shown:${input.freeEnrollmentId}:${offeringId}`
    : `ai-resale:offer:${action.idempotencyKey}`;
}

export class PrismaAiResaleOfferRepository implements AiResaleOfferRepository {
  constructor(private readonly client: PrismaClient) {}

  findState(input: OfferInput) {
    return loadOfferState(this.client, input);
  }

  async applyAction(input: OfferInput & { action: AiResaleOfferAction; occurredAt: Date }) {
    let eventKey: string | null = null;
    try {
      return await this.client.$transaction(
        async (tx) => {
          const state = await loadOfferState(tx, { ...input, now: input.occurredAt });
          if (!state) return 'NOT_FOUND' as const;
          const offer = state.offer;
          const allowed =
            offer !== null &&
            ((input.action.type === 'VIEW' &&
              ((state.status === 'STANDARD' && input.action.offerKind === 'STANDARD') ||
                (state.status === 'MONITOR' && input.action.offerKind === 'MONITOR'))) ||
              (input.action.type === 'DECLINE_STANDARD' && state.status === 'STANDARD') ||
              (input.action.type === 'SELECT' &&
                ((state.status === 'STANDARD' && input.action.offerKind === 'STANDARD') ||
                  (state.status === 'MONITOR' && input.action.offerKind === 'MONITOR'))));
          if (!allowed) return 'STALE' as const;
          eventKey = keyFor(input, input.action, offer.offeringId);
          const existing = await tx.programActionEvent.findUnique({
            where: {
              workspaceId_groupId_idempotencyKey: {
                workspaceId: input.workspaceId,
                groupId: input.groupId,
                idempotencyKey: eventKey,
              },
            },
          });
          if (existing) {
            return existing.programEnrollmentId === input.freeEnrollmentId &&
              existing.actorUserId === input.actorUserId &&
              existing.eventType === eventFor(input.action)
              ? ('ALREADY_APPLIED' as const)
              : ('STALE' as const);
          }
          await tx.programActionEvent.create({
            data: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              programEnrollmentId: input.freeEnrollmentId,
              missionAssignmentId: null,
              eventType: eventFor(input.action),
              sourceResourceType: 'PROGRAM_OFFERING',
              sourceResourceId: offer.offeringId,
              idempotencyKey: eventKey,
              schemaVersion: 1,
              metadata: {
                offerKind: offer.terms.offerKey,
                offeringId: offer.offeringId,
                serviceProgramId: offer.serviceProgramId,
                amountYen: offer.terms.amountYen,
                currency: offer.terms.currency,
                durationDays: offer.terms.durationDays,
                ...(input.action.type === 'DECLINE_STANDARD'
                  ? { reason: input.action.reason }
                  : {}),
              },
              actorUserId: input.actorUserId,
              occurredAt: input.occurredAt,
            },
          });
          return 'APPLIED' as const;
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2034'].includes(error.code)
      ) {
        if (!eventKey) return 'STALE';
        const existing = await this.client.programActionEvent.findUnique({
          where: {
            workspaceId_groupId_idempotencyKey: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              idempotencyKey: eventKey,
            },
          },
        });
        return existing?.programEnrollmentId === input.freeEnrollmentId &&
          existing.actorUserId === input.actorUserId &&
          existing.eventType === eventFor(input.action)
          ? 'ALREADY_APPLIED'
          : 'STALE';
      }
      throw error;
    }
  }
}
