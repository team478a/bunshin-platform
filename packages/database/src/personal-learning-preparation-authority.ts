import type { Prisma } from '@prisma/client';
import {
  parsePersonalLearningPreparationAuthority,
  type PersonalLearningPreparationAuthority,
} from '@bunshin/application';
import {
  personalLearningPilotProfilePreparationAllows,
  personalLearningFeatures,
  personalLearningMode,
  parsePilotParticipantPolicy,
  parseAiTrainingOperationsSettings,
} from '@bunshin/capability-training';
import { ApplicationError } from '@bunshin/shared';

/** Called inside the existing authorization transaction, not a preflight-only check. */
export async function requirePersonalLearningPreparationAuthority(
  tx: Prisma.TransactionClient,
  authority: PersonalLearningPreparationAuthority,
  scope: { workspaceId: string; groupId: string },
  enrollmentProgramId?: string,
  allowEmpty = false,
) {
  const parsed = parsePersonalLearningPreparationAuthority(authority);
  if (
    !parsed ||
    parsed.workspaceId !== scope.workspaceId ||
    parsed.groupId !== scope.groupId ||
    (enrollmentProgramId !== undefined && enrollmentProgramId !== parsed.serviceProgramId)
  )
    throw new ApplicationError('NOT_FOUND', 'production preparation unavailable');
  const rows = await tx.$queryRaw<{ settings: unknown }[]>`
    SELECT settings FROM service_programs WHERE id=${parsed.serviceProgramId}::uuid
      AND workspace_id=${parsed.workspaceId}::uuid AND group_id=${parsed.groupId}::uuid
      AND status::text='SUSPENDED' AND settings->>'moduleKey'='AI_TRAINING_V1' FOR SHARE`;
  const settings = rows[0]?.settings as
    | {
        personalLearningPilot?: {
          enabled?: boolean;
          enrollmentIds?: unknown[];
          participantControl?: unknown;
          learningMode?: unknown;
          learningFeatures?: unknown;
        };
      }
    | undefined;
  const first = settings?.personalLearningPilot?.enrollmentIds?.[0];
  const pilot = settings?.personalLearningPilot;
  const modeValid = personalLearningMode(settings) !== null;
  const featuresValid = personalLearningFeatures(settings) !== null;
  const emptyValid =
    (allowEmpty || !!parsePilotParticipantPolicy(pilot?.participantControl)) &&
    pilot?.enabled === false &&
    Array.isArray(pilot.enrollmentIds) &&
    pilot.enrollmentIds.length === 0 &&
    Object.keys(pilot).every((k) =>
      [
        'enabled',
        'enrollmentIds',
        'participantControl',
        'learningMode',
        'learningFeatures',
      ].includes(k),
    ) &&
    modeValid &&
    featuresValid &&
    (!Object.hasOwn(pilot, 'participantControl') ||
      !!parsePilotParticipantPolicy(pilot.participantControl)) &&
    !parseAiTrainingOperationsSettings(settings).notificationsEnabled &&
    !parseAiTrainingOperationsSettings(settings).postponedReminderEnabled;
  if (
    rows.length !== 1 ||
    !modeValid ||
    !featuresValid ||
    (!emptyValid &&
      (typeof first !== 'string' ||
        !personalLearningPilotProfilePreparationAllows(settings, first)))
  )
    throw new ApplicationError('NOT_FOUND', 'production preparation unavailable');
  const ids = settings?.personalLearningPilot?.enrollmentIds as string[];
  if (
    (await tx.programEnrollment.count({
      where: {
        workspaceId: parsed.workspaceId,
        groupId: parsed.groupId,
        serviceProgramId: parsed.serviceProgramId,
        id: { in: ids },
      },
    })) !== ids.length
  )
    throw new ApplicationError('NOT_FOUND', 'preparation allowlist scope unavailable');
  // Approval is Service-owned. Do not silently change another Personal Learning Program's Definition state.
  const otherPersonalLearningPrograms = await tx.$queryRaw<{ id: string }[]>`
    SELECT id
    FROM service_programs
    WHERE workspace_id=${parsed.workspaceId}::uuid
      AND group_id=${parsed.groupId}::uuid
      AND id <> ${parsed.serviceProgramId}::uuid
      AND settings->>'moduleKey'='AI_TRAINING_V1'
      AND settings ? 'personalLearningPilot'
    LIMIT 1
  `;
  if (otherPersonalLearningPrograms.length)
    throw new ApplicationError('NOT_FOUND', 'dedicated preparation service required');
}
