import { AI_TRAINING_V1_MODULE_KEY } from '@bunshin/capability-training';
import { ApplicationError } from '@bunshin/shared';
import { Prisma, type PrismaClient } from '@prisma/client';
import { lockTrainingEnrollmentData } from './training-data-lock';
import { stopTrainingEnrollmentEvaluations } from './training-evaluation-stop';
import { TRAINING_ENROLLMENT_EXPIRED_EVENT } from './training-audit-events';

export const TRAINING_ENROLLMENT_EXPIRY_BATCH_LIMIT = 100;
export type TrainingEnrollmentExpiryInput = { workspaceId: string; groupId: string; now: Date };
export type TrainingEnrollmentExpiryPreview = {
  eligible: number;
  batchLimit: number;
  requiredBatches: number;
  hasMore: boolean;
  cutoffAt: string;
};
type Candidate = {
  id: string;
  groupMembershipId: string;
  serviceProgramId: string;
  userId: string;
  updatedAt: Date;
  endsAt: Date;
};

function assertValidExpiryClock(now: Date) {
  if (!Number.isFinite(now.getTime()))
    throw new ApplicationError('VALIDATION_ERROR', 'valid expiry clock required');
}

const expiryScopePredicate = (input: TrainingEnrollmentExpiryInput) => Prisma.sql`
  e.workspace_id = ${input.workspaceId}::uuid AND e.group_id = ${input.groupId}::uuid
    AND p.settings->>'moduleKey' = ${AI_TRAINING_V1_MODULE_KEY}
    AND m.service_role = 'PARTICIPANT'
    AND e.status = 'ACTIVE' AND e.starts_at IS NOT NULL
    AND e.starts_at <= e.ends_at AND e.ends_at <= ${input.now}
    AND NOT EXISTS (SELECT 1 FROM program_purchases purchase
      WHERE purchase.workspace_id = e.workspace_id AND purchase.group_id = e.group_id
        AND purchase.paid_enrollment_id = e.id)
`;

export async function previewUnpurchasedTrainingEnrollmentExpiry(
  client: PrismaClient,
  input: TrainingEnrollmentExpiryInput,
): Promise<TrainingEnrollmentExpiryPreview> {
  assertValidExpiryClock(input.now);
  const rows = await client.$queryRaw<Array<{ eligible: number }>>(Prisma.sql`
    SELECT COUNT(*)::integer AS "eligible"
    FROM program_enrollments e
    JOIN service_programs p ON p.id = e.service_program_id
      AND p.workspace_id = e.workspace_id AND p.group_id = e.group_id
    JOIN group_memberships m ON m.id = e.group_membership_id
      AND m.workspace_id = e.workspace_id AND m.group_id = e.group_id
    JOIN groups g ON g.id = e.group_id AND g.workspace_id = e.workspace_id
    WHERE ${expiryScopePredicate(input)}
  `);
  const eligible = rows[0]?.eligible ?? 0;
  return {
    eligible,
    batchLimit: TRAINING_ENROLLMENT_EXPIRY_BATCH_LIMIT,
    requiredBatches: Math.ceil(eligible / TRAINING_ENROLLMENT_EXPIRY_BATCH_LIMIT),
    hasMore: eligible > TRAINING_ENROLLMENT_EXPIRY_BATCH_LIMIT,
    cutoffAt: input.now.toISOString(),
  };
}

