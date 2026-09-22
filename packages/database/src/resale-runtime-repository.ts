import {
  RESALE_PROGRAM_STATES,
  RESALE_USER_ACTION_EVENTS,
  programDayAt,
  type AiResaleRuntimeCandidate,
  type AiResaleRuntimeRepository,
} from '@bunshin/capability-resale';
import { Prisma, type PrismaClient } from '@prisma/client';
import {
  enrollMembershipInProgram,
  runtimePrograms,
  type Membership,
  type RuntimeProgram,
} from './resale-runtime-enrollment';
import {
  activeRuntimeScope,
  nextProgramState,
  sameDecision,
  StaleRuntimeWrite,
} from './resale-runtime-state';
export class PrismaAiResaleRuntimeRepository implements AiResaleRuntimeRepository {
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

  async listDueCandidates(input: Parameters<AiResaleRuntimeRepository['listDueCandidates']>[0]) {
    const programs = await runtimePrograms(this.client);
    const candidates: AiResaleRuntimeCandidate[] = [];
    for (const program of programs) {
      const dueIds = await this.client.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT pe."id"
        FROM "program_enrollments" pe
        INNER JOIN "group_memberships" gm
          ON gm."id" = pe."group_membership_id"
          AND gm."workspace_id" = pe."workspace_id"
          AND gm."group_id" = pe."group_id"
        LEFT JOIN "program_progress_snapshots" progress
          ON progress."program_enrollment_id" = pe."id"
        WHERE pe."workspace_id" = ${program.workspaceId}::uuid
          AND pe."group_id" = ${program.groupId}::uuid
          AND pe."service_program_id" = ${program.id}::uuid
          AND pe."status" = 'ACTIVE'
          AND gm."status" = 'ACTIVE'
          AND pe."starts_at" IS NOT NULL
          AND pe."starts_at" <= ${input.now}
          AND (progress."state_key" IS NULL OR progress."state_key" <> 'COMPLETED')
          AND (
            progress."id" IS NULL OR
            progress."next_evaluation_at" <= ${input.now} OR
            (
              ${program.settings.policyKey === 'FREE_7D'} AND
              pe."ends_at" IS NOT NULL AND
              pe."ends_at" <= ${input.now} AND
              NOT EXISTS (
                SELECT 1 FROM "program_action_events" event
                WHERE event."workspace_id" = pe."workspace_id"
                  AND event."group_id" = pe."group_id"
                  AND event."program_enrollment_id" = pe."id"
                  AND event."event_type" = 'DAY7_CLASSIFIED'
              )
            )
          )
        ORDER BY pe."starts_at" ASC, pe."id" ASC
        LIMIT ${input.limit + 1}
      `);
      const enrollments = await this.client.programEnrollment.findMany({
        where: {
          id: { in: dueIds.map(({ id }) => id) },
        },
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      });
      for (const enrollment of enrollments) {
        if (enrollment.startsAt === null) continue;
        const [membership, progress, items, events, completedMissionCount] = await Promise.all([
          this.client.groupMembership.findFirst({
            where: {
              id: enrollment.groupMembershipId,
              workspaceId: enrollment.workspaceId,
              groupId: enrollment.groupId,
              status: 'ACTIVE',
            },
          }),
          this.client.programProgressSnapshot.findFirst({
            where: {
              workspaceId: enrollment.workspaceId,
              groupId: enrollment.groupId,
              programEnrollmentId: enrollment.id,
            },
          }),
          this.client.resaleItem.findMany({
            where: {
              workspaceId: enrollment.workspaceId,
              groupId: enrollment.groupId,
              programEnrollmentId: enrollment.id,
            },
            orderBy: [{ foundAt: 'asc' }, { id: 'asc' }],
          }),
          this.client.programActionEvent.findMany({
            where: {
              workspaceId: enrollment.workspaceId,
              groupId: enrollment.groupId,
              programEnrollmentId: enrollment.id,
            },
            select: { eventType: true, actorUserId: true, occurredAt: true },
            orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
          }),
          this.client.programMissionAssignment.count({
            where: {
              workspaceId: enrollment.workspaceId,
              groupId: enrollment.groupId,
              programEnrollmentId: enrollment.id,
              status: 'COMPLETED',
            },
          }),
        ]);
        if (!membership) continue;
        const programDay = programDayAt({
          startsAt: enrollment.startsAt,
          now: input.now,
          timeZone: program.settings.timeZone,
        });
        const daySevenClassified = events.some(({ eventType }) => eventType === 'DAY7_CLASSIFIED');
        const classificationDue =
          program.settings.policyKey === 'FREE_7D' && programDay > 7 && !daySevenClassified;
        const scheduledDue =
          progress === null ||
          (progress.nextEvaluationAt !== null && progress.nextEvaluationAt <= input.now);
        if (progress?.stateKey === 'COMPLETED' || (!classificationDue && !scheduledDue)) {
          continue;
        }
        const currentAssignment =
          progress?.currentAssignmentId === null || progress === null
            ? null
            : await this.client.programMissionAssignment.findFirst({
                where: {
                  id: progress.currentAssignmentId,
                  workspaceId: enrollment.workspaceId,
                  groupId: enrollment.groupId,
                  programEnrollmentId: enrollment.id,
                },
              });
        const lastUserActionAt =
          [...events]
            .reverse()
            .find(
              (event) =>
                event.actorUserId === membership.userId &&
                RESALE_USER_ACTION_EVENTS.includes(
                  event.eventType as (typeof RESALE_USER_ACTION_EVENTS)[number],
                ),
            )?.occurredAt ?? null;
        const stateKey = RESALE_PROGRAM_STATES.includes(
          progress?.stateKey as (typeof RESALE_PROGRAM_STATES)[number],
        )
          ? (progress!.stateKey as (typeof RESALE_PROGRAM_STATES)[number])
          : 'ACTIVE';
        const waitBaseline =
          currentAssignment?.actionMode === 'WAIT' ? currentAssignment.reevaluateAt : null;
        candidates.push({
          workspaceId: enrollment.workspaceId,
          groupId: enrollment.groupId,
          programEnrollmentId: enrollment.id,
          programTemplateVersionId: program.programTemplateVersionId,
          participantUserId: membership.userId,
          startsAt: enrollment.startsAt,
          programDay,
          settings: program.settings,
          programState: stateKey,
          activityBaselineAt:
            waitBaseline !== null && waitBaseline > enrollment.startsAt
              ? waitBaseline
              : enrollment.startsAt,
          lastUserActionAt,
          completedMissionCount,
          progressRevision: progress?.revision ?? null,
          daySevenClassified,
          items,
          eventTypes: events.map(({ eventType }) => eventType),
        });
        if (candidates.length > input.limit) break;
      }
      if (candidates.length > input.limit) break;
    }
    return {
      candidates: candidates.slice(0, input.limit),
      truncated: candidates.length > input.limit,
    };
  }

  async findCandidate(input: Parameters<AiResaleRuntimeRepository['findCandidate']>[0]) {
    const enrollment = await this.client.programEnrollment.findFirst({
      where: {
        id: input.programEnrollmentId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        status: 'ACTIVE',
        startsAt: { not: null },
      },
    });
    if (!enrollment?.startsAt) return null;
    const program = (await runtimePrograms(this.client, input)).find(
      (item) => item.id === enrollment.serviceProgramId,
    );
    if (!program) return null;
    const [membership, progress, items, events, completedMissionCount] = await Promise.all([
      this.client.groupMembership.findFirst({
        where: {
          id: enrollment.groupMembershipId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          userId: input.actorUserId,
          status: 'ACTIVE',
        },
      }),
      this.client.programProgressSnapshot.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: enrollment.id,
        },
      }),
      this.client.resaleItem.findMany({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: enrollment.id,
        },
        orderBy: [{ foundAt: 'asc' }, { id: 'asc' }],
      }),
      this.client.programActionEvent.findMany({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: enrollment.id,
        },
        select: { eventType: true, actorUserId: true, occurredAt: true },
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      }),
      this.client.programMissionAssignment.count({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: enrollment.id,
          status: 'COMPLETED',
        },
      }),
    ]);
    if (!membership) return null;
    const currentAssignment =
      progress?.currentAssignmentId === null || progress === null
        ? null
        : await this.client.programMissionAssignment.findFirst({
            where: {
              id: progress.currentAssignmentId,
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              programEnrollmentId: enrollment.id,
            },
          });
    const lastUserActionAt =
      [...events]
        .reverse()
        .find(
          (event) =>
            event.actorUserId === membership.userId &&
            RESALE_USER_ACTION_EVENTS.includes(
              event.eventType as (typeof RESALE_USER_ACTION_EVENTS)[number],
            ),
        )?.occurredAt ?? null;
    const stateKey = RESALE_PROGRAM_STATES.includes(
      progress?.stateKey as (typeof RESALE_PROGRAM_STATES)[number],
    )
      ? (progress!.stateKey as (typeof RESALE_PROGRAM_STATES)[number])
      : 'ACTIVE';
    const waitBaseline =
      currentAssignment?.actionMode === 'WAIT' ? currentAssignment.reevaluateAt : null;
    return {
      workspaceId: enrollment.workspaceId,
      groupId: enrollment.groupId,
      programEnrollmentId: enrollment.id,
      programTemplateVersionId: program.programTemplateVersionId,
      participantUserId: membership.userId,
      startsAt: enrollment.startsAt,
      programDay: programDayAt({
        startsAt: enrollment.startsAt,
        now: input.now,
        timeZone: program.settings.timeZone,
      }),
      settings: program.settings,
      programState: stateKey,
      activityBaselineAt:
        waitBaseline !== null && waitBaseline > enrollment.startsAt
          ? waitBaseline
          : enrollment.startsAt,
      lastUserActionAt,
      completedMissionCount,
      progressRevision: progress?.revision ?? null,
      daySevenClassified: events.some(({ eventType }) => eventType === 'DAY7_CLASSIFIED'),
      items,
      eventTypes: events.map(({ eventType }) => eventType),
    };
  }

  async persistDecision(input: Parameters<AiResaleRuntimeRepository['persistDecision']>[0]) {
    try {
      return await this.client.$transaction(
        async (tx) => {
          const enrollment = await activeRuntimeScope(tx, input.candidate);
          if (!enrollment) return 'NOT_FOUND' as const;
          const progress = await tx.programProgressSnapshot.findUnique({
            where: { programEnrollmentId: enrollment.id },
          });
          if ((progress?.revision ?? null) !== input.candidate.progressRevision) {
            throw new StaleRuntimeWrite();
          }
          const latest = await tx.programMissionAssignment.findFirst({
            where: { programEnrollmentId: enrollment.id },
            orderBy: { sequence: 'desc' },
          });
          const sequence = (latest?.sequence ?? 0) + 1;
          if (input.decision.target !== null) {
            const target = await tx.resaleItem.findFirst({
              where: {
                id: input.decision.target.resourceId,
                workspaceId: input.candidate.workspaceId,
                groupId: input.candidate.groupId,
                programEnrollmentId: enrollment.id,
              },
              select: { id: true },
            });
            if (input.decision.target.resourceType !== 'RESALE_ITEM' || !target) {
              return 'NOT_FOUND' as const;
            }
          }
          const assignment = await tx.programMissionAssignment.create({
            data: {
              workspaceId: input.candidate.workspaceId,
              groupId: input.candidate.groupId,
              programEnrollmentId: enrollment.id,
              programTemplateVersionId: input.candidate.programTemplateVersionId,
              sequence,
              routeKey: input.candidate.settings.routeKey,
              phaseKey: input.candidate.settings.phaseKey,
              missionDefinitionKey: input.decision.actionKey,
              actionMode: input.decision.mode,
              reasonCode: input.decision.reasonCode,
              variantKey: null,
              targetResourceType: input.decision.target?.resourceType ?? null,
              targetResourceId: input.decision.target?.resourceId ?? null,
              displaySnapshot: input.displaySnapshot as unknown as Prisma.InputJsonValue,
              ruleVersion: input.decision.ruleVersion,
              presentedAt: input.evaluatedAt,
              reevaluateAt: input.decision.reevaluateAt,
            },
          });
          const snapshot = {
            currentAssignmentId: assignment.id,
            routeKey: input.candidate.settings.routeKey,
            phaseKey: input.candidate.settings.phaseKey,
            stateKey: nextProgramState(input.decision.actionKey, input.decision.mode),
            bottleneckKey: input.decision.reasonCode,
            completedMissionCount: input.candidate.completedMissionCount,
            ruleVersion: input.decision.ruleVersion,
            lastActionAt: input.candidate.lastUserActionAt,
            nextEvaluationAt: input.decision.reevaluateAt,
            calculatedAt: input.evaluatedAt,
          };
          if (progress) {
            const updated = await tx.programProgressSnapshot.updateMany({
              where: { id: progress.id, revision: input.candidate.progressRevision! },
              data: { ...snapshot, revision: { increment: 1 } },
            });
            if (updated.count !== 1) throw new StaleRuntimeWrite();
          } else {
            await tx.programProgressSnapshot.create({
              data: {
                workspaceId: input.candidate.workspaceId,
                groupId: input.candidate.groupId,
                programEnrollmentId: enrollment.id,
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
      if (error instanceof StaleRuntimeWrite) return 'STALE';
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

  async persistDaySevenClassification(
    input: Parameters<AiResaleRuntimeRepository['persistDaySevenClassification']>[0],
  ) {
    try {
      return await this.client.$transaction(
        async (tx) => {
          const enrollment = await activeRuntimeScope(tx, input.candidate, ['ACTIVE', 'COMPLETED']);
          if (!enrollment) return 'NOT_FOUND' as const;
          const existingEvent = await tx.programActionEvent.findUnique({
            where: {
              workspaceId_groupId_idempotencyKey: {
                workspaceId: input.candidate.workspaceId,
                groupId: input.candidate.groupId,
                idempotencyKey: `ai-resale:day7:${enrollment.id}`,
              },
            },
          });
          if (existingEvent) return 'ALREADY_APPLIED' as const;
          if (enrollment.status !== 'ACTIVE') return 'NOT_FOUND' as const;
          const progress = await tx.programProgressSnapshot.findUnique({
            where: { programEnrollmentId: enrollment.id },
          });
          if ((progress?.revision ?? null) !== input.candidate.progressRevision) {
            throw new StaleRuntimeWrite();
          }
          await tx.programActionEvent.create({
            data: {
              workspaceId: input.candidate.workspaceId,
              groupId: input.candidate.groupId,
              programEnrollmentId: enrollment.id,
              missionAssignmentId: null,
              eventType: 'DAY7_CLASSIFIED',
              sourceResourceType: null,
              sourceResourceId: null,
              idempotencyKey: `ai-resale:day7:${enrollment.id}`,
              schemaVersion: 1,
              metadata: {
                classification: input.classification,
                programDay: input.candidate.programDay,
                policyKey: input.candidate.settings.policyKey,
              },
              actorUserId: null,
              occurredAt: input.evaluatedAt,
            },
          });
          const snapshot = {
            currentAssignmentId: null,
            routeKey: input.candidate.settings.routeKey,
            phaseKey: input.candidate.settings.phaseKey,
            stateKey: 'COMPLETED',
            bottleneckKey: input.classification,
            completedMissionCount: input.candidate.completedMissionCount,
            ruleVersion: 'AI_RESALE_V1_DAY7_1',
            lastActionAt: input.candidate.lastUserActionAt,
            nextEvaluationAt: null,
            calculatedAt: input.evaluatedAt,
          };
          if (progress) {
            const updated = await tx.programProgressSnapshot.updateMany({
              where: { id: progress.id, revision: input.candidate.progressRevision! },
              data: { ...snapshot, revision: { increment: 1 } },
            });
            if (updated.count !== 1) throw new StaleRuntimeWrite();
          } else {
            await tx.programProgressSnapshot.create({
              data: {
                workspaceId: input.candidate.workspaceId,
                groupId: input.candidate.groupId,
                programEnrollmentId: enrollment.id,
                programTemplateVersionId: input.candidate.programTemplateVersionId,
                ...snapshot,
              },
            });
          }
          await tx.programEnrollment.update({
            where: { id: enrollment.id },
            data: { status: 'COMPLETED' },
          });
          return 'APPLIED' as const;
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (error instanceof StaleRuntimeWrite) return 'STALE';
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2034'].includes(error.code)
      ) {
        const event = await this.client.programActionEvent.findUnique({
          where: {
            workspaceId_groupId_idempotencyKey: {
              workspaceId: input.candidate.workspaceId,
              groupId: input.candidate.groupId,
              idempotencyKey: `ai-resale:day7:${input.candidate.programEnrollmentId}`,
            },
          },
        });
        return event ? 'ALREADY_APPLIED' : 'STALE';
      }
      throw error;
    }
  }
}
