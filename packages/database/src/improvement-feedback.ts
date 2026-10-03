import {
  validateImprovementFeedback,
  type ImprovementFeedbackInput,
  type ImprovementFeedbackRepository,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import type { PrismaClient } from '@prisma/client';
import { prisma } from './client';

export class PrismaImprovementFeedbackRepository implements ImprovementFeedbackRepository {
  constructor(private readonly client: PrismaClient = prisma) {}
  record(input: ImprovementFeedbackInput) {
    validateImprovementFeedback(input);
    return this.client.$transaction(async (tx) => {
      // Serialize replays, including different Bunshin/Service payloads for the same key.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`improvement-feedback:${input.workspaceId}:${input.actorUserId}`}))`;
      const owner = await tx.bunshin.findFirst({
        where: {
          id: input.bunshinId,
          workspaceId: input.workspaceId,
          groupId: input.serviceId,
          ownerUserId: input.actorUserId,
          status: { in: ['DRAFT', 'ACTIVE', 'PAUSED'] },
          ownerUser: { status: 'ACTIVE' },
          capabilityAssignments: {
            some: { workspaceId: input.workspaceId, capabilityType: 'SOCIAL', status: 'ACTIVE' },
          },
          group: {
            status: 'ACTIVE',
            workspace: { status: 'ACTIVE' },
            serviceConfiguration: { isNot: null },
            memberships: {
              some: { workspaceId: input.workspaceId, userId: input.actorUserId, status: 'ACTIVE' },
            },
          },
        },
        select: { id: true },
      });
      if (!owner) throw new ApplicationError('NOT_FOUND', 'feedback scope not found');
      const existing = await tx.improvementFeedback.findUnique({
        where: {
          workspaceId_actorUserId_submissionKey: {
            workspaceId: input.workspaceId,
            actorUserId: input.actorUserId,
            submissionKey: input.submissionKey,
          },
        },
      });
      if (existing) {
        if (
          existing.serviceId !== input.serviceId ||
          existing.bunshinId !== input.bunshinId ||
          existing.packageKey !== input.packageKey ||
          existing.category !== input.category ||
          existing.surface !== input.surface ||
          existing.impact !== input.impact
        )
          throw new ApplicationError('CONFLICT', 'feedback submission key reused');
        return { id: existing.id, createdAt: existing.createdAt };
      }
      const recent = await tx.improvementFeedback.count({
        where: {
          workspaceId: input.workspaceId,
          actorUserId: input.actorUserId,
          createdAt: { gte: new Date(Date.now() - 86_400_000) },
        },
      });
      if (recent >= 10) throw new ApplicationError('CONFLICT', 'feedback daily limit reached');
      const row = await tx.improvementFeedback.create({ data: input });
      return { id: row.id, createdAt: row.createdAt };
    });
  }
}
