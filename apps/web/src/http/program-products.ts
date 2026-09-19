import 'server-only';
import {
  createProgramProductTerms,
  parseProgramProductTerms,
  PROGRAM_SUPPORT_MODES,
} from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolveManagedServiceContext } from '../services/public-service';

const schema = z
  .object({
    serviceProgramId: z.string().uuid(),
    amountYen: z.number().int().min(1).max(10_000_000),
    durationDays: z.number().int().min(1).max(3_650),
    supportMode: z.enum(PROGRAM_SUPPORT_MODES),
  })
  .strict();

const response = (data: unknown, requestId: string, status = 200) =>
  Response.json({ data, requestId }, { status, headers: { 'cache-control': 'private, no-store' } });

const failure = (error: unknown, requestId: string) => {
  const mapped = toApiError(error, requestId);
  return Response.json(mapped.body, {
    status: mapped.status,
    headers: { 'cache-control': 'private, no-store' },
  });
};

const isAiResale = (settings: unknown) =>
  typeof settings === 'object' &&
  settings !== null &&
  !Array.isArray(settings) &&
  (settings as Record<string, unknown>)['moduleKey'] === 'AI_RESALE_V1';

const requiredCommerceDocuments = ['TERMS', 'PRIVACY', 'COMMERCE_DISCLOSURE'] as const;

export async function configureProgramProductResponse(request: Request, serviceSlug: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json')) {
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    }
    const [actor, value] = await Promise.all([
      (await currentUserProvider()).getCurrentUser(),
      schema.parseAsync(request.json()),
    ]);
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const service = await resolveManagedServiceContext(serviceSlug, actor.userId);
    const terms = createProgramProductTerms({
      amountYen: value.amountYen,
      durationDays: value.durationDays,
      supportMode: value.supportMode,
      timeZone: 'Asia/Tokyo',
    });
    const db = await import('@bunshin/database');
    const offering = await db.prisma.$transaction(
      async (tx) => {
        const legalDocuments = await tx.serviceLegalDocument.findMany({
          where: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            type: { in: [...requiredCommerceDocuments] },
            status: 'PUBLISHED',
            effectiveAt: { lte: new Date() },
          },
          select: { type: true },
        });
        if (
          new Set(legalDocuments.map(({ type }) => type)).size !== requiredCommerceDocuments.length
        ) {
          throw new ApplicationError(
            'CONFIGURATION_ERROR',
            '利用規約、プライバシーポリシー、特定商取引法に基づく表示を公開してください',
          );
        }
        const program = await tx.serviceProgram.findFirst({
          where: {
            id: value.serviceProgramId,
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            status: 'ACTIVE',
          },
        });
        if (!program) throw new ApplicationError('NOT_FOUND', 'program unavailable');
        if (isAiResale(program.settings)) {
          throw new ApplicationError(
            'VALIDATION_ERROR',
            'AI resale pricing must use its dedicated offer settings',
          );
        }
        const [latest, activeOfferings] = await Promise.all([
          tx.programOffering.aggregate({
            where: { serviceProgramId: program.id },
            _max: { version: true },
          }),
          tx.programOffering.findMany({
            where: {
              workspaceId: service.workspaceId,
              groupId: service.serviceId,
              serviceProgramId: program.id,
              status: 'ACTIVE',
              isFree: false,
            },
            select: { id: true },
          }),
        ]);
        if (activeOfferings.length > 0) {
          const pendingPurchase = await tx.programPurchase.findFirst({
            where: {
              workspaceId: service.workspaceId,
              groupId: service.serviceId,
              programOfferingId: { in: activeOfferings.map(({ id }) => id) },
              OR: [
                { status: 'CREATED' },
                { status: 'CHECKOUT_OPEN', checkoutExpiresAt: { gt: new Date() } },
              ],
            },
            select: { id: true },
          });
          if (pendingPurchase) {
            throw new ApplicationError(
              'CONFLICT',
              'active checkout must expire before changing product terms',
            );
          }
        }
        await tx.programOffering.updateMany({
          where: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            serviceProgramId: program.id,
            status: 'ACTIVE',
          },
          data: { status: 'SUPERSEDED' },
        });
        const created = await tx.programOffering.create({
          data: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            serviceProgramId: program.id,
            version: (latest._max.version ?? 0) + 1,
            status: 'ACTIVE',
            isFree: false,
            priceReference: `program:${program.id}:v${(latest._max.version ?? 0) + 1}`,
            seller: 'SERVICE',
            priceOwner: 'SERVICE',
            paymentOwner: 'SERVICE',
            apiCostOwner: 'SERVICE',
            supportOwner: 'SERVICE',
            contentOwner: 'SERVICE',
            characterOwner: 'SERVICE',
            termsSnapshot: { ...terms },
            createdByUserId: actor.userId,
          },
        });
        await tx.programAuditLog.create({
          data: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            resourceType: 'PROGRAM_OFFERING',
            resourceId: created.id,
            action: 'ACTIVATED',
            afterData: {
              serviceProgramId: program.id,
              version: created.version,
              productKind: terms.productKind,
              amountYen: terms.amountYen,
              currency: terms.currency,
              durationDays: terms.durationDays,
              supportMode: terms.supportMode,
            },
            performedByUserId: actor.userId,
          },
        });
        return created;
      },
      { isolationLevel: 'Serializable' },
    );
    return response(offering, requestId, 201);
  } catch (error) {
    return failure(error, requestId);
  }
}

export async function disableProgramProductResponse(
  request: Request,
  serviceSlug: string,
  rawOfferingId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const [service, offeringId, db] = await Promise.all([
      resolveManagedServiceContext(serviceSlug, actor.userId),
      z.string().uuid().parseAsync(rawOfferingId),
      import('@bunshin/database'),
    ]);
    const disabled = await db.prisma.$transaction(async (tx) => {
      const offering = await tx.programOffering.findFirst({
        where: {
          id: offeringId,
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          status: 'ACTIVE',
          isFree: false,
        },
      });
      if (!offering || !parseProgramProductTerms(offering.termsSnapshot)) {
        throw new ApplicationError('NOT_FOUND', 'program product unavailable');
      }
      const updated = await tx.programOffering.update({
        where: { id: offering.id },
        data: { status: 'SUSPENDED' },
      });
      await tx.programAuditLog.create({
        data: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          resourceType: 'PROGRAM_OFFERING',
          resourceId: offering.id,
          action: 'SUSPENDED',
          beforeData: { status: offering.status },
          afterData: { status: updated.status },
          performedByUserId: actor.userId,
        },
      });
      return updated;
    });
    return response(disabled, requestId);
  } catch (error) {
    return failure(error, requestId);
  }
}
