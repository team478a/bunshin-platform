import {
  AI_TRAINING_V1_MODULE_KEY,
  TRAINING_EXPORT_MAX_ROWS,
  type TrainingPersonalDataExportRepository,
  type TrainingPersonalDataReadResult,
  type TrainingPersonalDataScope,
} from '@bunshin/capability-training';
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from './index';
import { pilotParticipantHash } from './personal-learning-pilot-seat';
import { trainingPersonalDataRoleAllows } from './training-personal-data-privacy';

const iso = (value: Date | null) => value?.toISOString() ?? null;

export class PrismaTrainingPersonalDataExportRepository implements TrainingPersonalDataExportRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  read(input: TrainingPersonalDataScope): Promise<TrainingPersonalDataReadResult> {
    return this.client.$transaction(
      async (tx): Promise<TrainingPersonalDataReadResult> => {
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
        if (!membership) return { outcome: 'NOT_FOUND' };
        const enrollment = await tx.programEnrollment.findFirst({
          where: {
            id: input.programEnrollmentId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            groupMembershipId: membership.id,
            status: { in: ['ACTIVE', 'COMPLETED', 'EXPIRED'] },
          },
          select: {
            id: true,
            serviceProgramId: true,
            status: true,
            supportMode: true,
            startsAt: true,
            endsAt: true,
            createdAt: true,
          },
        });
        if (!enrollment) return { outcome: 'NOT_FOUND' };
        // Export does not depend on a still-published template or a still-active program.
        const program = await tx.serviceProgram.findFirst({
          where: {
            id: enrollment.serviceProgramId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            settings: { path: ['moduleKey'], equals: AI_TRAINING_V1_MODULE_KEY },
          },
          select: { id: true, settings: true },
        });
        if (!program) return { outcome: 'NOT_FOUND' };
        if (!(await trainingPersonalDataRoleAllows(tx, input, membership.serviceRole, program)))
          return { outcome: 'NOT_FOUND' };
        const scope = {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: enrollment.id,
        };
        const personal = { ...scope, userId: input.actorUserId };
        const take = TRAINING_EXPORT_MAX_ROWS + 1;
        const orderBy = [{ createdAt: 'asc' as const }, { id: 'asc' as const }];
        const [profile, progress, assignments, answers, toolkit, activities] = await Promise.all([
          tx.trainingParticipantProfile.findFirst({
            where: { ...personal, groupMembershipId: membership.id },
            select: {
              role: true,
              aiLevel: true,
              aiUseCases: true,
              workChallenges: true,
              preferredTopics: true,
              workContext: true,
              dailyMinutes: true,
              learningGoalKey: true,
              skillScores: true,
              currentTopic: true,
              needsReview: true,
              recentSuccesses: true,
              recentFailures: true,
              streak: true,
              createdAt: true,
              updatedAt: true,
            },
          }),
          tx.programProgressSnapshot.findFirst({
            where: scope,
            select: {
              phaseKey: true,
              stateKey: true,
              bottleneckKey: true,
              completedMissionCount: true,
              lastActionAt: true,
              calculatedAt: true,
            },
          }),
          tx.programMissionAssignment.findMany({
            where: scope,
            select: {
              id: true,
              sequence: true,
              missionDefinitionKey: true,
              phaseKey: true,
              actionMode: true,
              status: true,
              presentedAt: true,
              startedAt: true,
              completedAt: true,
              skippedAt: true,
              ruleVersion: true,
              displaySnapshot: true,
            },
            orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
            take,
          }),
          tx.trainingMissionAnswer.findMany({
            where: personal,
            select: {
              id: true,
              missionAssignmentId: true,
              answer: true,
              evaluationStatus: true,
              evaluation: true,
              evaluatedAt: true,
              createdAt: true,
              updatedAt: true,
            },
            orderBy,
            take,
          }),
          tx.trainingToolkitItem.findMany({
            where: personal,
            select: {
              id: true,
              missionAssignmentId: true,
              trainingMissionAnswerId: true,
              missionDefinitionKey: true,
              title: true,
              contentSnapshot: true,
              createdAt: true,
            },
            orderBy,
            take,
          }),
          tx.programActionEvent.findMany({
            where: { ...scope, actorUserId: input.actorUserId },
            select: {
              eventType: true,
              missionAssignmentId: true,
              occurredAt: true,
            },
            orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
            take,
          }),
        ]);
        // Only this learner's explicit practice notes may expose their content.
        // General operational/admin activity metadata remains unselected.
        const practiceNotes = await tx.programActionEvent.findMany({
          where: {
            ...scope,
            actorUserId: input.actorUserId,
            eventType: 'PERSONAL_LEARNING_PRACTICE_NOTE',
          },
          select: { id: true, missionAssignmentId: true, occurredAt: true, metadata: true },
          orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
          take,
        });
        const practiceSupport = await tx.programActionEvent.findMany({
          where: {
            ...scope,
            actorUserId: input.actorUserId,
            eventType: {
              in: ['PERSONAL_LEARNING_SUPPORT_REQUEST', 'PERSONAL_LEARNING_SUPPORT_RESPONSE'],
            },
          },
          select: {
            id: true,
            missionAssignmentId: true,
            eventType: true,
            occurredAt: true,
            metadata: true,
          },
          orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
          take,
        });
        const conversationEvents = await tx.programActionEvent.findMany({
          where: {
            ...scope,
            actorUserId: input.actorUserId,
            eventType: {
              in: [
                'PERSONAL_LEARNING_CONVERSATION_MESSAGE',
                'PERSONAL_LEARNING_CONVERSATION_RESPONSE',
                'PERSONAL_LEARNING_CONVERSATION_SHARE',
              ],
            },
          },
          select: { id: true, eventType: true, occurredAt: true, metadata: true },
          orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
          take,
        });
        const [lineLearningMessages, lineLearningResponses] = await Promise.all([
          tx.personalLearningLineInbox.findMany({
            where: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              programEnrollmentId: enrollment.id,
              groupMembershipId: membership.id,
              userId: input.actorUserId,
            },
            select: {
              messageType: true,
              text: true,
              lineMessageId: true,
              imageMimeType: true,
              imageSha256: true,
              imageSizeBytes: true,
              imageBytes: true,
              createdAt: true,
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            take,
          }),
          tx.personalLearningLinePush.findMany({
            where: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              programEnrollmentId: enrollment.id,
              groupMembershipId: membership.id,
              userId: input.actorUserId,
            },
            select: {
              providerEventId: true,
              purpose: true,
              text: true,
              status: true,
              sentAt: true,
              createdAt: true,
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            take,
          }),
        ]);
        const practiceSupportImages = practiceSupport.length
          ? await tx.personalLearningPracticeSupportImage.findMany({
              where: {
                ...scope,
                groupMembershipId: membership.id,
                userId: input.actorUserId,
                requestEventId: { in: practiceSupport.map(({ id }) => id) },
              },
              select: {
                requestEventId: true,
                mimeType: true,
                sha256: true,
                sizeBytes: true,
                bytes: true,
                createdAt: true,
              },
              take,
            })
          : [];
        const goals = await tx.programMemberGoal.findMany({
          where: { ...scope, groupMembershipId: membership.id },
          select: {
            title: true,
            metricType: true,
            targetValue: true,
            currentValue: true,
            unit: true,
            status: true,
            startsAt: true,
            dueAt: true,
          },
          orderBy,
          take,
        });
        const learningScope = { ...personal, groupMembershipId: membership.id };
        const learningNudgePreference = await tx.personalLearningNudgePreference.findFirst({
          where: learningScope,
          select: {
            enabled: true,
            consentVersion: true,
            consentedAt: true,
            pausedUntil: true,
            stoppedAt: true,
          },
        });
        const [
          learningGoals,
          learningPlans,
          pilotSeats,
          learningRequests,
          learningNudgeOperations,
        ] = await Promise.all([
          tx.personalLearningGoalConfirmation.findMany({ where: learningScope, take }),
          tx.personalLearningPlanRevision.findMany({
            where: learningScope,
            take,
            orderBy: [{ planId: 'asc' }, { revision: 'asc' }],
          }),
          tx.personalLearningPilotSeat.findMany({
            where: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              serviceProgramId: enrollment.serviceProgramId,
              participantHash: pilotParticipantHash(enrollment.serviceProgramId, input.actorUserId),
            },
            select: {
              kind: true,
              cohort: true,
              seatNumber: true,
              admittedAt: true,
              revokedAt: true,
            },
            take,
          }),
          tx.personalLearningRequest.findMany({
            where: learningScope,
            take,
            orderBy: { revision: 'asc' },
          }),
          tx.programActionEvent.findMany({
            where: {
              ...scope,
              actorUserId: input.actorUserId,
              eventType: {
                in: ['PERSONAL_LEARNING_NUDGE_SENT', 'PERSONAL_LEARNING_NUDGE_PREFERENCE_UPDATED'],
              },
            },
            select: { eventType: true, occurredAt: true, metadata: true },
            orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
            take,
          }),
        ]);
        const dynamicLearning = await Promise.all([
          tx.personalLearningTopic.findMany({
            where: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              programEnrollmentId: enrollment.id,
              groupMembershipId: membership.id,
              userId: input.actorUserId,
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            take,
          }),
          tx.personalLearningPersonaItem.findMany({
            where: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              groupMembershipId: membership.id,
              userId: input.actorUserId,
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            take,
          }),
          tx.personalLearningPersonaSuppression.findMany({
            where: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              groupMembershipId: membership.id,
              userId: input.actorUserId,
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            take,
          }),
          tx.personalLearningSavedExample.findMany({
            where: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              groupMembershipId: membership.id,
              userId: input.actorUserId,
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            take,
          }),
          tx.personalLearningPersonaProfile.findMany({
            where: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              groupMembershipId: membership.id,
              userId: input.actorUserId,
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            take,
          }),
        ]);
        if (
          [
            assignments,
            answers,
            toolkit,
            activities,
            goals,
            learningGoals,
            learningPlans,
            learningRequests,
            practiceNotes,
            practiceSupport,
            practiceSupportImages,
            conversationEvents,
            lineLearningMessages,
            lineLearningResponses,
            ...dynamicLearning,
          ].some((rows) => rows.length > TRAINING_EXPORT_MAX_ROWS)
        )
          return { outcome: 'TOO_LARGE' };
        return {
          outcome: 'FOUND',
          data: {
            ...(learningGoals.length +
              learningPlans.length +
              pilotSeats.length +
              learningRequests.length +
              practiceSupport.length +
              conversationEvents.length +
              lineLearningMessages.length +
              lineLearningResponses.length +
              practiceSupportImages.length +
              (learningNudgePreference ? 1 : 0) +
              practiceNotes.length >
            0
              ? {
                  personalLearning: [
                    ...practiceSupport.map((row) => ({
                      ...row,
                      kind: 'PRACTICE_SUPPORT',
                      occurredAt: iso(row.occurredAt),
                    })),
                    ...conversationEvents.map((row) => {
                      const metadata =
                        row.metadata &&
                        typeof row.metadata === 'object' &&
                        !Array.isArray(row.metadata)
                          ? (row.metadata as Record<string, unknown>)
                          : {};
                      return {
                        kind: 'CONVERSATION',
                        event: row.eventType,
                        threadId: typeof metadata.threadId === 'string' ? metadata.threadId : null,
                        requestRevision:
                          typeof metadata.requestRevision === 'number'
                            ? metadata.requestRevision
                            : null,
                        role:
                          row.eventType === 'PERSONAL_LEARNING_CONVERSATION_MESSAGE'
                            ? 'USER'
                            : row.eventType === 'PERSONAL_LEARNING_CONVERSATION_RESPONSE'
                              ? 'ASSISTANT'
                              : null,
                        text: typeof metadata.text === 'string' ? metadata.text : null,
                        status: typeof metadata.status === 'string' ? metadata.status : null,
                        responseStatus:
                          typeof metadata.responseStatus === 'string'
                            ? metadata.responseStatus
                            : null,
                        shared: typeof metadata.shared === 'boolean' ? metadata.shared : null,
                        promptVersion:
                          typeof metadata.promptVersion === 'string'
                            ? metadata.promptVersion
                            : null,
                        occurredAt: iso(row.occurredAt),
                      };
                    }),
                    ...lineLearningMessages.map((row) => ({
                      kind: 'LINE_INBOUND',
                      messageType: row.messageType,
                      text: row.text,
                      lineMessageId: row.lineMessageId,
                      imageMimeType: row.imageMimeType,
                      imageSha256: row.imageSha256,
                      imageSizeBytes: row.imageSizeBytes,
                      imageBase64: row.imageBytes
                        ? Buffer.from(row.imageBytes).toString('base64')
                        : null,
                      createdAt: iso(row.createdAt),
                    })),
                    ...lineLearningResponses.map((row) => ({
                      kind: 'LINE_OUTBOUND',
                      purpose: row.purpose,
                      providerEventId: row.providerEventId,
                      text: row.text,
                      status: row.status,
                      sentAt: iso(row.sentAt),
                      createdAt: iso(row.createdAt),
                    })),
                    ...learningNudgeOperations.map((row) => ({
                      kind: 'LINE_NUDGE_OPERATION',
                      action: row.eventType,
                      metadata: row.metadata,
                      occurredAt: iso(row.occurredAt),
                    })),
                    ...practiceNotes.map((row) => ({
                      ...row,
                      kind: 'PRACTICE_NOTE',
                      occurredAt: iso(row.occurredAt),
                    })),
                    ...practiceSupportImages.map((row) => ({
                      kind: 'PRACTICE_SUPPORT_IMAGE',
                      requestEventId: row.requestEventId,
                      mimeType: row.mimeType,
                      sha256: row.sha256,
                      sizeBytes: row.sizeBytes,
                      base64: Buffer.from(row.bytes).toString('base64'),
                      createdAt: iso(row.createdAt),
                    })),
                    ...learningRequests.map((row) => ({
                      ...row,
                      kind: 'LEARNING_REQUEST',
                      candidateConfirmedAt: iso(row.candidateConfirmedAt),
                      createdAt: iso(row.createdAt),
                      updatedAt: iso(row.updatedAt),
                    })),
                    ...(learningNudgePreference
                      ? [
                          {
                            kind: 'LINE_NUDGE_PREFERENCE',
                            enabled: learningNudgePreference.enabled,
                            consentVersion: learningNudgePreference.consentVersion,
                            consentedAt: iso(learningNudgePreference.consentedAt),
                            pausedUntil: iso(learningNudgePreference.pausedUntil),
                            stoppedAt: iso(learningNudgePreference.stoppedAt),
                          },
                        ]
                      : []),
                    ...pilotSeats.map((row) => ({
                      ...row,
                      kind: 'PILOT_SEAT',
                      participantKind: row.kind,
                      admittedAt: iso(row.admittedAt),
                      revokedAt: iso(row.revokedAt),
                    })),
                    ...learningGoals.map((row) => ({
                      ...row,
                      kind: 'GOAL_CONFIRMATION',
                      confirmedAt: iso(row.confirmedAt),
                    })),
                    ...learningPlans.map((row) => ({
                      ...row,
                      kind: 'PLAN_REVISION',
                      confirmedAt: iso(row.confirmedAt),
                      createdAt: iso(row.createdAt),
                      updatedAt: iso(row.updatedAt),
                    })),
                  ],
                }
              : {}),
            enrollment: {
              id: enrollment.id,
              status: enrollment.status,
              supportMode: enrollment.supportMode,
              startsAt: iso(enrollment.startsAt),
              endsAt: iso(enrollment.endsAt),
              createdAt: iso(enrollment.createdAt),
            },
            profile: profile
              ? { ...profile, createdAt: iso(profile.createdAt), updatedAt: iso(profile.updatedAt) }
              : null,
            progress: progress
              ? {
                  ...progress,
                  lastActionAt: iso(progress.lastActionAt),
                  calculatedAt: iso(progress.calculatedAt),
                }
              : null,
            assignments: assignments.map(({ displaySnapshot, ruleVersion, ...row }) => ({
              ...row,
              ...(ruleVersion === 'PERSONAL_LEARNING_PRACTICE_V1' ? { displaySnapshot } : {}),
              presentedAt: iso(row.presentedAt),
              startedAt: iso(row.startedAt),
              completedAt: iso(row.completedAt),
              skippedAt: iso(row.skippedAt),
            })),
            answers: answers.map((row) => ({
              ...row,
              evaluatedAt: iso(row.evaluatedAt),
              createdAt: iso(row.createdAt),
              updatedAt: iso(row.updatedAt),
            })),
            toolkit: toolkit.map((row) => ({ ...row, createdAt: iso(row.createdAt) })),
            activities: activities.map((row) => ({
              ...row,
              occurredAt: iso(row.occurredAt),
            })),
            goals: goals.map((row) => ({
              ...row,
              targetValue: row.targetValue.toString(),
              currentValue: row.currentValue.toString(),
              startsAt: iso(row.startsAt),
              dueAt: iso(row.dueAt),
            })),
            dynamicLearning: [
              ...dynamicLearning[0].map((row) => ({
                kind: 'TOPIC',
                ...row,
                createdAt: iso(row.createdAt),
                updatedAt: iso(row.updatedAt),
                lastLearnerUseAt: iso(row.lastLearnerUseAt),
                endedAt: iso(row.endedAt),
              })),
              ...dynamicLearning[1].map((row) => ({
                kind: 'PERSONA_ITEM',
                ...row,
                createdAt: iso(row.createdAt),
                updatedAt: iso(row.updatedAt),
                lastLearnerUseAt: iso(row.lastLearnerUseAt),
                evidenceCreatedAt: iso(row.evidenceCreatedAt),
              })),
              ...dynamicLearning[2].map((row) => ({
                kind: 'PERSONA_REINFERENCE_SUPPRESSION',
                ...row,
                createdAt: iso(row.createdAt),
              })),
              ...dynamicLearning[3].map((row) => ({
                kind: 'SAVED_EXAMPLE',
                ...row,
                createdAt: iso(row.createdAt),
                updatedAt: iso(row.updatedAt),
                lastLearnerUseAt: iso(row.lastLearnerUseAt),
              })),
              ...dynamicLearning[4].map((row) => ({
                kind: 'PERSONA_PROFILE',
                ...row,
                createdAt: iso(row.createdAt),
                updatedAt: iso(row.updatedAt),
                optedInAt: iso(row.optedInAt),
                optedOutAt: iso(row.optedOutAt),
                dismissedUntil: iso(row.dismissedUntil),
                lastLearnerUseAt: iso(row.lastLearnerUseAt),
              })),
            ],
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
