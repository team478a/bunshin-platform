import type { AiTrainingRuntimeRepository } from '@bunshin/capability-training';
import { Prisma, type PrismaClient } from '@prisma/client';
import { resolveScope, sameDecision, StaleTrainingRuntimeWrite } from './training-runtime-shared';

export class PrismaAiTrainingRuntimeDecisionRepository {
  constructor(private readonly client: PrismaClient) {}

  async persistDecision(input: Parameters<AiTrainingRuntimeRepository['persistDecision']>[0]) {
    try {
      return await this.client.$transaction(
        async (tx) => {
          const scope = await resolveScope(
            tx,
            {
              workspaceId: input.candidate.workspaceId,
              groupId: input.candidate.groupId,
              actorUserId: input.candidate.participantUserId,
              programEnrollmentId: input.candidate.programEnrollmentId,
            },
            ['ACTIVE'],
          );
          if (
            !scope ||
            scope.program.programTemplateVersionId !== input.candidate.programTemplateVersionId
          ) {
            return 'NOT_FOUND' as const;
          }
          const mission = scope.missions.find(({ key }) => key === input.decision.actionKey);
          if (
            !mission ||
            mission.key !== input.mission.key ||
            mission.routeKey !== input.mission.routeKey ||
            input.displaySnapshot.actionKey !== mission.key ||
            input.displaySnapshot.mode !== input.decision.mode
          ) {
            return 'NOT_FOUND' as const;
          }
          const progress = await tx.programProgressSnapshot.findUnique({
            where: { programEnrollmentId: scope.enrollment.id },
          });
          if ((progress?.revision ?? null) !== input.candidate.progressRevision) {
            throw new StaleTrainingRuntimeWrite();
          }
          const latest = await tx.programMissionAssignment.findFirst({
            where: { programEnrollmentId: scope.enrollment.id },
            orderBy: { sequence: 'desc' },
          });
          if (
            latest &&
            ['PRESENTED', 'STARTED'].includes(latest.status) &&
            !(
              latest.actionMode === 'WAIT' &&
              latest.reevaluateAt &&
              latest.reevaluateAt <= input.evaluatedAt
            )
          ) {
            return sameDecision(latest, input) ? ('ALREADY_APPLIED' as const) : ('STALE' as const);
          }
          if (latest?.actionMode === 'WAIT' && latest.status === 'PRESENTED') {
            await tx.programMissionAssignment.update({
              where: { id: latest.id },
              data: { status: 'SKIPPED', skippedAt: input.evaluatedAt },
            });
          }
          const sequence = (latest?.sequence ?? 0) + 1;
          const assignment = await tx.programMissionAssignment.create({
            data: {
              workspaceId: input.candidate.workspaceId,
              groupId: input.candidate.groupId,
              programEnrollmentId: scope.enrollment.id,
              programTemplateVersionId: input.candidate.programTemplateVersionId,
              sequence,
              routeKey: mission.routeKey,
              phaseKey: mission.phaseKey,
              missionDefinitionKey: mission.key,
              actionMode: input.decision.mode,
              reasonCode: input.decision.reasonCode,
              displaySnapshot: input.displaySnapshot as unknown as Prisma.InputJsonValue,
              ruleVersion: input.decision.ruleVersion,
              presentedAt: input.evaluatedAt,
              reevaluateAt: input.decision.reevaluateAt,
            },
          });
          await tx.programActionEvent.create({
            data: {
              workspaceId: input.candidate.workspaceId,
              groupId: input.candidate.groupId,
              programEnrollmentId: scope.enrollment.id,
              missionAssignmentId: assignment.id,
              eventType: 'MISSION_ASSIGNED',
              idempotencyKey: `ai-training:assignment:${scope.enrollment.id}:${sequence}`,
              schemaVersion: 1,
              metadata: {
                missionDefinitionKey: mission.key,
                reasonCode: input.decision.reasonCode,
                ruleVersion: input.decision.ruleVersion,
                difficulty: input.displaySnapshot.difficulty ?? null,
                difficultyReasonCode: input.displaySnapshot.difficultyReasonCode ?? null,
              },
              actorUserId: null,
              occurredAt: input.evaluatedAt,
            },
          });
          const snapshot = {
            currentAssignmentId: assignment.id,
            routeKey: mission.routeKey,
            phaseKey: mission.phaseKey,
            stateKey:
              mission.key === 'RECOVERY'
                ? ('PAUSED' as const)
                : input.decision.mode === 'WAIT'
                  ? ('WAITING' as const)
                  : ('ACTIVE' as const),
            bottleneckKey: input.decision.reasonCode,
            completedMissionCount: input.candidate.completedMissionCount,
            ruleVersion: input.decision.ruleVersion,
            lastActionAt: input.candidate.lastActionAt,
            nextEvaluationAt: input.decision.reevaluateAt,
            calculatedAt: input.evaluatedAt,
          };
          if (progress) {
            const changed = await tx.programProgressSnapshot.updateMany({
              where: { id: progress.id, revision: input.candidate.progressRevision! },
              data: { ...snapshot, revision: { increment: 1 } },
            });
            if (changed.count !== 1) throw new StaleTrainingRuntimeWrite();
          } else {
            await tx.programProgressSnapshot.create({
              data: {
                workspaceId: input.candidate.workspaceId,
                groupId: input.candidate.groupId,
                programEnrollmentId: scope.enrollment.id,
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
      if (error instanceof StaleTrainingRuntimeWrite) return 'STALE';
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
}
