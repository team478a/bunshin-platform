import {
  trainingLifecycleTarget,
  AI_TRAINING_V1_MODULE_KEY,
  type TrainingLifecycleRepository,
  type TrainingLifecycleChange,
  type TrainingLifecycleResult,
} from '@bunshin/capability-training';
import { type PrismaClient, Prisma } from '@prisma/client';
import { prisma } from './index';
import { lockTrainingEnrollmentData } from './training-data-lock';
import { stopTrainingEnrollmentEvaluations } from './training-evaluation-stop';

export class PrismaTrainingLifecycleRepository implements TrainingLifecycleRepository {
  constructor(private readonly client: PrismaClient = prisma) {}
  async change(input: TrainingLifecycleChange): Promise<TrainingLifecycleResult> {
    const target = trainingLifecycleTarget(input.expectedStatus, input.action);
    if (!target) return { outcome: 'CONFLICT' };
    try {
      return await this.client.$transaction(
        async (tx): Promise<TrainingLifecycleResult> => {
          const scope = { workspaceId: input.workspaceId, groupId: input.groupId };
          const admin = await tx.groupMembership.findFirst({
            where: {
              ...scope,
              userId: input.actorUserId,
              status: 'ACTIVE',
              serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
              user: { status: 'ACTIVE' },
              group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
            },
            select: { id: true },
          });
          if (!admin) return { outcome: 'FORBIDDEN' };
          const enrollment = await tx.programEnrollment.findFirst({
            where: { ...scope, id: input.programEnrollmentId },
            select: { groupMembershipId: true },
          });
          if (!enrollment) return { outcome: 'NOT_FOUND' };
          const member = await tx.groupMembership.findFirst({
            where: { ...scope, id: enrollment.groupMembershipId, serviceRole: 'PARTICIPANT' },
            select: { userId: true, status: true, user: { select: { status: true } } },
          });
          if (!member) return { outcome: 'NOT_FOUND' };
          await lockTrainingEnrollmentData(tx, {
            ...scope,
            programEnrollmentId: input.programEnrollmentId,
            actorUserId: member.userId,
          });
          const current = await tx.programEnrollment.findFirst({
            where: {
              ...scope,
              id: input.programEnrollmentId,
              groupMembershipId: enrollment.groupMembershipId,
            },
            select: {
              status: true,
              updatedAt: true,
              startsAt: true,
              endsAt: true,
              serviceProgramId: true,
            },
          });
          if (!current) return { outcome: 'NOT_FOUND' };
          const program = await tx.serviceProgram.findFirst({
            where: {
              ...scope,
              id: current.serviceProgramId,
              settings: { path: ['moduleKey'], equals: AI_TRAINING_V1_MODULE_KEY },
            },
            select: { status: true },
          });
          if (!program) return { outcome: 'NOT_FOUND' };
          const auditScope = {
            ...scope,
            resourceType: 'PROGRAM_ENROLLMENT',
            resourceId: input.programEnrollmentId,
            action: `TRAINING_${input.action}`,
            performedByUserId: input.actorUserId,
          };
          const previous = await tx.programAuditLog.findFirst({
            where: {
              ...auditScope,
              afterData: { path: ['operationId'], equals: input.operationId },
            },
            select: { beforeData: true, afterData: true },
          });
          if (previous) {
            const data = previous.afterData as Record<string, unknown> | null;
            if (
              data?.['expectedStatus'] !== input.expectedStatus ||
              data?.['expectedUpdatedAt'] !== input.expectedUpdatedAt.toISOString() ||
              data?.['reason'] !== input.reason
            )
              return { outcome: 'CONFLICT' };
            return { outcome: 'ALREADY_APPLIED', status: target };
          }
          if (
            current.status !== input.expectedStatus ||
            current.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()
          )
            return { outcome: 'CONFLICT' };
          if (
            target === 'ACTIVE' &&
            (program.status !== 'ACTIVE' ||
              member.status !== 'ACTIVE' ||
              member.user.status !== 'ACTIVE' ||
              !current.startsAt ||
              (current.startsAt && current.startsAt > input.now) ||
              (current.endsAt && current.endsAt <= input.now))
          )
            return { outcome: 'REOPEN_UNAVAILABLE' };
          const updated = await tx.programEnrollment.updateMany({
            where: {
              ...scope,
              id: input.programEnrollmentId,
              groupMembershipId: enrollment.groupMembershipId,
              status: input.expectedStatus,
              updatedAt: input.expectedUpdatedAt,
            },
            data: { status: target },
          });
          if (updated.count !== 1) return { outcome: 'CONFLICT' };
          if (target !== 'ACTIVE') {
            await stopTrainingEnrollmentEvaluations(
              tx,
              {
                ...scope,
                programEnrollmentId: input.programEnrollmentId,
                actorUserId: member.userId,
              },
              input.now,
            );
          }
          await tx.programAuditLog.create({
            data: {
              ...auditScope,
              beforeData: { status: current.status },
              afterData: {
                status: target,
                operationId: input.operationId,
                expectedStatus: input.expectedStatus,
                expectedUpdatedAt: input.expectedUpdatedAt.toISOString(),
                reason: input.reason,
              },
              performedAt: input.now,
            },
          });
          return { outcome: 'APPLIED', status: target };
        },
        { isolationLevel: 'Serializable', timeout: 30000 },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')
        return { outcome: 'CONFLICT' };
      throw error;
    }
  }
}
