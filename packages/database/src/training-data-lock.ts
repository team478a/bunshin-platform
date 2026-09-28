import type { TrainingPersonalDataScope } from '@bunshin/capability-training';
import { Prisma } from '@prisma/client';

// Training writers lock the same enrollment before reading mutable records.
// External provider calls never hold this lock. The no-op UPDATE also changes
// the MVCC version: a waiting Serializable writer with a pre-deletion snapshot
// must abort instead of reading and re-saving erased records.
export async function lockTrainingEnrollmentData(
  tx: Prisma.TransactionClient,
  input: TrainingPersonalDataScope,
): Promise<void> {
  await tx.$queryRaw(Prisma.sql`
    UPDATE program_enrollments AS enrollment
    SET updated_at = enrollment.updated_at
    WHERE enrollment.id = ${input.programEnrollmentId}::uuid
      AND enrollment.workspace_id = ${input.workspaceId}::uuid
      AND enrollment.group_id = ${input.groupId}::uuid
      AND EXISTS (
        SELECT 1 FROM group_memberships AS membership
        WHERE membership.id = enrollment.group_membership_id
          AND membership.workspace_id = enrollment.workspace_id
          AND membership.group_id = enrollment.group_id
          AND membership.user_id = ${input.actorUserId}::uuid
      )
    RETURNING enrollment.id
  `);
}
