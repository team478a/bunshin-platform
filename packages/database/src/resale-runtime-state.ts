import {
  AI_RESALE_V1_MODULE_KEY,
  parseAiResaleRuntimeSettings,
  type AiResaleRuntimeCandidate,
  type AiResaleRuntimeRepository,
} from '@bunshin/capability-resale';
import type { Db } from './resale-runtime-enrollment';
export class StaleRuntimeWrite extends Error {}

export function nextProgramState(actionKey: string, mode: 'WORK' | 'WAIT') {
  if (actionKey === 'RECOVERY') return 'PAUSED' as const;
  return mode === 'WAIT' ? ('WAITING' as const) : ('ACTIVE' as const);
}

export async function activeRuntimeScope(
  db: Db,
  candidate: AiResaleRuntimeCandidate,
  statuses: Array<'ACTIVE' | 'COMPLETED'> = ['ACTIVE'],
) {
  const enrollment = await db.programEnrollment.findFirst({
    where: {
      id: candidate.programEnrollmentId,
      workspaceId: candidate.workspaceId,
      groupId: candidate.groupId,
      status: { in: statuses },
    },
  });
  if (!enrollment) return null;
  const [membership, program] = await Promise.all([
    db.groupMembership.findFirst({
      where: {
        id: enrollment.groupMembershipId,
        workspaceId: candidate.workspaceId,
        groupId: candidate.groupId,
        userId: candidate.participantUserId,
        status: 'ACTIVE',
      },
      select: { id: true },
    }),
    db.serviceProgram.findFirst({
      where: {
        id: enrollment.serviceProgramId,
        workspaceId: candidate.workspaceId,
        groupId: candidate.groupId,
        programTemplateVersionId: candidate.programTemplateVersionId,
        status: 'ACTIVE',
        settings: { path: ['moduleKey'], equals: AI_RESALE_V1_MODULE_KEY },
      },
      select: { settings: true },
    }),
  ]);
  if (!membership || !program) return null;
  try {
    const settings = parseAiResaleRuntimeSettings(program.settings);
    if (
      settings === null ||
      settings.policyKey !== candidate.settings.policyKey ||
      settings.routeKey !== candidate.settings.routeKey ||
      settings.phaseKey !== candidate.settings.phaseKey
    ) {
      return null;
    }
  } catch {
    return null;
  }
  return enrollment;
}

export function sameDecision(
  assignment: {
    missionDefinitionKey: string;
    actionMode: 'WORK' | 'WAIT';
    reasonCode: string | null;
    targetResourceType: string | null;
    targetResourceId: string | null;
    reevaluateAt: Date | null;
    ruleVersion: string;
  },
  input: Parameters<AiResaleRuntimeRepository['persistDecision']>[0],
) {
  return (
    assignment.missionDefinitionKey === input.decision.actionKey &&
    assignment.actionMode === input.decision.mode &&
    assignment.reasonCode === input.decision.reasonCode &&
    assignment.targetResourceType === (input.decision.target?.resourceType ?? null) &&
    assignment.targetResourceId === (input.decision.target?.resourceId ?? null) &&
    assignment.reevaluateAt?.getTime() === input.decision.reevaluateAt?.getTime() &&
    assignment.ruleVersion === input.decision.ruleVersion
  );
}