export async function expireUnpurchasedTrainingEnrollments(
  client: PrismaClient,
  input: TrainingEnrollmentExpiryInput,
) {
  assertValidExpiryClock(input.now);
  const scope = { workspaceId: input.workspaceId, groupId: input.groupId };
  // Filter the module/ownership before the limit so unrelated programs cannot
  // repeatedly occupy a batch. No profile, answer or evaluation text is read.
  const rows = await client.$queryRaw<Candidate[]>(Prisma.sql`
    SELECT e.id, e.group_membership_id AS "groupMembershipId",
      e.service_program_id AS "serviceProgramId", e.updated_at AS "updatedAt",
      e.ends_at AS "endsAt", m.user_id AS "userId"
    FROM program_enrollments e
    JOIN service_programs p ON p.id = e.service_program_id
      AND p.workspace_id = e.workspace_id AND p.group_id = e.group_id
    JOIN group_memberships m ON m.id = e.group_membership_id
      AND m.workspace_id = e.workspace_id AND m.group_id = e.group_id
    JOIN groups g ON g.id = e.group_id AND g.workspace_id = e.workspace_id
    WHERE ${expiryScopePredicate(input)}
    ORDER BY e.ends_at ASC, e.id ASC LIMIT ${TRAINING_ENROLLMENT_EXPIRY_BATCH_LIMIT + 1}
  `);
  const candidates = rows.slice(0, TRAINING_ENROLLMENT_EXPIRY_BATCH_LIMIT);
  const summary = {
    candidates: candidates.length,
    expired: 0,
    skipped: 0,
    conflicts: 0,
    hasMore: rows.length > TRAINING_ENROLLMENT_EXPIRY_BATCH_LIMIT,
  };
  for (const candidate of candidates) {
    if (candidate.endsAt > input.now) {
      summary.skipped += 1;
      continue;
    }
    try {
      const changed = await client.$transaction(
        async (tx) => {
          const personalScope = {
            ...scope,
            programEnrollmentId: candidate.id,
            actorUserId: candidate.userId,
          };
          await lockTrainingEnrollmentData(tx, personalScope);
          const [enrollment, member, program] = await Promise.all([
            tx.programEnrollment.findFirst({
              where: {
                ...scope,
                id: candidate.id,
                groupMembershipId: candidate.groupMembershipId,
                serviceProgramId: candidate.serviceProgramId,
                status: 'ACTIVE',
                updatedAt: candidate.updatedAt,
                endsAt: candidate.endsAt,
                startsAt: { not: null, lte: candidate.endsAt },
                paidPurchase: null,
              },
              select: { id: true },
            }),
            tx.groupMembership.findFirst({
              where: {
                ...scope,
                id: candidate.groupMembershipId,
                userId: candidate.userId,
                serviceRole: 'PARTICIPANT',
                group: { workspaceId: input.workspaceId },
              },
              select: { id: true },
            }),
            tx.serviceProgram.findFirst({
              where: {
                ...scope,
                id: candidate.serviceProgramId,
                settings: { path: ['moduleKey'], equals: AI_TRAINING_V1_MODULE_KEY },
              },
              select: { id: true },
            }),
          ]);
          if (!enrollment || !member || !program) return false;
          const update = await tx.programEnrollment.updateMany({
            where: {
              ...scope,
              id: candidate.id,
              groupMembershipId: candidate.groupMembershipId,
              serviceProgramId: candidate.serviceProgramId,
              status: 'ACTIVE',
              updatedAt: candidate.updatedAt,
              endsAt: candidate.endsAt,
              startsAt: { not: null, lte: candidate.endsAt },
              paidPurchase: null,
            },
            data: { status: 'EXPIRED' },
          });
          if (update.count !== 1) return false;
          await stopTrainingEnrollmentEvaluations(tx, personalScope, input.now);
          await tx.programActionEvent.create({
            data: {
              ...scope,
              programEnrollmentId: candidate.id,
              eventType: TRAINING_ENROLLMENT_EXPIRED_EVENT,
              sourceResourceType: 'PROGRAM_ENROLLMENT',
              sourceResourceId: candidate.id,
              idempotencyKey: `training-expired:${candidate.id}:${candidate.updatedAt.toISOString()}`,
              actorUserId: null,
              occurredAt: input.now,
              metadata: {
                source: 'SYSTEM',
                reasonCode: 'ENROLLMENT_PERIOD_ENDED',
                previousStatus: 'ACTIVE',
                status: 'EXPIRED',
                endsAt: candidate.endsAt.toISOString(),
              },
            },
          });
          return true;
        },
        { isolationLevel: 'Serializable', timeout: 30000 },
      );
      if (changed) summary.expired += 1;
      else summary.skipped += 1;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2034' || (error.code === 'P2010' && error.meta?.['code'] === '40001'))
      ) {
        summary.conflicts += 1;
      } else throw error;
    }
  }
  return summary;
}
