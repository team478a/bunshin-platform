import 'server-only';

import { EnqueueJob, type JobEnvironment } from '@bunshin/application';
import {
  AI_RESALE_V1_MODULE_KEY,
  buildAiResaleActionLineMessage,
  parseAiResaleActionDisplaySnapshot,
} from '@bunshin/capability-resale';
import { getServerEnvironment } from '@bunshin/config';

export type AiResaleActionLineScheduleSummary = {
  programs: number;
  candidates: number;
  broadcasts: number;
  recipients: number;
  skipped: number;
  failures: number;
  truncated: boolean;
};

const automationKey = (environment: JobEnvironment, assignmentId: string) =>
  `ai-resale-action:${environment}:${assignmentId}`;

export async function scheduleAiResaleActionLineDeliveries(input: {
  environment: JobEnvironment;
  now?: Date;
  limit?: number;
}): Promise<AiResaleActionLineScheduleSummary> {
  const db = await import('@bunshin/database');
  const now = input.now ?? new Date();
  const limit = Math.min(Math.max(input.limit ?? 500, 1), 500);
  const summary: AiResaleActionLineScheduleSummary = {
    programs: 0,
    candidates: 0,
    broadcasts: 0,
    recipients: 0,
    skipped: 0,
    failures: 0,
    truncated: false,
  };
  const programs = await db.prisma.serviceProgram.findMany({
    where: {
      status: 'ACTIVE',
      settings: { path: ['moduleKey'], equals: AI_RESALE_V1_MODULE_KEY },
    },
    select: { id: true, workspaceId: true, groupId: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: 500,
  });
  summary.programs = programs.length;

  for (const program of programs) {
    if (summary.candidates >= limit) {
      summary.truncated = true;
      break;
    }
    try {
      const remaining = limit - summary.candidates;
      const keyPrefix = `ai-resale-action:${input.environment}:`;
      const [configuration, actor, routingPolicy, candidateRows] = await Promise.all([
        db.prisma.serviceConfiguration.findFirst({
          where: {
            workspaceId: program.workspaceId,
            groupId: program.groupId,
            group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
            registration: { is: { lineEnabled: true } },
            AND: [
              { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
              { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
            ],
          },
          select: { slug: true, displayName: true },
        }),
        db.prisma.groupMembership.findFirst({
          where: {
            workspaceId: program.workspaceId,
            groupId: program.groupId,
            status: 'ACTIVE',
            serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
            user: { status: 'ACTIVE' },
          },
          orderBy: { createdAt: 'asc' },
          select: { userId: true },
        }),
        db.prisma.groupLineRoutingPolicy.findUnique({
          where: {
            workspaceId_groupId_environment: {
              workspaceId: program.workspaceId,
              groupId: program.groupId,
              environment: input.environment,
            },
          },
          select: { mode: true, pilotEnabled: true },
        }),
        db.prisma.$queryRaw<
          Array<{
            programEnrollmentId: string;
            groupMembershipId: string;
            currentAssignmentId: string;
            broadcastId: string | null;
          }>
        >`
          SELECT
            enrollment."id" AS "programEnrollmentId",
            enrollment."group_membership_id" AS "groupMembershipId",
            progress."current_assignment_id" AS "currentAssignmentId",
            broadcast."id" AS "broadcastId"
          FROM "program_enrollments" enrollment
          INNER JOIN "group_memberships" membership
            ON membership."id" = enrollment."group_membership_id"
            AND membership."workspace_id" = enrollment."workspace_id"
            AND membership."group_id" = enrollment."group_id"
          INNER JOIN "users" participant
            ON participant."id" = membership."user_id"
          INNER JOIN "program_progress_snapshots" progress
            ON progress."program_enrollment_id" = enrollment."id"
            AND progress."workspace_id" = enrollment."workspace_id"
            AND progress."group_id" = enrollment."group_id"
          INNER JOIN "program_mission_assignments" assignment
            ON assignment."id" = progress."current_assignment_id"
            AND assignment."program_enrollment_id" = enrollment."id"
            AND assignment."workspace_id" = enrollment."workspace_id"
            AND assignment."group_id" = enrollment."group_id"
          LEFT JOIN "service_line_broadcasts" broadcast
            ON broadcast."automation_key" = (${keyPrefix} || assignment."id"::text)
          WHERE enrollment."workspace_id" = ${program.workspaceId}::uuid
            AND enrollment."group_id" = ${program.groupId}::uuid
            AND enrollment."service_program_id" = ${program.id}::uuid
            AND enrollment."status" = 'ACTIVE'
            AND enrollment."starts_at" IS NOT NULL
            AND enrollment."starts_at" <= ${now}
            AND membership."status" = 'ACTIVE'
            AND membership."service_role" = 'PARTICIPANT'
            AND membership."consented_at" IS NOT NULL
            AND participant."status" = 'ACTIVE'
            AND assignment."status" = 'PRESENTED'
            AND (broadcast."id" IS NULL OR broadcast."status" = 'SCHEDULED')
          ORDER BY assignment."presented_at" ASC, assignment."id" ASC
          LIMIT ${remaining + 1}
        `,
      ]);
      if (!configuration || !actor || !candidateRows.length) {
        summary.skipped += candidateRows.length;
        continue;
      }
      if (candidateRows.length > remaining) summary.truncated = true;
      const candidates = candidateRows.slice(0, remaining);
      const membershipIds = candidates.map((item) => item.groupMembershipId);
      const [memberships, assignments] = await Promise.all([
        db.prisma.groupMembership.findMany({
          where: {
            workspaceId: program.workspaceId,
            groupId: program.groupId,
            id: { in: membershipIds },
            status: 'ACTIVE',
            consentedAt: { not: null },
            serviceRole: 'PARTICIPANT',
            user: { status: 'ACTIVE' },
          },
          select: { id: true, userId: true },
        }),
        db.prisma.programMissionAssignment.findMany({
          where: {
            workspaceId: program.workspaceId,
            groupId: program.groupId,
            id: { in: candidates.map((item) => item.currentAssignmentId) },
            status: 'PRESENTED',
          },
          orderBy: [{ presentedAt: 'asc' }, { id: 'asc' }],
        }),
      ]);
      const membershipById = new Map(memberships.map((item) => [item.id, item]));
      const candidateByAssignment = new Map(
        candidates.map((item) => [item.currentAssignmentId, item]),
      );
      const mode = routingPolicy?.mode ?? 'SHARED';
      if (mode === 'DISABLED' || (mode === 'DEDICATED' && !routingPolicy?.pilotEnabled)) {
        summary.skipped += assignments.length;
        continue;
      }
      const eligibleMembershipIds = new Set<string>();
      if (mode === 'DEDICATED') {
        const lineConfiguration = await db.prisma.groupLineChannelConfiguration.findFirst({
          where: {
            workspaceId: program.workspaceId,
            groupId: program.groupId,
            environment: input.environment,
            status: 'ACTIVE',
            lastVerifiedAt: { not: null },
            lastErrorCategory: null,
            globallyPaused: false,
          },
          select: { id: true },
        });
        if (lineConfiguration) {
          const connections = await db.prisma.groupLineConnection.findMany({
            where: {
              workspaceId: program.workspaceId,
              groupId: program.groupId,
              configurationId: lineConfiguration.id,
              groupMembershipId: { in: memberships.map((item) => item.id) },
              status: 'ACTIVE',
              notificationConsentAt: { not: null },
              friendshipStatus: 'FOLLOWING',
            },
            select: { groupMembershipId: true },
          });
          connections.forEach((item) => eligibleMembershipIds.add(item.groupMembershipId));
        }
      } else {
        const lineConfiguration = await db.prisma.lineChannelConfiguration.findFirst({
          where: {
            environment: input.environment,
            status: 'ACTIVE',
            lastVerifiedAt: { not: null },
            lastErrorCategory: null,
            globallyPaused: false,
          },
          select: { id: true },
        });
        if (lineConfiguration) {
          const connections = await db.prisma.lineConnection.findMany({
            where: {
              environment: input.environment,
              workspaceId: program.workspaceId,
              userId: { in: memberships.map((item) => item.userId) },
              status: 'ACTIVE',
              notificationConsentAt: { not: null },
              friendshipStatus: 'FOLLOWING',
            },
            select: { userId: true },
          });
          const users = new Set(connections.map((item) => item.userId));
          memberships.forEach((item) => {
            if (users.has(item.userId)) eligibleMembershipIds.add(item.id);
          });
        }
      }

      for (const assignment of assignments) {
        summary.candidates += 1;
        const candidate = candidateByAssignment.get(assignment.id);
        const membership = candidate ? membershipById.get(candidate.groupMembershipId) : null;
        const display = parseAiResaleActionDisplaySnapshot(assignment.displaySnapshot);
        if (!candidate || !membership || !display) {
          summary.skipped += 1;
          continue;
        }
        if (!eligibleMembershipIds.has(membership.id)) {
          // Leave the assignment unscheduled so a later LINE connection can receive it.
          summary.skipped += 1;
          continue;
        }
        const key = automationKey(input.environment, assignment.id);
        if (candidate.broadcastId) {
          await new EnqueueJob(new db.PrismaJobRepository()).enqueue({
            environment: input.environment,
            workspaceId: program.workspaceId,
            correlationId: key,
            requestedBy: actor.userId,
            jobType: 'SERVICE_LINE_BROADCAST_DELIVER',
            payloadReference: `service-line-broadcast:${candidate.broadcastId}`,
            idempotencyKey: `${key}:deliver`,
            priority: 35,
            maxAttempts: 3,
            scheduledAt: now,
          });
          summary.skipped += 1;
          continue;
        }
        const actionUrl = new URL(
          `/s/${encodeURIComponent(configuration.slug)}/programs/${encodeURIComponent(candidate.programEnrollmentId)}`,
          getServerEnvironment().APP_URL,
        ).toString();
        const message = buildAiResaleActionLineMessage({
          serviceName: configuration.displayName,
          display,
          actionUrl,
        });
        const broadcast = await db.prisma.$transaction(async (tx) => {
          const row = await tx.serviceLineBroadcast.create({
            data: {
              workspaceId: program.workspaceId,
              groupId: program.groupId,
              title: display.mode === 'WAIT' ? '今日の待機案内' : '今日やること',
              message,
              automationKey: key,
              segmentCriteria: {
                kind: 'AI_RESALE_ACTION',
                programEnrollmentId: candidate.programEnrollmentId,
                assignmentId: assignment.id,
                actionKey: display.actionKey,
                actionMode: display.mode,
              },
              status: 'SCHEDULED',
              scheduledAt: now,
              createdByUserId: actor.userId,
              updatedByUserId: actor.userId,
            },
          });
          await tx.serviceLineBroadcastRecipient.create({
            data: {
              workspaceId: program.workspaceId,
              groupId: program.groupId,
              broadcastId: row.id,
              groupMembershipId: membership.id,
              userId: membership.userId,
            },
          });
          await tx.serviceLineBroadcastAuditLog.create({
            data: {
              workspaceId: program.workspaceId,
              groupId: program.groupId,
              broadcastId: row.id,
              action: 'AUTO_SCHEDULED',
              beforeData: {},
              afterData: {
                recipients: 1,
                environment: input.environment,
                programEnrollmentId: candidate.programEnrollmentId,
                assignmentId: assignment.id,
                actionKey: display.actionKey,
                actionMode: display.mode,
              },
              reason: 'AI物販V1の現在Actionを参加者本人へ通知',
              performedByUserId: actor.userId,
            },
          });
          return row;
        });
        await new EnqueueJob(new db.PrismaJobRepository()).enqueue({
          environment: input.environment,
          workspaceId: program.workspaceId,
          correlationId: key,
          requestedBy: actor.userId,
          jobType: 'SERVICE_LINE_BROADCAST_DELIVER',
          payloadReference: `service-line-broadcast:${broadcast.id}`,
          idempotencyKey: `${key}:deliver`,
          priority: 35,
          maxAttempts: 3,
          scheduledAt: now,
        });
        summary.broadcasts += 1;
        summary.recipients += 1;
      }
    } catch {
      summary.failures += 1;
    }
  }
  return summary;
}
