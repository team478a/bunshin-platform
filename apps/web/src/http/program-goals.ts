import 'server-only';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import {
  resolveManagedServiceContext,
  resolvePublicServiceContext,
} from '../services/public-service';

const uuid = z.string().uuid();
const mode = z.enum(['IDEA_ONLY', 'GUIDED', 'READY_TO_USE']);
const metric = z.enum(['ACTION', 'TRAFFIC', 'BUSINESS']);
const input = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('SET_SUPPORT_POLICY'),
    serviceProgramId: uuid,
    allowedSupportModes: z.array(mode).min(1).max(3),
    defaultSupportMode: mode,
    memberMayChoose: z.boolean(),
    guidance: z.string().trim().min(1).max(1000),
  }),
  z.object({
    action: z.literal('CREATE_GOAL_DEFINITION'),
    serviceProgramId: uuid,
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(1000),
    metricType: metric,
    unit: z.string().trim().min(1).max(40),
    suggestedTarget: z.number().positive().nullable(),
  }),
  z.object({
    action: z.literal('SAVE_PREFERENCE'),
    programEnrollmentId: uuid,
    preferredSupportMode: mode,
    notes: z.string().trim().max(500),
  }),
  z.object({
    action: z.literal('SET_MEMBER_GOAL'),
    programEnrollmentId: uuid,
    goalDefinitionId: uuid.nullable(),
    title: z.string().trim().min(1).max(160),
    metricType: metric,
    targetValue: z.number().positive(),
    unit: z.string().trim().min(1).max(40),
    dueAt: z.string().datetime().nullable(),
  }),
]);

const reply = (data: unknown, requestId: string, status = 200) =>
  Response.json({ data, requestId }, { status, headers: { 'cache-control': 'private, no-store' } });

