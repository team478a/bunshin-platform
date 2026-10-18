import { createHash } from 'node:crypto';
import {
  AI_TRAINING_V1_MODULE_KEY,
  TRAINING_EXPORT_MAX_ROWS,
  type TrainingDataDeletionInput,
  type TrainingDataDeletionPreviewResult,
  type TrainingDataDeletionResult,
  type TrainingPersonalDataDeletionRepository,
} from '@bunshin/capability-training';
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from './index';
import { lockTrainingEnrollmentData } from './training-data-lock';
import { TRAINING_ENROLLMENT_EXPIRED_EVENT } from './training-audit-events';
import { trainingPersonalDataRoleAllows } from './training-personal-data-privacy';

const auditAction = 'TRAINING_PERSONAL_DATA_DELETED';

export class PrismaTrainingPersonalDataDeletionRepository implements TrainingPersonalDataDeletionRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  preview(input: TrainingDataDeletionInput): Promise<TrainingDataDeletionPreviewResult> {
    return this.client.$transaction(
      async (tx) => {
        const owned = await this.owned(tx, input);
        if (!owned) return { outcome: 'NOT_FOUND' };
        const snapshot = await this.snapshot(tx, input, owned);
        if (snapshot.outcome !== 'PREVIEW') return snapshot;
        return { outcome: 'PREVIEW', preview: snapshot.preview };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async delete(
    input: TrainingDataDeletionInput & { revision: string; now: Date },
  ): Promise<TrainingDataDeletionResult> {
    try {
      return await this.client.$transaction(
        async (tx): Promise<TrainingDataDeletionResult> => {
          await lockTrainingEnrollmentData(tx, input);
          const owned = await this.owned(tx, input);
          if (!owned) return { outcome: 'NOT_FOUND' };
          const scope = {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            programEnrollmentId: input.programEnrollmentId,
          };
          const personal = { ...scope, userId: input.actorUserId };
          const auditScope = {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            resourceType: 'PROGRAM_ENROLLMENT',
            resourceId: input.programEnrollmentId,
            action: auditAction,
            performedByUserId: input.actorUserId,
          };
          const previous = await tx.programAuditLog.findFirst({
            where: { ...auditScope, afterData: { path: ['revision'], equals: input.revision } },
            select: { id: true },
          });
          if (previous) {
            // Counts describe this retry, not a second physical deletion.
            return {
              outcome: 'ALREADY_DELETED',
              counts: {
                answers: 0,
                toolkit: 0,
                profiles: 0,
                progress: 0,
                assignments: 0,
                activities: 0,
                goals: 0,
                preferences: 0,
                dynamicLearningData: 0,
              },
            };
          }
          const snapshot = await this.snapshot(tx, input, owned);
          if (snapshot.outcome !== 'PREVIEW') return snapshot;
          if (snapshot.preview.revision !== input.revision) return { outcome: 'CONFLICT' };
          const all = input.target.kind === 'ALL';
          const answerIds = snapshot.answers.map((row) => row.id);
          const payloadPrefix = `training-evaluation:${input.groupId}:${input.programEnrollmentId}:`;
          await tx.job.updateMany({
            where: {
              workspaceId: input.workspaceId,
              requestedBy: input.actorUserId,
              jobType: 'TRAINING_ANSWER_EVALUATE',
              status: { in: ['PENDING', 'LEASED', 'RETRY_SCHEDULED'] },
              ...(all
                ? {
                    payloadReference: {
                      startsWith: payloadPrefix,
                      endsWith: `:${input.actorUserId}`,
                    },
                  }
                : { payloadReference: `${payloadPrefix}${answerIds[0]}:${input.actorUserId}` }),
            },
            data: {
              status: 'CANCELLED',
              cancelledAt: input.now,
              leaseOwner: null,
              leaseExpiresAt: null,
              nextRetryAt: null,
            },
          });
          // Acquire answer locks before erasing any copy of an evaluation.
          await tx.trainingMissionAnswer.deleteMany({
            where: { ...personal, id: { in: answerIds } },
          });
          await tx.trainingToolkitItem.deleteMany({
            where: {
              ...personal,
              ...(all ? {} : { trainingMissionAnswerId: { in: answerIds } }),
            },
          });
          await tx.programActionEvent.deleteMany({ where: snapshot.eventWhere });
          if (input.target.kind === 'LEARNING_REQUEST') {
            await tx.personalLearningRequest.deleteMany({
              where: {
                ...personal,
                groupMembershipId: owned.membershipId,
                id: input.target.requestId,
                revision: input.target.requestRevision,
              },
            });
          }
          if (all) {
            await tx.personalLearningRequest.deleteMany({
              where: { ...personal, groupMembershipId: owned.membershipId },
            });
            const dynamicLearningIds = snapshot.dynamicLearningIds;
            if (dynamicLearningIds) {
              await tx.personalLearningTopic.deleteMany({
                where: {
                  workspaceId: input.workspaceId,
                  groupId: input.groupId,
                  groupMembershipId: owned.membershipId,
                  userId: input.actorUserId,
                  id: { in: dynamicLearningIds.topics },
                },
              });
              await tx.personalLearningPersonaItem.deleteMany({
                where: {
                  workspaceId: input.workspaceId,
                  groupId: input.groupId,
                  groupMembershipId: owned.membershipId,
                  userId: input.actorUserId,
                  id: { in: dynamicLearningIds.personaItems },
                },
              });
              await tx.personalLearningPersonaSuppression.deleteMany({
                where: {
                  workspaceId: input.workspaceId,
                  groupId: input.groupId,
                  groupMembershipId: owned.membershipId,
                  userId: input.actorUserId,
                  id: { in: dynamicLearningIds.personaSuppressions },
                },
              });
              await tx.personalLearningSavedExample.deleteMany({
                where: {
                  workspaceId: input.workspaceId,
                  groupId: input.groupId,
                  groupMembershipId: owned.membershipId,
                  userId: input.actorUserId,
                  id: { in: dynamicLearningIds.savedExamples },
                },
              });
              await tx.personalLearningPersonaProfile.deleteMany({
                where: {
                  workspaceId: input.workspaceId,
                  groupId: input.groupId,
                  groupMembershipId: owned.membershipId,
                  userId: input.actorUserId,
                  id: { in: dynamicLearningIds.personaProfiles },
                },
              });
            }
            // Preserve cumulative capacity, but remove the Enrollment link and revoke access.
            await tx.personalLearningPilotSeat.updateMany({
              where: {
                workspaceId: input.workspaceId,
                groupId: input.groupId,
                programEnrollmentId: input.programEnrollmentId,
              },
              data: { programEnrollmentId: null, revokedAt: new Date() },
            });
            // Do not leave another learner blocked by a stale allowlist projection.
            await tx.$executeRaw`UPDATE service_programs p SET settings=jsonb_set(p.settings,'{personalLearningPilot,enrollmentIds}',
              COALESCE((SELECT jsonb_agg(v) FROM jsonb_array_elements(p.settings->'personalLearningPilot'->'enrollmentIds') v WHERE v <> to_jsonb(${input.programEnrollmentId}::text)), '[]'::jsonb))
              WHERE p.workspace_id=${input.workspaceId}::uuid AND p.group_id=${input.groupId}::uuid
              AND p.id IN (SELECT service_program_id FROM program_enrollments WHERE id=${input.programEnrollmentId}::uuid)
              AND p.settings->'personalLearningPilot'->'participantControl'->>'version'='PILOT_PARTICIPANT_CAP_V1'`;
            await tx.$executeRaw`UPDATE service_programs p SET settings=jsonb_set(p.settings,'{personalLearningPilot,participantControl,revision}',to_jsonb((p.settings->'personalLearningPilot'->'participantControl'->>'revision')::bigint+1))
              WHERE p.workspace_id=${input.workspaceId}::uuid AND p.group_id=${input.groupId}::uuid
              AND p.id IN (SELECT service_program_id FROM program_enrollments WHERE id=${input.programEnrollmentId}::uuid)
              AND p.settings->'personalLearningPilot'->'participantControl'->>'version'='PILOT_PARTICIPANT_CAP_V1'
              AND p.settings->'personalLearningPilot'->'participantControl'->>'revision' ~ '^[0-9]{1,15}$'`;
            await tx.trainingParticipantProfile.deleteMany({
              where: { ...personal, groupMembershipId: owned.membershipId },
            });
            await tx.programProgressSnapshot.deleteMany({ where: scope });
            await tx.programMissionAssignment.deleteMany({ where: scope });
            await tx.programMemberGoal.deleteMany({
              where: { ...scope, groupMembershipId: owned.membershipId },
            });
            await tx.programMemberPreference.deleteMany({
              where: { ...scope, groupMembershipId: owned.membershipId },
            });
            await tx.programEnrollment.updateMany({
              where: {
                workspaceId: input.workspaceId,
                groupId: input.groupId,
                id: input.programEnrollmentId,
                groupMembershipId: owned.membershipId,
              },
              data: { goalSnapshot: {} },
            });
            // Preserve the existence of participation/contract audits, not copied learning goals.
            await tx.programAuditLog.updateMany({
              where: {
                workspaceId: input.workspaceId,
                groupId: input.groupId,
                resourceType: 'PROGRAM_ENROLLMENT',
                resourceId: input.programEnrollmentId,
                action: { not: auditAction },
              },
              data: { beforeData: Prisma.DbNull, afterData: { learningDataRedacted: true } },
            });
          } else {
            await tx.personalLearningPracticeSupportImage.deleteMany({
              where: {
                ...scope,
                userId: input.actorUserId,
                missionAssignmentId: { in: snapshot.answers.map((row) => row.missionAssignmentId) },
              },
            });
            await tx.programMissionAssignment.updateMany({
              where: {
                ...scope,
                id: { in: snapshot.answers.map((row) => row.missionAssignmentId) },
                status: { in: ['PRESENTED', 'STARTED'] },
              },
              data: { status: 'SKIPPED', skippedAt: input.now },
            });
            await tx.programProgressSnapshot.updateMany({
              where: {
                ...scope,
                currentAssignmentId: { in: snapshot.answers.map((row) => row.missionAssignmentId) },
              },
              data: {
                currentAssignmentId: null,
                nextEvaluationAt: null,
                revision: { increment: 1 },
              },
            });
          }
          await tx.programAuditLog.create({
            data: {
              ...auditScope,
              beforeData: Prisma.DbNull,
              afterData: {
                revision: input.revision,
                kind: input.target.kind,
                counts: { ...snapshot.preview.counts },
              },
              performedAt: input.now,
            },
          });
          return { outcome: 'DELETED', counts: snapshot.preview.counts };
        },
        { isolationLevel: 'ReadCommitted', timeout: 15_000 },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')
        return { outcome: 'CONFLICT' };
      throw error;
    }
  }

  private async owned(tx: Prisma.TransactionClient, input: TrainingDataDeletionInput) {
    const membership = await tx.groupMembership.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.actorUserId,
        serviceRole: { in: ['PARTICIPANT', 'SERVICE_OWNER'] },
        status: 'ACTIVE',
        user: { status: 'ACTIVE' },
        group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
      },
      select: { id: true, serviceRole: true },
    });
    if (!membership) return null;
    const enrollment = await tx.programEnrollment.findFirst({
      where: {
        id: input.programEnrollmentId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        groupMembershipId: membership.id,
        status: { in: ['ACTIVE', 'COMPLETED', 'EXPIRED'] },
      },
      select: { id: true, serviceProgramId: true, updatedAt: true },
    });
    if (!enrollment) return null;
    const program = await tx.serviceProgram.findFirst({
      where: {
        id: enrollment.serviceProgramId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        settings: { path: ['moduleKey'], equals: AI_TRAINING_V1_MODULE_KEY },
      },
      select: { id: true, settings: true },
    });
    return program &&
      (await trainingPersonalDataRoleAllows(tx, input, membership.serviceRole, program))
      ? {
          membershipId: membership.id,
          enrollmentUpdatedAt: enrollment.updatedAt,
          programSettings: program.settings,
        }
      : null;
  }

