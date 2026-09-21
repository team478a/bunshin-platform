import { parseProgramDefinition } from '@bunshin/application';
import {
  AI_TRAINING_V1_MODULE_KEY,
  TRAINING_ACTION_KEYS,
  TRAINING_CHALLENGE_KEYS,
  TRAINING_GOAL_KEYS,
  TRAINING_TOPIC_KEYS,
  TRAINING_USE_CASE_KEYS,
  getAiTrainingMissionQuality,
  parseAiTrainingActionDisplay,
  parseAiTrainingRuntimeSettings,
  parseTrainingSkillScores,
  type AiTrainingParticipantAction,
  type AiTrainingParticipantState,
  type AiTrainingRuntimeCandidate,
  type AiTrainingRuntimeRepository,
  type TrainingActionKey,
  type TrainingMissionDefinition,
} from '@bunshin/capability-training';
import { Prisma, type PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

type Scope = {
  enrollment: Prisma.ProgramEnrollmentGetPayload<object>;
  membership: Prisma.GroupMembershipGetPayload<object>;
  program: Prisma.ServiceProgramGetPayload<object>;
  settings: NonNullable<ReturnType<typeof parseAiTrainingRuntimeSettings>>;
  missions: TrainingMissionDefinition[];
};

function isTrainingActionKey(value: string): value is TrainingActionKey {
  return TRAINING_ACTION_KEYS.includes(value as TrainingActionKey);
}

function selectedKeys<const Values extends readonly string[]>(value: unknown, allowed: Values) {
  return Array.isArray(value)
    ? value.filter((item): item is Values[number] =>
        typeof item === 'string' ? allowed.includes(item as Values[number]) : false,
      )
    : [];
}

async function resolveScope(
  db: Db,
  input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    programEnrollmentId: string;
  },
  statuses: Array<'ACTIVE' | 'COMPLETED' | 'EXPIRED'>,
): Promise<Scope | null> {
  const enrollment = await db.programEnrollment.findFirst({
    where: {
      id: input.programEnrollmentId,
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      status: { in: statuses },
      startsAt: { not: null },
    },
  });
  if (!enrollment?.startsAt) return null;
  const [membership, program] = await Promise.all([
    db.groupMembership.findFirst({
      where: {
        id: enrollment.groupMembershipId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.actorUserId,
        serviceRole: 'PARTICIPANT',
        status: 'ACTIVE',
      },
    }),
    db.serviceProgram.findFirst({
      where: {
        id: enrollment.serviceProgramId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        status: 'ACTIVE',
        settings: { path: ['moduleKey'], equals: AI_TRAINING_V1_MODULE_KEY },
      },
    }),
  ]);
  if (!membership || !program) return null;
  const version = await db.programTemplateVersion.findFirst({
    where: {
      id: program.programTemplateVersionId,
      workspaceId: input.workspaceId,
      status: 'PUBLISHED',
    },
  });
  if (!version) return null;
  try {
    const settings = parseAiTrainingRuntimeSettings(program.settings);
    if (!settings) return null;
    const definition = parseProgramDefinition(version.definition);
    const missions = definition.missions.flatMap((mission) => {
      if (
        mission.capability !== 'AI_TRAINING' ||
        !isTrainingActionKey(mission.key) ||
        !['FOUNDATION', 'PRACTICE', 'APPLICATION'].includes(mission.phaseKey)
      ) {
        return [];
      }
      const quality = getAiTrainingMissionQuality(mission.key);
      if (!quality) throw new Error(`missing AI training mission quality: ${mission.key}`);
      return [
        {
          key: mission.key,
          routeKey: mission.routeKey,
          phaseKey: mission.phaseKey as TrainingMissionDefinition['phaseKey'],
          title: mission.title,
          estimatedMinutes: mission.estimatedMinutes,
          quality,
        },
      ];
    });
    return { enrollment, membership, program, settings, missions };
  } catch {
    return null;
  }
}

function participantAction(
  row: {
    id: string;
    sequence: number;
    missionDefinitionKey: string;
    actionMode: 'WORK' | 'WAIT';
    status: string;
    displaySnapshot: unknown;
    presentedAt: Date;
    reevaluateAt: Date | null;
  },
  submission: {
    id: string;
    evaluationStatus: 'PENDING' | 'READY' | 'FAILED';
  } | null,
): AiTrainingParticipantAction | null {
  if (row.status !== 'PRESENTED' && row.status !== 'STARTED') return null;
  const display = parseAiTrainingActionDisplay(row.displaySnapshot);
  if (
    !display ||
    display.actionKey !== row.missionDefinitionKey ||
    display.mode !== row.actionMode
  ) {
    return null;
  }
  return {
    id: row.id,
    sequence: row.sequence,
    actionKey: display.actionKey,
    mode: row.actionMode,
    status: row.status,
    display,
    presentedAt: row.presentedAt,
    reevaluateAt: row.reevaluateAt,
    submission: submission
      ? { answerId: submission.id, evaluationStatus: submission.evaluationStatus }
      : null,
  };
}

class StaleTrainingRuntimeWrite extends Error {}

function sameDecision(
  assignment: {
    missionDefinitionKey: string;
    actionMode: 'WORK' | 'WAIT';
    reasonCode: string | null;
    reevaluateAt: Date | null;
    ruleVersion: string;
  },
  input: Parameters<AiTrainingRuntimeRepository['persistDecision']>[0],
) {
  return (
    assignment.missionDefinitionKey === input.decision.actionKey &&
    assignment.actionMode === input.decision.mode &&
    assignment.reasonCode === input.decision.reasonCode &&
    assignment.reevaluateAt?.getTime() === input.decision.reevaluateAt?.getTime() &&
    assignment.ruleVersion === input.decision.ruleVersion
  );
}

