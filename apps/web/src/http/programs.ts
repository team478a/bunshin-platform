import 'server-only';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolveManagedServiceContext } from '../services/public-service';

const uuid = z.string().uuid();
const supportMode = z.enum(['IDEA_ONLY', 'GUIDED', 'READY_TO_USE']);
const officialProgramSchema = z
  .object({
    workspaceId: uuid,
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(2000),
    category: z.string().trim().min(1).max(80),
    targetAudience: z.string().trim().min(1).max(500),
    standardDurationDays: z.number().int().min(1).max(365),
    supportModes: z.array(supportMode).min(1).max(3),
  })
  .strict();
const adoptSchema = z
  .object({
    programTemplateVersionId: uuid,
    displayName: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(2000),
    supportModes: z.array(supportMode).min(1).max(3),
  })
  .strict();
const enrollmentSchema = z
  .object({
    groupMembershipId: uuid,
    programOfferingId: uuid,
    supportMode,
    goal: z.string().trim().max(500).default(''),
  })
  .strict();

async function json(request: Request) {
  requireSameOrigin(request);
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return actor;
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

export async function createOfficialProgramResponse(request: Request) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const actor = await json(request);
    const value = officialProgramSchema.parse(await request.json());
    const db = await import('@bunshin/database');
    const data = await db.prisma.$transaction(async (tx) => {
      const [admin, workspace] = await Promise.all([
        tx.platformAdmin.findFirst({
          where: { userId: actor.userId, role: 'SUPER_ADMIN', status: 'ACTIVE' },
          select: { id: true },
        }),
        tx.workspace.findFirst({
          where: { id: value.workspaceId, status: 'ACTIVE', type: 'ORGANIZATION' },
          select: { id: true },
        }),
      ]);
      if (!admin) throw new ApplicationError('FORBIDDEN', 'platform administrator required');
      if (!workspace) throw new ApplicationError('NOT_FOUND', 'workspace not found');
      const template = await tx.programTemplate.create({
        data: {
          workspaceId: value.workspaceId,
          ownerGroupId: null,
          name: value.name,
          description: value.description,
          category: value.category,
          targetAudience: value.targetAudience,
          status: 'ACTIVE',
          visibility: 'PLATFORM',
          createdByUserId: actor.userId,
        },
      });
      const version = await tx.programTemplateVersion.create({
        data: {
          workspaceId: value.workspaceId,
          programTemplateId: template.id,
          version: 1,
          status: 'PUBLISHED',
          definition: {
            standardDurationDays: value.standardDurationDays,
            supportModes: value.supportModes,
            participation: 'INVITATION_ONLY',
          },
          createdByUserId: actor.userId,
          publishedAt: new Date(),
        },
      });
      await tx.programAuditLog.createMany({
        data: [
          {
            workspaceId: value.workspaceId,
            resourceType: 'PROGRAM_TEMPLATE',
            resourceId: template.id,
            action: 'CREATED',
            afterData: {
              id: template.id,
              name: template.name,
              status: template.status,
              visibility: template.visibility,
            },
            performedByUserId: actor.userId,
          },
          {
            workspaceId: value.workspaceId,
            resourceType: 'PROGRAM_TEMPLATE_VERSION',
            resourceId: version.id,
            action: 'PUBLISHED',
            afterData: {
              id: version.id,
              programTemplateId: version.programTemplateId,
              version: version.version,
              status: version.status,
            },
            performedByUserId: actor.userId,
          },
        ],
      });
      return { template, version };
    });
    return response(data, requestId, 201);
  } catch (error) {
    return failure(error, requestId);
  }
}

