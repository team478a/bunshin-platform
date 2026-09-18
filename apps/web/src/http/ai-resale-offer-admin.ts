import 'server-only';
import {
  AI_RESALE_V1_MODULE_KEY,
  parseAiResaleOfferTerms,
  parseAiResaleRuntimeSettings,
} from '@bunshin/capability-resale';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolveManagedServiceContext } from '../services/public-service';

const uuid = z.string().uuid();
const optionalHttpsUrl = z.union([z.literal(''), z.string().url().startsWith('https://')]);
const configurationSchema = z
  .object({
    standardAmountYen: z.number().int().min(1).max(10_000_000),
    standardApplicationUrl: optionalHttpsUrl,
    monitorAmountYen: z.number().int().min(1).max(10_000_000),
    monitorApplicationUrl: optionalHttpsUrl,
  })
  .strict();
const activationSchema = z
  .object({
    groupMembershipId: uuid,
    programOfferingId: uuid,
    paymentConfirmationReference: z.string().trim().min(1).max(160),
    idempotencyKey: uuid,
  })
  .strict();

async function managed(request: Request, serviceSlug: string) {
  requireSameOrigin(request);
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
  }
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId);
  return { actor, service };
}

const response = (data: unknown, requestId: string, status = 200) =>
  Response.json({ data, requestId }, { status, headers: { 'cache-control': 'private, no-store' } });

const failure = (error: unknown, requestId: string) => {
  const mapped = toApiError(error, requestId);
  return Response.json(mapped.body, {
    status: mapped.status,
    headers: { 'cache-control': 'private, no-store' },
  });
};

const offerSettings = (input: {
  runtime: NonNullable<ReturnType<typeof parseAiResaleRuntimeSettings>>;
  offerKey: 'STANDARD' | 'MONITOR';
}) => ({
  ...input.runtime,
  policyKey: 'PAID_90D' as const,
  automaticEnrollment: false,
  offerKey: input.offerKey,
});

export async function configureAiResaleOffersResponse(request: Request, serviceSlug: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const [{ actor, service }, value] = await Promise.all([
      managed(request, serviceSlug),
      configurationSchema.parseAsync(request.json()),
    ]);
    const db = await import('@bunshin/database');
    const data = await db.prisma.$transaction(
      async (tx) => {
        const programs = await tx.serviceProgram.findMany({
          where: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            status: 'ACTIVE',
            settings: { path: ['moduleKey'], equals: AI_RESALE_V1_MODULE_KEY },
          },
          orderBy: { createdAt: 'asc' },
        });
        const freeProgram = programs.find((program) => {
          try {
            return parseAiResaleRuntimeSettings(program.settings)?.policyKey === 'FREE_7D';
          } catch {
            return false;
          }
        });
        if (!freeProgram)
          throw new ApplicationError('NOT_FOUND', 'AI resale free program not found');
        const freeRuntime = parseAiResaleRuntimeSettings(freeProgram.settings)!;
        const configured = [];
        for (const offerKey of ['STANDARD', 'MONITOR'] as const) {
          const amountYen =
            offerKey === 'STANDARD' ? value.standardAmountYen : value.monitorAmountYen;
          const applicationUrl =
            (offerKey === 'STANDARD'
              ? value.standardApplicationUrl
              : value.monitorApplicationUrl) || null;
          const existingProgram = programs.find((program) => {
            try {
              const runtime = parseAiResaleRuntimeSettings(program.settings);
              return (
                runtime?.policyKey === 'PAID_90D' &&
                typeof program.settings === 'object' &&
                program.settings !== null &&
                !Array.isArray(program.settings) &&
                (program.settings as Record<string, unknown>)['offerKey'] === offerKey
              );
            } catch {
              return false;
            }
          });
          const displayName =
            offerKey === 'STANDARD'
              ? `${freeProgram.displayName} 90日プログラム`
              : `${freeProgram.displayName} 90日モニター`;
          const settings = offerSettings({ runtime: freeRuntime, offerKey });
          const program = existingProgram
            ? await tx.serviceProgram.update({
                where: { id: existingProgram.id },
                data: { displayName, status: 'ACTIVE', settings },
              })
            : await tx.serviceProgram.create({
                data: {
                  workspaceId: service.workspaceId,
                  groupId: service.serviceId,
                  programTemplateVersionId: freeProgram.programTemplateVersionId,
                  displayName,
                  description: '現在の状態から次の一歩を決めるAI物販90日プログラム',
                  status: 'ACTIVE',
                  settings,
                  createdByUserId: actor.userId,
                },
              });
          const termsSnapshot = {
            schemaVersion: 1,
            moduleKey: AI_RESALE_V1_MODULE_KEY,
            offerKey,
            amountYen,
            currency: 'JPY',
            durationDays: 90,
            billingMode: 'EXTERNAL_MANUAL',
            applicationUrl,
            supportModes: [freeRuntime.supportMode],
          };
          const existingOffering = await tx.programOffering.findFirst({
            where: {
              workspaceId: service.workspaceId,
              groupId: service.serviceId,
              serviceProgramId: program.id,
              status: 'ACTIVE',
              isFree: false,
            },
            orderBy: { version: 'desc' },
          });
          const offering = existingOffering
            ? await tx.programOffering.update({
                where: { id: existingOffering.id },
                data: {
                  priceReference: `manual:ai-resale:${offerKey.toLowerCase()}:${amountYen}`,
                  termsSnapshot,
                },
              })
            : await tx.programOffering.create({
                data: {
                  workspaceId: service.workspaceId,
                  groupId: service.serviceId,
                  serviceProgramId: program.id,
                  version: 1,
                  status: 'ACTIVE',
                  isFree: false,
                  priceReference: `manual:ai-resale:${offerKey.toLowerCase()}:${amountYen}`,
                  seller: 'SERVICE',
                  priceOwner: 'SERVICE',
                  paymentOwner: 'SERVICE',
                  apiCostOwner: 'SERVICE',
                  supportOwner: 'SERVICE',
                  contentOwner: 'SERVICE',
                  characterOwner: 'SERVICE',
                  termsSnapshot,
                  createdByUserId: actor.userId,
                },
              });
          await tx.programAuditLog.create({
            data: {
              workspaceId: service.workspaceId,
              groupId: service.serviceId,
              resourceType: 'PROGRAM_OFFERING',
              resourceId: offering.id,
              action: existingOffering ? 'UPDATED' : 'ACTIVATED',
              afterData: {
                serviceProgramId: program.id,
                offerKey,
                amountYen,
                billingMode: 'EXTERNAL_MANUAL',
                applicationUrl,
              },
              performedByUserId: actor.userId,
            },
          });
          configured.push({ program, offering });
        }
        return configured;
      },
      { isolationLevel: 'Serializable' },
    );
    return response(data, requestId);
  } catch (error) {
    return failure(error, requestId);
  }
}

