import { parseProgramDefinition } from '@bunshin/application';
import {
  AI_TRAINING_V1_MODULE_KEY,
  TRAINING_ACTION_KEYS,
  getAiTrainingMissionQuality,
  parseAiTrainingActionDisplay,
  parseAiTrainingRuntimeSettings,
  type AiTrainingParticipantAction,
  type AiTrainingRuntimeRepository,
  type TrainingActionKey,
  type TrainingMissionDefinition,
} from '@bunshin/capability-training';
import type { Prisma, PrismaClient } from '@prisma/client';

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

export function selectedKeys<const Values extends readonly string[]>(
  value: unknown,
  allowed: Values,
) {
  return Array.isArray(value)
    ? value.filter((item): item is Values[number] =>
        typeof item === 'string' ? allowed.includes(item as Values[number]) : false,
      )
    : [];
}

export async function resolveScope(
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

export function participantAction(
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

export class StaleTrainingRuntimeWrite extends Error {}

export function sameDecision(
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