export async function programGoalsResponse(request: Request, serviceSlug: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const value = input.parse(await request.json());
    const publicService = await resolvePublicServiceContext(serviceSlug);
    const db = await import('@bunshin/database');

    if (value.action === 'SET_SUPPORT_POLICY' || value.action === 'CREATE_GOAL_DEFINITION') {
      const service = await resolveManagedServiceContext(serviceSlug, actor.userId);
      const program = await db.prisma.serviceProgram.findFirst({
        where: {
          id: value.serviceProgramId,
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      if (!program) throw new ApplicationError('NOT_FOUND', 'program not found');
      if (value.action === 'CREATE_GOAL_DEFINITION') {
        const row = await db.prisma.programGoalDefinition.create({
          data: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            serviceProgramId: program.id,
            name: value.name,
            description: value.description,
            metricType: value.metricType,
            unit: value.unit,
            suggestedTarget: value.suggestedTarget,
            createdByUserId: actor.userId,
          },
        });
        return reply(row, requestId, 201);
      }
      if (!value.allowedSupportModes.includes(value.defaultSupportMode))
        throw new ApplicationError('VALIDATION_ERROR', 'default support mode unavailable');
      const row = await db.prisma.$transaction(async (tx) => {
        const current = await tx.serviceProgramSupportPolicy.findFirst({
          where: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            serviceProgramId: program.id,
            status: 'ACTIVE',
          },
        });
        if (current)
          await tx.serviceProgramSupportPolicy.update({
            where: { id: current.id },
            data: { status: 'SUPERSEDED', supersededAt: new Date() },
          });
        const latest = await tx.serviceProgramSupportPolicy.aggregate({
          where: { serviceProgramId: program.id },
          _max: { version: true },
        });
        const created = await tx.serviceProgramSupportPolicy.create({
          data: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            serviceProgramId: program.id,
            version: (latest._max.version ?? 0) + 1,
            allowedSupportModes: value.allowedSupportModes,
            defaultSupportMode: value.defaultSupportMode,
            memberMayChoose: value.memberMayChoose,
            guidance: value.guidance,
            createdByUserId: actor.userId,
          },
        });
        await tx.programAuditLog.create({
          data: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            resourceType: 'SERVICE_PROGRAM_SUPPORT_POLICY',
            resourceId: created.id,
            action: 'ACTIVATED',
            ...(current ? { beforeData: { id: current.id, version: current.version } } : {}),
            afterData: { id: created.id, version: created.version },
            performedByUserId: actor.userId,
          },
        });
        return created;
      });
      return reply(row, requestId, 201);
    }

    const membership = await db.prisma.groupMembership.findFirst({
      where: {
        workspaceId: publicService.workspaceId,
        groupId: publicService.serviceId,
        userId: actor.userId,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    if (!membership) throw new ApplicationError('FORBIDDEN', 'service membership required');
    const enrollment = await db.prisma.programEnrollment.findFirst({
      where: {
        id: value.programEnrollmentId,
        workspaceId: publicService.workspaceId,
        groupId: publicService.serviceId,
        groupMembershipId: membership.id,
        status: 'ACTIVE',
      },
    });
    if (!enrollment) throw new ApplicationError('NOT_FOUND', 'enrollment not found');
    if (value.action === 'SAVE_PREFERENCE') {
      const policy = await db.prisma.serviceProgramSupportPolicy.findFirst({
        where: {
          workspaceId: publicService.workspaceId,
          groupId: publicService.serviceId,
          serviceProgramId: enrollment.serviceProgramId,
          status: 'ACTIVE',
        },
      });
      const allowed = policy?.allowedSupportModes as string[] | undefined;
      if (!policy?.memberMayChoose || !allowed?.includes(value.preferredSupportMode))
        throw new ApplicationError('FORBIDDEN', 'support preference unavailable');
      const row = await db.prisma.programMemberPreference.upsert({
        where: { programEnrollmentId: enrollment.id },
        create: {
          workspaceId: publicService.workspaceId,
          groupId: publicService.serviceId,
          programEnrollmentId: enrollment.id,
          groupMembershipId: membership.id,
          preferredSupportMode: value.preferredSupportMode,
          notes: value.notes,
          updatedByUserId: actor.userId,
        },
        update: {
          preferredSupportMode: value.preferredSupportMode,
          notes: value.notes,
          updatedByUserId: actor.userId,
        },
      });
      return reply(row, requestId);
    }
    const definition = value.goalDefinitionId
      ? await db.prisma.programGoalDefinition.findFirst({
          where: {
            id: value.goalDefinitionId,
            workspaceId: publicService.workspaceId,
            groupId: publicService.serviceId,
            serviceProgramId: enrollment.serviceProgramId,
            status: 'ACTIVE',
          },
        })
      : null;
    if (value.goalDefinitionId && !definition)
      throw new ApplicationError('NOT_FOUND', 'goal definition not found');
    const startsAt = new Date();
    const dueAt = value.dueAt ? new Date(value.dueAt) : null;
    if (dueAt && dueAt <= startsAt)
      throw new ApplicationError('VALIDATION_ERROR', 'goal due date must be future');
    const row = await db.prisma.$transaction(async (tx) => {
      await tx.programMemberGoal.updateMany({
        where: {
          workspaceId: publicService.workspaceId,
          groupId: publicService.serviceId,
          programEnrollmentId: enrollment.id,
          status: 'ACTIVE',
        },
        data: { status: 'CANCELLED', updatedByUserId: actor.userId },
      });
      return tx.programMemberGoal.create({
        data: {
          workspaceId: publicService.workspaceId,
          groupId: publicService.serviceId,
          programEnrollmentId: enrollment.id,
          groupMembershipId: membership.id,
          goalDefinitionId: definition?.id ?? null,
          title: value.title,
          metricType: value.metricType,
          targetValue: value.targetValue,
          unit: value.unit,
          startsAt,
          dueAt,
          createdByUserId: actor.userId,
          updatedByUserId: actor.userId,
        },
      });
    });
    return reply(row, requestId, 201);
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