  private async snapshot(
    tx: Prisma.TransactionClient,
    input: TrainingDataDeletionInput,
    owned: { membershipId: string; enrollmentUpdatedAt: Date; programSettings: Prisma.JsonValue },
  ) {
    const all = input.target.kind === 'ALL';
    const answerTarget = input.target.kind === 'ANSWER';
    const learningRequestTarget = input.target.kind === 'LEARNING_REQUEST';
    const scope = {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      programEnrollmentId: input.programEnrollmentId,
    };
    const personal = { ...scope, userId: input.actorUserId };
    const take = TRAINING_EXPORT_MAX_ROWS + 1;
    const orderBy = { id: 'asc' as const };
    const select = { id: true, updatedAt: true } as const;
    const answers = await tx.trainingMissionAnswer.findMany({
      where: {
        ...personal,
        ...(input.target.kind === 'ANSWER'
          ? { id: input.target.answerId }
          : all
            ? {}
            : { id: { in: [] } }),
      },
      select: { ...select, missionAssignmentId: true, createdAt: true, evaluationStatus: true },
      orderBy,
      take,
    });
    const learningRequests =
      all || learningRequestTarget
        ? await tx.personalLearningRequest.findMany({
            where: {
              ...personal,
              groupMembershipId: owned.membershipId,
              ...(input.target.kind === 'LEARNING_REQUEST'
                ? {
                    id: input.target.requestId,
                    revision: input.target.requestRevision,
                  }
                : {}),
            },
            select: { id: true, revision: true, createdAt: true, updatedAt: true },
            orderBy,
            take,
          })
        : [];
    if (answerTarget && !answers.length) return { outcome: 'NOT_FOUND' } as const;
    if (learningRequestTarget && !learningRequests.length) return { outcome: 'NOT_FOUND' } as const;
    const toolkit = await tx.trainingToolkitItem.findMany({
      where: {
        ...personal,
        ...(all ? {} : { trainingMissionAnswerId: { in: answers.map((row) => row.id) } }),
      },
      select: { id: true, createdAt: true, updatedAt: true },
      orderBy,
      take,
    });
    let eventWhere: Prisma.ProgramActionEventWhereInput = {
      ...scope,
      eventType: { not: TRAINING_ENROLLMENT_EXPIRED_EVENT },
      ...(all
        ? {}
        : learningRequestTarget
          ? {
              actorUserId: input.actorUserId,
              id: { in: [] as string[] },
            }
          : {
              actorUserId: input.actorUserId,
              OR: [
                {
                  sourceResourceType: 'TRAINING_MISSION_ANSWER',
                  sourceResourceId: { in: answers.map((row) => row.id) },
                },
                {
                  sourceResourceType: 'TRAINING_TOOLKIT_ITEM',
                  sourceResourceId: { in: toolkit.map((row) => row.id) },
                },
              ],
            }),
    };
    const activities = await tx.programActionEvent.findMany({
      where: eventWhere,
      select: { id: true, createdAt: true },
      orderBy,
      take,
    });
    let conversationEventsCount = 0;
    if (learningRequestTarget) {
      const threadEvents = await tx.programActionEvent.findMany({
        where: {
          ...scope,
          OR: [
            {
              actorUserId: input.actorUserId,
              eventType: {
                in: [
                  'PERSONAL_LEARNING_CONVERSATION_MESSAGE',
                  'PERSONAL_LEARNING_CONVERSATION_RESPONSE',
                  'PERSONAL_LEARNING_CONVERSATION_SHARE',
                ],
              },
            },
            {
              sourceResourceType: 'PERSONAL_LEARNING_REQUEST',
              sourceResourceId: learningRequests[0]!.id,
            },
          ],
        },
        select: {
          id: true,
          eventType: true,
          sourceResourceType: true,
          sourceResourceId: true,
          createdAt: true,
          metadata: true,
        },
        orderBy,
        take,
      });
      const matching = threadEvents.filter((row) => {
        const metadata =
          row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
            ? (row.metadata as Record<string, unknown>)
            : {};
        return row.sourceResourceType === 'PERSONAL_LEARNING_REQUEST'
          ? row.sourceResourceId === learningRequests[0]?.id
          : metadata['threadId'] === learningRequests[0]?.id &&
              metadata['requestRevision'] === learningRequests[0]?.revision;
      });
      conversationEventsCount = matching.filter(({ eventType }) =>
        eventType.startsWith('PERSONAL_LEARNING_CONVERSATION_'),
      ).length;
      eventWhere = { ...scope, id: { in: matching.map(({ id }) => id) } };
      activities.splice(
        0,
        activities.length,
        ...matching.map(({ id, createdAt }) => ({ id, createdAt })),
      );
    }
    const [profiles, progress, assignments, goals, preferences] = all
      ? await Promise.all([
          tx.trainingParticipantProfile.findMany({
            where: { ...personal, groupMembershipId: owned.membershipId },
            select,
            orderBy,
            take,
          }),
          tx.programProgressSnapshot.findMany({ where: scope, select, orderBy, take }),
          tx.programMissionAssignment.findMany({ where: scope, select, orderBy, take }),
          tx.programMemberGoal.findMany({
            where: { ...scope, groupMembershipId: owned.membershipId },
            select,
            orderBy,
            take,
          }),
          tx.programMemberPreference.findMany({
            where: { ...scope, groupMembershipId: owned.membershipId },
            select,
            orderBy,
            take,
          }),
        ])
      : [[], [], [], [], []];
    const [
      dynamicTopics,
      dynamicPersonaItems,
      dynamicPersonaSuppressions,
      dynamicSavedExamples,
      dynamicPersonaProfiles,
    ] = all
      ? await Promise.all([
          tx.personalLearningTopic.findMany({
            where: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              groupMembershipId: owned.membershipId,
              userId: input.actorUserId,
            },
            select,
            orderBy,
            take,
          }),
          tx.personalLearningPersonaItem.findMany({
            where: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              groupMembershipId: owned.membershipId,
              userId: input.actorUserId,
            },
            select,
            orderBy,
            take,
          }),
          tx.personalLearningPersonaSuppression.findMany({
            where: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              groupMembershipId: owned.membershipId,
              userId: input.actorUserId,
            },
            select: { id: true, createdAt: true },
            orderBy,
            take,
          }),
          tx.personalLearningSavedExample.findMany({
            where: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              groupMembershipId: owned.membershipId,
              userId: input.actorUserId,
            },
            select,
            orderBy,
            take,
          }),
          tx.personalLearningPersonaProfile.findMany({
            where: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              groupMembershipId: owned.membershipId,
              userId: input.actorUserId,
            },
            select,
            orderBy,
            take,
          }),
        ])
      : [[], [], [], [], []];
    const rows = {
      answers,
      toolkit,
      profiles,
      progress,
      assignments,
      activities,
      goals,
      preferences,
    };
    const snapshotRows = {
      ...rows,
      learningRequests,
      dynamicTopics,
      dynamicPersonaItems,
      dynamicPersonaSuppressions,
      dynamicSavedExamples,
      dynamicPersonaProfiles,
    };
    if (Object.values(snapshotRows).some((list) => list.length > TRAINING_EXPORT_MAX_ROWS))
      return { outcome: 'TOO_LARGE' } as const;
    const revision = createHash('sha256')
      .update(
        JSON.stringify({
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          actorUserId: input.actorUserId,
          programEnrollmentId: input.programEnrollmentId,
          target: input.target,
          enrollmentUpdatedAt: owned.enrollmentUpdatedAt,
          rows: snapshotRows,
        }),
      )
      .digest('hex');
    return {
      outcome: 'PREVIEW' as const,
      answers,
      eventWhere,
      dynamicLearningIds: all
        ? {
            topics: dynamicTopics.map(({ id }) => id),
            personaItems: dynamicPersonaItems.map(({ id }) => id),
            personaSuppressions: dynamicPersonaSuppressions.map(({ id }) => id),
            savedExamples: dynamicSavedExamples.map(({ id }) => id),
            personaProfiles: dynamicPersonaProfiles.map(({ id }) => id),
          }
        : null,
      preview: {
        revision,
        counts: {
          answers: answers.length,
          toolkit: toolkit.length,
          profiles: profiles.length,
          progress: progress.length,
          assignments: assignments.length,
          activities: activities.length,
          goals: goals.length,
          preferences: preferences.length,
          ...(all
            ? {
                dynamicLearningData:
                  dynamicTopics.length +
                  dynamicPersonaItems.length +
                  dynamicPersonaSuppressions.length +
                  dynamicSavedExamples.length +
                  dynamicPersonaProfiles.length,
              }
            : {}),
          ...(learningRequests.length > 0 ? { learningRequests: learningRequests.length } : {}),
          ...(learningRequestTarget ? { conversationEvents: conversationEventsCount } : {}),
        },
        answers: answers.map((row) => ({
          id: row.id,
          createdAt: row.createdAt.toISOString(),
          evaluationStatus: row.evaluationStatus,
        })),
        learningRequests: learningRequests.map((row) => ({
          id: row.id,
          revision: row.revision,
          createdAt: row.createdAt.toISOString(),
        })),
        ...(learningRequestTarget
          ? {
              learningRequest: {
                id: learningRequests[0]!.id,
                revision: learningRequests[0]!.revision,
              },
            }
          : {}),
      },
    };
  }
}