export class PrismaAiTrainingRuntimeRepository implements AiTrainingRuntimeRepository {
  constructor(private readonly client: PrismaClient) {}

  async findState(input: Parameters<AiTrainingRuntimeRepository['findState']>[0]) {
    const scope = await resolveScope(this.client, input, ['ACTIVE', 'COMPLETED', 'EXPIRED']);
    if (!scope) return null;
    const [profile, progress, goal] = await Promise.all([
      this.client.trainingParticipantProfile.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: scope.enrollment.id,
          groupMembershipId: scope.membership.id,
          userId: input.actorUserId,
        },
      }),
      this.client.programProgressSnapshot.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: scope.enrollment.id,
        },
      }),
      this.client.programMemberGoal.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: scope.enrollment.id,
          groupMembershipId: scope.membership.id,
          status: 'ACTIVE',
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: { title: true },
      }),
    ]);
    const assignment = progress?.currentAssignmentId
      ? await this.client.programMissionAssignment.findFirst({
          where: {
            id: progress.currentAssignmentId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            programEnrollmentId: scope.enrollment.id,
            status: { in: ['PRESENTED', 'STARTED'] },
          },
        })
      : null;
    const submission = assignment
      ? await this.client.trainingMissionAnswer.findFirst({
          where: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            programEnrollmentId: scope.enrollment.id,
            missionAssignmentId: assignment.id,
            userId: input.actorUserId,
          },
          select: { id: true, evaluationStatus: true },
        })
      : null;
    return {
      enrollmentId: scope.enrollment.id,
      programName: scope.program.displayName,
      enrollmentStatus: scope.enrollment.status as AiTrainingParticipantState['enrollmentStatus'],
      startsAt: scope.enrollment.startsAt!,
      endsAt: scope.enrollment.endsAt,
      profile:
        profile &&
        profile.learningGoalKey &&
        TRAINING_GOAL_KEYS.includes(profile.learningGoalKey as (typeof TRAINING_GOAL_KEYS)[number])
          ? {
              role: profile.role,
              aiLevel: profile.aiLevel,
              aiUseCases: selectedKeys(profile.aiUseCases, TRAINING_USE_CASE_KEYS),
              workChallenges: selectedKeys(profile.workChallenges, TRAINING_CHALLENGE_KEYS),
              preferredTopics: selectedKeys(profile.preferredTopics, TRAINING_TOPIC_KEYS),
              dailyMinutes: [5, 10, 15].includes(profile.dailyMinutes)
                ? (profile.dailyMinutes as 5 | 10 | 15)
                : 10,
              learningGoalKey: profile.learningGoalKey as (typeof TRAINING_GOAL_KEYS)[number],
            }
          : null,
      goal,
      action: assignment ? participantAction(assignment, submission) : null,
    };
  }

  async findCandidate(input: Parameters<AiTrainingRuntimeRepository['findCandidate']>[0]) {
    const scope = await resolveScope(this.client, input, ['ACTIVE']);
    if (!scope) return null;
    const [profile, progress, assignments, lastUserEvent] = await Promise.all([
      this.client.trainingParticipantProfile.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: scope.enrollment.id,
          groupMembershipId: scope.membership.id,
          userId: input.actorUserId,
        },
      }),
      this.client.programProgressSnapshot.findUnique({
        where: { programEnrollmentId: scope.enrollment.id },
      }),
      this.client.programMissionAssignment.findMany({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: scope.enrollment.id,
        },
        orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
      }),
      this.client.programActionEvent.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: scope.enrollment.id,
          actorUserId: input.actorUserId,
          eventType: {
            in: [
              'ANSWER_SUBMITTED',
              'MISSION_STARTED',
              'HINT_VIEWED',
              'HELP_REQUESTED',
              'TRAINING_POSTPONED',
            ],
          },
        },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      }),
    ]);
    if (!profile) return null;
    const current = progress?.currentAssignmentId
      ? assignments.find(({ id }) => id === progress.currentAssignmentId)
      : null;
    if (
      current &&
      ['PRESENTED', 'STARTED'].includes(current.status) &&
      !(current.actionMode === 'WAIT' && current.reevaluateAt && current.reevaluateAt <= input.now)
    ) {
      return null;
    }
    const completed = assignments.filter(({ status }) => status === 'COMPLETED');
    const phase = ['FOUNDATION', 'PRACTICE', 'APPLICATION'].includes(progress?.phaseKey ?? '')
      ? (progress!.phaseKey as AiTrainingRuntimeCandidate['currentPhase'])
      : 'FOUNDATION';
    return {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      programEnrollmentId: scope.enrollment.id,
      programTemplateVersionId: scope.program.programTemplateVersionId,
      participantUserId: input.actorUserId,
      settings: scope.settings,
      profile: {
        role: profile.role,
        aiLevel: profile.aiLevel,
        needsReview: profile.needsReview,
        recentSuccesses: profile.recentSuccesses,
        recentFailures: profile.recentFailures,
        streak: profile.streak,
        skillScores: parseTrainingSkillScores(profile.skillScores),
      },
      currentPhase: phase,
      completedMissionKeys: completed.map(({ missionDefinitionKey }) => missionDefinitionKey),
      completedMissionCount: completed.length,
      lastMissionKey: assignments.at(-1)?.missionDefinitionKey ?? null,
      bottleneckKey: progress?.bottleneckKey ?? null,
      activityBaselineAt: scope.enrollment.startsAt!,
      lastActionAt: lastUserEvent?.occurredAt ?? progress?.lastActionAt ?? null,
      activeWaitUntil:
        current?.actionMode === 'WAIT' && current.status === 'PRESENTED'
          ? current.reevaluateAt
          : null,
      progressRevision: progress?.revision ?? null,
      missions: scope.missions,
    };
  }

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
