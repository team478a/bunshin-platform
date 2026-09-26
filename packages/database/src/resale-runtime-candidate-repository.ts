import {
  RESALE_PROGRAM_STATES,
  RESALE_USER_ACTION_EVENTS,
  programDayAt,
  type AiResaleRuntimeCandidate,
  type AiResaleRuntimeRepository,
} from '@bunshin/capability-resale';
import { Prisma, type PrismaClient } from '@prisma/client';
import { runtimePrograms } from './resale-runtime-enrollment';

export class PrismaAiResaleRuntimeCandidateRepository {
  constructor(private readonly client: PrismaClient) {}

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
}
