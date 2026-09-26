import type { AiResaleRuntimeRepository } from '@bunshin/capability-resale';
import { Prisma, type PrismaClient } from '@prisma/client';
import {
  activeRuntimeScope,
  nextProgramState,
  sameDecision,
  StaleRuntimeWrite,
} from './resale-runtime-state';

export class PrismaAiResaleRuntimeDecisionRepository {
  constructor(private readonly client: PrismaClient) {}

  async persistDecision(input: Parameters<AiResaleRuntimeRepository['persistDecision']>[0]) {
    try {
      return await this.client.$transaction(
        async (tx) => {
          const enrollment = await activeRuntimeScope(tx, input.candidate);
          if (!enrollment) return 'NOT_FOUND' as const;
          const progress = await tx.programProgressSnapshot.findUnique({
            where: { programEnrollmentId: enrollment.id },
          });
          if ((progress?.revision ?? null) !== input.candidate.progressRevision) {
            throw new StaleRuntimeWrite();
          }
          const latest = await tx.programMissionAssignment.findFirst({
            where: { programEnrollmentId: enrollment.id },
            orderBy: { sequence: 'desc' },
          });
          const sequence = (latest?.sequence ?? 0) + 1;
          if (input.decision.target !== null) {
            const target = await tx.resaleItem.findFirst({
              where: {
                id: input.decision.target.resourceId,
                workspaceId: input.candidate.workspaceId,
                groupId: input.candidate.groupId,
                programEnrollmentId: enrollment.id,
              },
              select: { id: true },
            });
            if (input.decision.target.resourceType !== 'RESALE_ITEM' || !target) {
              return 'NOT_FOUND' as const;
            }
          }
          const assignment = await tx.programMissionAssignment.create({
            data: {
              workspaceId: input.candidate.workspaceId,
              groupId: input.candidate.groupId,
              programEnrollmentId: enrollment.id,
              programTemplateVersionId: input.candidate.programTemplateVersionId,
              sequence,
              routeKey: input.candidate.settings.routeKey,
              phaseKey: input.candidate.settings.phaseKey,
              missionDefinitionKey: input.decision.actionKey,
              actionMode: input.decision.mode,
              reasonCode: input.decision.reasonCode,
              variantKey: null,
              targetResourceType: input.decision.target?.resourceType ?? null,
              targetResourceId: input.decision.target?.resourceId ?? null,
              displaySnapshot: input.displaySnapshot as unknown as Prisma.InputJsonValue,
              ruleVersion: input.decision.ruleVersion,
              presentedAt: input.evaluatedAt,
              reevaluateAt: input.decision.reevaluateAt,
            },
          });
          const snapshot = {
            currentAssignmentId: assignment.id,
            routeKey: input.candidate.settings.routeKey,
            phaseKey: input.candidate.settings.phaseKey,
            stateKey: nextProgramState(input.decision.actionKey, input.decision.mode),
            bottleneckKey: input.decision.reasonCode,
            completedMissionCount: input.candidate.completedMissionCount,
            ruleVersion: input.decision.ruleVersion,
            lastActionAt: input.candidate.lastUserActionAt,
            nextEvaluationAt: input.decision.reevaluateAt,
            calculatedAt: input.evaluatedAt,
          };
          if (progress) {
            const updated = await tx.programProgressSnapshot.updateMany({
              where: { id: progress.id, revision: input.candidate.progressRevision! },
              data: { ...snapshot, revision: { increment: 1 } },
            });
            if (updated.count !== 1) throw new StaleRuntimeWrite();
          } else {
            await tx.programProgressSnapshot.create({
              data: {
                workspaceId: input.candidate.workspaceId,
                groupId: input.candidate.groupId,
                programEnrollmentId: enrollment.id,
                programTemplateVersionId: input.candidate.programTemplateVersionId,
                ...snapshot,
              },
            });
          }
          return 'APPLIED' as const;
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (error instanceof StaleRuntimeWrite) return 'STALE';
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2034'].includes(error.code)
      ) {
        const latest = await this.client.programMissionAssignment.findFirst({
          where: {
            workspaceId: input.candidate.workspaceId,
            groupId: input.candidate.groupId,
            programEnrollmentId: input.candidate.programEnrollmentId,
          },
          orderBy: { sequence: 'desc' },
        });
        return latest && sameDecision(latest, input) ? 'ALREADY_APPLIED' : 'STALE';
      }
      throw error;
    }
  }

  async persistDaySevenClassification(
    input: Parameters<AiResaleRuntimeRepository['persistDaySevenClassification']>[0],
  ) {
    try {
      return await this.client.$transaction(
        async (tx) => {
          const enrollment = await activeRuntimeScope(tx, input.candidate, ['ACTIVE', 'COMPLETED']);
          if (!enrollment) return 'NOT_FOUND' as const;
          const existingEvent = await tx.programActionEvent.findUnique({
            where: {
              workspaceId_groupId_idempotencyKey: {
                workspaceId: input.candidate.workspaceId,
                groupId: input.candidate.groupId,
                idempotencyKey: `ai-resale:day7:${enrollment.id}`,
              },
            },
          });
          if (existingEvent) return 'ALREADY_APPLIED' as const;
          if (enrollment.status !== 'ACTIVE') return 'NOT_FOUND' as const;
          const progress = await tx.programProgressSnapshot.findUnique({
            where: { programEnrollmentId: enrollment.id },
          });
          if ((progress?.revision ?? null) !== input.candidate.progressRevision) {
            throw new StaleRuntimeWrite();
          }
          await tx.programActionEvent.create({
            data: {
              workspaceId: input.candidate.workspaceId,
              groupId: input.candidate.groupId,
              programEnrollmentId: enrollment.id,
              missionAssignmentId: null,
              eventType: 'DAY7_CLASSIFIED',
              sourceResourceType: null,
              sourceResourceId: null,
              idempotencyKey: `ai-resale:day7:${enrollment.id}`,
              schemaVersion: 1,
              metadata: {
                classification: input.classification,
                programDay: input.candidate.programDay,
                policyKey: input.candidate.settings.policyKey,
              },
              actorUserId: null,
              occurredAt: input.evaluatedAt,
            },
          });
          const snapshot = {
            currentAssignmentId: null,
            routeKey: input.candidate.settings.routeKey,
            phaseKey: input.candidate.settings.phaseKey,
            stateKey: 'COMPLETED',
            bottleneckKey: input.classification,
            completedMissionCount: input.candidate.completedMissionCount,
            ruleVersion: 'AI_RESALE_V1_DAY7_1',
            lastActionAt: input.candidate.lastUserActionAt,
            nextEvaluationAt: null,
            calculatedAt: input.evaluatedAt,
          };
          if (progress) {
            const updated = await tx.programProgressSnapshot.updateMany({
              where: { id: progress.id, revision: input.candidate.progressRevision! },
              data: { ...snapshot, revision: { increment: 1 } },
            });
            if (updated.count !== 1) throw new StaleRuntimeWrite();
          } else {
            await tx.programProgressSnapshot.create({
              data: {
                workspaceId: input.candidate.workspaceId,
                groupId: input.candidate.groupId,
                programEnrollmentId: enrollment.id,
                programTemplateVersionId: input.candidate.programTemplateVersionId,
                ...snapshot,
              },
            });
          }
          await tx.programEnrollment.update({
            where: { id: enrollment.id },
            data: { status: 'COMPLETED' },
          });
          return 'APPLIED' as const;
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (error instanceof StaleRuntimeWrite) return 'STALE';
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2034'].includes(error.code)
      ) {
        const event = await this.client.programActionEvent.findUnique({
          where: {
            workspaceId_groupId_idempotencyKey: {
              workspaceId: input.candidate.workspaceId,
              groupId: input.candidate.groupId,
              idempotencyKey: `ai-resale:day7:${input.candidate.programEnrollmentId}`,
            },
          },
        });
        return event ? 'ALREADY_APPLIED' : 'STALE';
      }
      throw error;
    }
  }
}
