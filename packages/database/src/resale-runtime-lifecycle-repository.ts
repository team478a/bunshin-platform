import type { AiResaleRuntimeRepository } from '@bunshin/capability-resale';
import { Prisma, type PrismaClient } from '@prisma/client';
import {
  enrollMembershipInProgram,
  runtimePrograms,
  type Membership,
  type RuntimeProgram,
} from './resale-runtime-enrollment';

export class PrismaAiResaleRuntimeLifecycleRepository {
  constructor(private readonly client: PrismaClient) {}

  async expireEndedPaidParticipants(
    input: Parameters<AiResaleRuntimeRepository['expireEndedPaidParticipants']>[0],
  ) {
    const paidPrograms = (await runtimePrograms(this.client)).filter(
      ({ settings }) => settings.policyKey === 'PAID_90D',
    );
    if (paidPrograms.length === 0) {
      return { scanned: 0, expired: 0, failures: 0, truncated: false };
    }
    const candidates = await this.client.programEnrollment.findMany({
      where: {
        status: 'ACTIVE',
        endsAt: { lte: input.now },
        OR: paidPrograms.map((program) => ({
          workspaceId: program.workspaceId,
          groupId: program.groupId,
          serviceProgramId: program.id,
        })),
      },
      orderBy: [{ endsAt: 'asc' }, { id: 'asc' }],
      take: input.limit + 1,
    });
    const selected = candidates.slice(0, input.limit);
    let expired = 0;
    let failures = 0;
    for (const enrollment of selected) {
      try {
        const applied = await this.client.$transaction(
          async (tx) => {
            const changed = await tx.programEnrollment.updateMany({
              where: {
                id: enrollment.id,
                workspaceId: enrollment.workspaceId,
                groupId: enrollment.groupId,
                status: 'ACTIVE',
                endsAt: { lte: input.now },
              },
              data: { status: 'EXPIRED' },
            });
            if (changed.count !== 1) return false;
            await tx.programMissionAssignment.updateMany({
              where: {
                workspaceId: enrollment.workspaceId,
                groupId: enrollment.groupId,
                programEnrollmentId: enrollment.id,
                status: { in: ['PRESENTED', 'STARTED'] },
              },
              data: { status: 'SKIPPED', skippedAt: input.now },
            });
            await tx.programProgressSnapshot.updateMany({
              where: {
                workspaceId: enrollment.workspaceId,
                groupId: enrollment.groupId,
                programEnrollmentId: enrollment.id,
              },
              data: {
                stateKey: 'COMPLETED',
                currentAssignmentId: null,
                nextEvaluationAt: null,
                calculatedAt: input.now,
                revision: { increment: 1 },
              },
            });
            await tx.programAuditLog.create({
              data: {
                workspaceId: enrollment.workspaceId,
                groupId: enrollment.groupId,
                resourceType: 'PROGRAM_ENROLLMENT',
                resourceId: enrollment.id,
                action: 'EXPIRED',
                beforeData: { status: enrollment.status, endsAt: enrollment.endsAt },
                afterData: { status: 'EXPIRED', expiredAt: input.now },
                performedByUserId: enrollment.invitedByUserId,
              },
            });
            return true;
          },
          { isolationLevel: 'Serializable' },
        );
        if (applied) expired += 1;
      } catch {
        failures += 1;
      }
    }
    return {
      scanned: selected.length,
      expired,
      failures,
      truncated: candidates.length > input.limit,
    };
  }

  async enrollEligibleFreeParticipants(
    input: Parameters<AiResaleRuntimeRepository['enrollEligibleFreeParticipants']>[0],
  ) {
    const programs = (await runtimePrograms(this.client)).filter(
      (program) => program.settings.automaticEnrollment && program.settings.policyKey === 'FREE_7D',
    );
    const candidates: Array<{ membership: Membership; program: RuntimeProgram }> = [];
    for (const program of programs) {
      const rows = await this.client.$queryRaw<Membership[]>(Prisma.sql`
        SELECT gm."id", gm."workspace_id" AS "workspaceId", gm."group_id" AS "groupId",
               gm."user_id" AS "userId", gm."consented_at" AS "consentedAt",
               gm."created_at" AS "createdAt"
        FROM "group_memberships" gm
        WHERE gm."workspace_id" = ${program.workspaceId}::uuid
          AND gm."group_id" = ${program.groupId}::uuid
          AND gm."service_role" = 'PARTICIPANT'
          AND gm."status" = 'ACTIVE'
          AND gm."consented_at" IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM "program_enrollments" pe
            WHERE pe."group_membership_id" = gm."id"
              AND pe."service_program_id" = ${program.id}::uuid
          )
        ORDER BY gm."consented_at" ASC, gm."id" ASC
        LIMIT ${input.limit + 1}
      `);
      for (const membership of rows) candidates.push({ membership, program });
      if (candidates.length > input.limit) break;
    }
    const selected = candidates.slice(0, input.limit);
    let enrolled = 0;
    let skipped = 0;
    let failures = 0;
    for (const candidate of selected) {
      try {
        const created = await this.client.$transaction(
          (tx) => enrollMembershipInProgram(tx, { ...candidate, now: input.now }),
          { isolationLevel: 'Serializable' },
        );
        if (created) enrolled += 1;
        else skipped += 1;
      } catch {
        failures += 1;
      }
    }
    return {
      scanned: selected.length,
      enrolled,
      skipped,
      failures,
      truncated: candidates.length > input.limit,
    };
  }
}