export async function adoptProgramResponse(request: Request, serviceSlug: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const actor = await json(request);
    const [service, value] = await Promise.all([
      resolveManagedServiceContext(serviceSlug, actor.userId),
      adoptSchema.parseAsync(request.json()),
    ]);
    const db = await import('@bunshin/database');
    const data = await db.prisma.$transaction(async (tx) => {
      const version = await tx.programTemplateVersion.findFirst({
        where: {
          id: value.programTemplateVersionId,
          workspaceId: service.workspaceId,
          status: 'PUBLISHED',
        },
      });
      if (!version) throw new ApplicationError('NOT_FOUND', 'program version not found');
      const template = await tx.programTemplate.findFirst({
        where: {
          id: version.programTemplateId,
          workspaceId: service.workspaceId,
          status: 'ACTIVE',
          OR: [{ visibility: 'PLATFORM' }, { ownerGroupId: service.serviceId }],
        },
      });
      if (!template) throw new ApplicationError('NOT_FOUND', 'program unavailable');
      const duplicate = await tx.serviceProgram.findFirst({
        where: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          programTemplateVersionId: version.id,
          status: { not: 'ARCHIVED' },
        },
        select: { id: true },
      });
      if (duplicate) throw new ApplicationError('CONFLICT', 'program already adopted');
      const program = await tx.serviceProgram.create({
        data: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          programTemplateVersionId: version.id,
          displayName: value.displayName,
          description: value.description,
          status: 'ACTIVE',
          settings: { supportModes: value.supportModes, participation: 'INVITATION_ONLY' },
          createdByUserId: actor.userId,
        },
      });
      const offering = await tx.programOffering.create({
        data: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          serviceProgramId: program.id,
          version: 1,
          status: 'ACTIVE',
          isFree: true,
          priceReference: null,
          seller: 'SERVICE',
          priceOwner: 'SERVICE',
          paymentOwner: 'SERVICE',
          apiCostOwner: 'SERVICE',
          supportOwner: 'SERVICE',
          contentOwner: 'SERVICE',
          characterOwner: 'SERVICE',
          termsSnapshot: {
            supportModes: value.supportModes,
            participation: 'INVITATION_ONLY',
            manualEnrollment: true,
          },
          createdByUserId: actor.userId,
        },
      });
      await tx.programAuditLog.createMany({
        data: [
          {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            resourceType: 'SERVICE_PROGRAM',
            resourceId: program.id,
            action: 'ADOPTED',
            afterData: {
              id: program.id,
              programTemplateVersionId: program.programTemplateVersionId,
              status: program.status,
            },
            performedByUserId: actor.userId,
          },
          {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            resourceType: 'PROGRAM_OFFERING',
            resourceId: offering.id,
            action: 'ACTIVATED',
            afterData: {
              id: offering.id,
              serviceProgramId: offering.serviceProgramId,
              version: offering.version,
              status: offering.status,
              isFree: offering.isFree,
            },
            performedByUserId: actor.userId,
          },
        ],
      });
      return { program, offering };
    });
    return response(data, requestId, 201);
  } catch (error) {
    return failure(error, requestId);
  }
}

export async function enrollProgramResponse(
  request: Request,
  serviceSlug: string,
  rawServiceProgramId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const actor = await json(request);
    const [service, value, serviceProgramId] = await Promise.all([
      resolveManagedServiceContext(serviceSlug, actor.userId),
      enrollmentSchema.parseAsync(request.json()),
      uuid.parseAsync(rawServiceProgramId),
    ]);
    const db = await import('@bunshin/database');
    const data = await db.prisma.$transaction(async (tx) => {
      const [membership, program, offering, duplicate] = await Promise.all([
        tx.groupMembership.findFirst({
          where: {
            id: value.groupMembershipId,
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            status: 'ACTIVE',
            serviceRole: 'PARTICIPANT',
          },
        }),
        tx.serviceProgram.findFirst({
          where: {
            id: serviceProgramId,
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            status: 'ACTIVE',
          },
        }),
        tx.programOffering.findFirst({
          where: {
            id: value.programOfferingId,
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            serviceProgramId,
            status: 'ACTIVE',
            isFree: true,
          },
        }),
        tx.programEnrollment.findFirst({
          where: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            groupMembershipId: value.groupMembershipId,
            serviceProgramId,
          },
          select: { id: true },
        }),
      ]);
      if (!membership || !program || !offering)
        throw new ApplicationError('NOT_FOUND', 'enrollment target unavailable');
      if (duplicate) throw new ApplicationError('CONFLICT', 'member already enrolled');
      const terms = offering.termsSnapshot as {
        supportModes?: string[];
        participation?: string;
      };
      if (
        terms.participation !== 'INVITATION_ONLY' ||
        !terms.supportModes?.includes(value.supportMode)
      )
        throw new ApplicationError('FORBIDDEN', 'support mode unavailable');
      const now = new Date();
      const enrollment = await tx.programEnrollment.create({
        data: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          groupMembershipId: membership.id,
          serviceProgramId: program.id,
          programOfferingId: offering.id,
          status: 'ACTIVE',
          supportMode: value.supportMode,
          goalSnapshot: { goal: value.goal },
          offeringSnapshot: {
            version: offering.version,
            isFree: offering.isFree,
            seller: offering.seller,
            apiCostOwner: offering.apiCostOwner,
            supportOwner: offering.supportOwner,
            contentOwner: offering.contentOwner,
            characterOwner: offering.characterOwner,
            terms: offering.termsSnapshot,
          },
          invitedByUserId: actor.userId,
          startsAt: now,
        },
      });
      await tx.programAuditLog.create({
        data: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          resourceType: 'PROGRAM_ENROLLMENT',
          resourceId: enrollment.id,
          action: 'ACTIVATED',
          afterData: {
            id: enrollment.id,
            groupMembershipId: enrollment.groupMembershipId,
            serviceProgramId: enrollment.serviceProgramId,
            programOfferingId: enrollment.programOfferingId,
            supportMode: enrollment.supportMode,
            status: enrollment.status,
          },
          performedByUserId: actor.userId,
        },
      });
      return enrollment;
    });
    return response(data, requestId, 201);
  } catch (error) {
    return failure(error, requestId);
  }
}