export async function activateAiResalePaidEnrollmentResponse(
  request: Request,
  serviceSlug: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const [{ actor, service }, value] = await Promise.all([
      managed(request, serviceSlug),
      activationSchema.parseAsync(request.json()),
    ]);
    const db = await import('@bunshin/database');
    const eventKey = `ai-resale:paid-enrollment:${value.idempotencyKey}`;
    const data = await db.prisma.$transaction(
      async (tx) => {
        const existingEvent = await tx.programActionEvent.findUnique({
          where: {
            workspaceId_groupId_idempotencyKey: {
              workspaceId: service.workspaceId,
              groupId: service.serviceId,
              idempotencyKey: eventKey,
            },
          },
        });
        if (existingEvent?.sourceResourceId) {
          return tx.programEnrollment.findFirstOrThrow({
            where: {
              id: existingEvent.sourceResourceId,
              workspaceId: service.workspaceId,
              groupId: service.serviceId,
            },
          });
        }
        const [membership, offering] = await Promise.all([
          tx.groupMembership.findFirst({
            where: {
              id: value.groupMembershipId,
              workspaceId: service.workspaceId,
              groupId: service.serviceId,
              status: 'ACTIVE',
              serviceRole: 'PARTICIPANT',
            },
          }),
          tx.programOffering.findFirst({
            where: {
              id: value.programOfferingId,
              workspaceId: service.workspaceId,
              groupId: service.serviceId,
              status: 'ACTIVE',
              isFree: false,
            },
          }),
        ]);
        if (!membership || !offering)
          throw new ApplicationError('NOT_FOUND', 'paid enrollment target unavailable');
        const [paidProgram, servicePrograms] = await Promise.all([
          tx.serviceProgram.findFirst({
            where: {
              id: offering.serviceProgramId,
              workspaceId: service.workspaceId,
              groupId: service.serviceId,
              status: 'ACTIVE',
            },
          }),
          tx.serviceProgram.findMany({
            where: {
              workspaceId: service.workspaceId,
              groupId: service.serviceId,
              status: 'ACTIVE',
              settings: { path: ['moduleKey'], equals: AI_RESALE_V1_MODULE_KEY },
            },
          }),
        ]);
        const paidRuntime = paidProgram ? parseAiResaleRuntimeSettings(paidProgram.settings) : null;
        const terms = parseAiResaleOfferTerms(offering.termsSnapshot);
        if (!paidProgram || paidRuntime?.policyKey !== 'PAID_90D' || !terms) {
          throw new ApplicationError('NOT_FOUND', 'paid offering unavailable');
        }
        const freeProgramIds = servicePrograms.flatMap((program) => {
          try {
            return parseAiResaleRuntimeSettings(program.settings)?.policyKey === 'FREE_7D'
              ? [program.id]
              : [];
          } catch {
            return [];
          }
        });
        const paidProgramIds = servicePrograms.flatMap((program) => {
          try {
            return parseAiResaleRuntimeSettings(program.settings)?.policyKey === 'PAID_90D'
              ? [program.id]
              : [];
          } catch {
            return [];
          }
        });
        const [freeEnrollment, duplicate] = await Promise.all([
          tx.programEnrollment.findFirst({
            where: {
              workspaceId: service.workspaceId,
              groupId: service.serviceId,
              groupMembershipId: membership.id,
              serviceProgramId: { in: freeProgramIds },
              status: 'COMPLETED',
            },
            orderBy: { updatedAt: 'desc' },
          }),
          tx.programEnrollment.findFirst({
            where: {
              workspaceId: service.workspaceId,
              groupId: service.serviceId,
              groupMembershipId: membership.id,
              serviceProgramId: { in: paidProgramIds },
              status: 'ACTIVE',
            },
          }),
        ]);
        if (!freeEnrollment)
          throw new ApplicationError('FORBIDDEN', 'completed free trial required');
        if (duplicate) throw new ApplicationError('CONFLICT', 'paid enrollment already active');
        const [progress, selectionEvent] = await Promise.all([
          tx.programProgressSnapshot.findUnique({
            where: { programEnrollmentId: freeEnrollment.id },
          }),
          tx.programActionEvent.findFirst({
            where: {
              workspaceId: service.workspaceId,
              groupId: service.serviceId,
              programEnrollmentId: freeEnrollment.id,
              eventType:
                terms.offerKey === 'STANDARD'
                  ? 'STANDARD_OFFER_SELECTED'
                  : 'MONITOR_OFFER_SELECTED',
              sourceResourceType: 'PROGRAM_OFFERING',
              sourceResourceId: offering.id,
            },
          }),
        ]);
        if (!['NOT_STARTED', 'PARTIAL', 'LISTED'].includes(progress?.bottleneckKey ?? '')) {
          throw new ApplicationError('FORBIDDEN', 'DAY7 classification required');
        }
        if (!selectionEvent) {
          throw new ApplicationError('FORBIDDEN', 'participant offer selection required');
        }
        const now = new Date();
        const enrollment = await tx.programEnrollment.create({
          data: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            groupMembershipId: membership.id,
            serviceProgramId: paidProgram.id,
            programOfferingId: offering.id,
            status: 'ACTIVE',
            supportMode: paidRuntime.supportMode,
            goalSnapshot: {
              source: 'DAY7_PAID_OFFER',
              freeEnrollmentId: freeEnrollment.id,
              classification: progress!.bottleneckKey,
            },
            offeringSnapshot: {
              version: offering.version,
              isFree: false,
              priceReference: offering.priceReference,
              seller: offering.seller,
              priceOwner: offering.priceOwner,
              paymentOwner: offering.paymentOwner,
              apiCostOwner: offering.apiCostOwner,
              supportOwner: offering.supportOwner,
              contentOwner: offering.contentOwner,
              characterOwner: offering.characterOwner,
              terms: { ...terms, supportModes: [...terms.supportModes] },
              externalPaymentConfirmation: {
                reference: value.paymentConfirmationReference,
                confirmedAt: now,
                confirmedByUserId: actor.userId,
              },
            },
            invitedByUserId: actor.userId,
            startsAt: now,
            endsAt: db.addProgramCalendarDays(now, terms.durationDays, paidRuntime.timeZone),
          },
        });
        await tx.programActionEvent.create({
          data: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            programEnrollmentId: freeEnrollment.id,
            missionAssignmentId: null,
            eventType: 'PAID_ENROLLED',
            sourceResourceType: 'PROGRAM_ENROLLMENT',
            sourceResourceId: enrollment.id,
            idempotencyKey: eventKey,
            schemaVersion: 1,
            metadata: {
              paidEnrollmentId: enrollment.id,
              offeringId: offering.id,
              offerKind: terms.offerKey,
              amountYen: terms.amountYen,
              durationDays: terms.durationDays,
              paymentConfirmationReference: value.paymentConfirmationReference,
            },
            actorUserId: actor.userId,
            occurredAt: now,
          },
        });
        await tx.programAuditLog.create({
          data: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            resourceType: 'PROGRAM_ENROLLMENT',
            resourceId: enrollment.id,
            action: 'PAID_ENROLLED',
            afterData: {
              freeEnrollmentId: freeEnrollment.id,
              offeringId: offering.id,
              offerKey: terms.offerKey,
              startsAt: enrollment.startsAt,
              endsAt: enrollment.endsAt,
              paymentConfirmationReference: value.paymentConfirmationReference,
            },
            performedByUserId: actor.userId,
          },
        });
        return enrollment;
      },
      { isolationLevel: 'Serializable' },
    );
    return response(data, requestId, 201);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      return failure(
        new ApplicationError('CONFLICT', 'paid enrollment already recorded'),
        requestId,
      );
    }
    return failure(error, requestId);
  }
}
