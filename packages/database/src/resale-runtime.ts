import {
  AI_RESALE_V1_MODULE_KEY,
  RESALE_PROGRAM_STATES,
  RESALE_USER_ACTION_EVENTS,
  parseAiResaleRuntimeSettings,
  programDayAt,
  type AiResaleRuntimeCandidate,
  type AiResaleRuntimeRepository,
  type AiResaleRuntimeSettings,
} from '@bunshin/capability-resale';
import { Prisma, type PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;
type Membership = {
  id: string;
  workspaceId: string;
  groupId: string;
  userId: string;
  consentedAt: Date | null;
  createdAt: Date;
};

type RuntimeProgram = {
  id: string;
  workspaceId: string;
  groupId: string;
  programTemplateVersionId: string;
  createdAt: Date;
  settings: AiResaleRuntimeSettings;
};

function zonedParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(value);
  const result = Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: result['year']!,
    month: result['month']!,
    day: result['day']!,
    hour: result['hour']!,
    minute: result['minute']!,
    second: result['second']!,
  };
}

export function addProgramCalendarDays(value: Date, days: number, timeZone: string) {
  const local = zonedParts(value, timeZone);
  const targetWall = Date.UTC(
    local.year,
    local.month - 1,
    local.day + days,
    local.hour,
    local.minute,
    local.second,
    value.getUTCMilliseconds(),
  );
  let candidate = new Date(targetWall);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const observed = zonedParts(candidate, timeZone);
    const observedWall = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
      value.getUTCMilliseconds(),
    );
    candidate = new Date(candidate.getTime() + targetWall - observedWall);
  }
  return candidate;
}

function jsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function supportModes(value: unknown) {
  if (!jsonObject(value) || !Array.isArray(value['supportModes'])) return [];
  return value['supportModes'].filter((entry): entry is string => typeof entry === 'string');
}

async function runtimePrograms(
  db: Db,
  scope?: { workspaceId: string; groupId: string },
): Promise<RuntimeProgram[]> {
  const rows = await db.serviceProgram.findMany({
    where: {
      ...(scope ?? {}),
      status: 'ACTIVE',
      settings: { path: ['moduleKey'], equals: AI_RESALE_V1_MODULE_KEY },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  return rows.flatMap((row) => {
    try {
      const settings = parseAiResaleRuntimeSettings(row.settings);
      return settings === null ? [] : [{ ...row, settings }];
    } catch {
      return [];
    }
  });
}

async function activeFreeOffering(db: Db, program: RuntimeProgram, now: Date) {
  const offering = await db.programOffering.findFirst({
    where: {
      workspaceId: program.workspaceId,
      groupId: program.groupId,
      serviceProgramId: program.id,
      status: 'ACTIVE',
      isFree: true,
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
    },
    orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
  });
  if (!offering) return null;
  const allowedModes = supportModes(offering.termsSnapshot);
  if (allowedModes.length > 0 && !allowedModes.includes(program.settings.supportMode)) return null;
  return offering;
}

async function enrollMembershipInProgram(
  db: Db,
  input: { membership: Membership; program: RuntimeProgram; now: Date },
) {
  const { membership, program, now } = input;
  if (
    !program.settings.automaticEnrollment ||
    program.settings.policyKey !== 'FREE_7D' ||
    membership.consentedAt === null
  ) {
    return false;
  }
  const [offering, publicRegistration] = await Promise.all([
    activeFreeOffering(db, program, now),
    db.serviceRegistrationPolicy.findFirst({
      where: {
        workspaceId: membership.workspaceId,
        groupId: membership.groupId,
        mode: 'PUBLIC',
      },
      select: { id: true },
    }),
  ]);
  if (!offering || !publicRegistration) return false;
  const enrollmentAvailableAt = offering.startsAt ?? offering.createdAt;
  const registrationAt = membership.consentedAt ?? membership.createdAt;
  const startsAt = registrationAt > enrollmentAvailableAt ? registrationAt : enrollmentAvailableAt;
  const created = await db.programEnrollment.createMany({
    data: [
      {
        workspaceId: membership.workspaceId,
        groupId: membership.groupId,
        groupMembershipId: membership.id,
        serviceProgramId: program.id,
        programOfferingId: offering.id,
        status: 'ACTIVE',
        supportMode: program.settings.supportMode,
        goalSnapshot: {
          source: 'PUBLIC_REGISTRATION',
          policyKey: program.settings.policyKey,
        },
        offeringSnapshot: {
          version: offering.version,
          isFree: offering.isFree,
          seller: offering.seller,
          priceOwner: offering.priceOwner,
          paymentOwner: offering.paymentOwner,
          apiCostOwner: offering.apiCostOwner,
          supportOwner: offering.supportOwner,
          contentOwner: offering.contentOwner,
          characterOwner: offering.characterOwner,
          terms: offering.termsSnapshot,
        },
        invitedByUserId: membership.userId,
        startsAt,
        endsAt: addProgramCalendarDays(startsAt, 7, program.settings.timeZone),
      },
    ],
    skipDuplicates: true,
  });
  if (created.count === 0) return false;
  const enrollment = await db.programEnrollment.findUniqueOrThrow({
    where: {
      groupMembershipId_serviceProgramId: {
        groupMembershipId: membership.id,
        serviceProgramId: program.id,
      },
    },
  });
  await db.programAuditLog.create({
    data: {
      workspaceId: membership.workspaceId,
      groupId: membership.groupId,
      resourceType: 'PROGRAM_ENROLLMENT',
      resourceId: enrollment.id,
      action: 'AUTO_ENROLLED',
      afterData: {
        id: enrollment.id,
        groupMembershipId: membership.id,
        serviceProgramId: program.id,
        programOfferingId: offering.id,
        policyKey: program.settings.policyKey,
        startsAt,
        endsAt: enrollment.endsAt,
      },
      performedByUserId: membership.userId,
    },
  });
  return true;
}

export async function autoEnrollAiResaleForRegistration(
  db: Db,
  input: { membership: Membership; now: Date },
) {
  const programs = await runtimePrograms(db, {
    workspaceId: input.membership.workspaceId,
    groupId: input.membership.groupId,
  });
  let enrolled = 0;
  for (const program of programs) {
    if (await enrollMembershipInProgram(db, { ...input, program })) enrolled += 1;
  }
  return enrolled;
}

class StaleRuntimeWrite extends Error {}

function nextProgramState(actionKey: string, mode: 'WORK' | 'WAIT') {
  if (actionKey === 'RECOVERY') return 'PAUSED' as const;
  return mode === 'WAIT' ? ('WAITING' as const) : ('ACTIVE' as const);
}

async function activeRuntimeScope(
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

function sameDecision(
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
