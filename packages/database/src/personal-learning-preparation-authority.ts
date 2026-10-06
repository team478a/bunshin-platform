import type { Prisma } from '@prisma/client';
import {
  parsePersonalLearningPreparationAuthority,
  type PersonalLearningPreparationAuthority,
} from '@bunshin/application';
import { personalLearningPilotProfilePreparationAllows } from '@bunshin/capability-training';
import { ApplicationError } from '@bunshin/shared';

/** Called inside the existing authorization transaction, not a preflight-only check. */
export async function requirePersonalLearningPreparationAuthority(
  tx: Prisma.TransactionClient,
  authority: PersonalLearningPreparationAuthority,
  scope: { workspaceId: string; groupId: string },
  enrollmentProgramId?: string,
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
    { personalLearningPilot?: { enrollmentIds?: unknown[] } } | undefined;
  const first = settings?.personalLearningPilot?.enrollmentIds?.[0];
  if (
    rows.length !== 1 ||
    typeof first !== 'string' ||
    !personalLearningPilotProfilePreparationAllows(settings, first)
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
  // Approval is Service-owned. Do not silently change another training Program's Definition state.
  if (
    await tx.serviceProgram.count({
      where: {
        workspaceId: parsed.workspaceId,
        groupId: parsed.groupId,
        id: { not: parsed.serviceProgramId },
        settings: { path: ['moduleKey'], equals: 'AI_TRAINING_V1' },
      },
    })
  )
    throw new ApplicationError('NOT_FOUND', 'dedicated preparation service required');
}
