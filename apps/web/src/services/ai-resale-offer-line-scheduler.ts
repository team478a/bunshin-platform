import 'server-only';

import { EnqueueJob, type JobEnvironment } from '@bunshin/application';
import {
  AI_RESALE_V1_MODULE_KEY,
  buildAiResaleOfferLineMessage,
  parseAiResaleRuntimeSettings,
} from '@bunshin/capability-resale';
import { getServerEnvironment } from '@bunshin/config';

export type AiResaleOfferLineScheduleSummary = {
  programs: number;
  candidates: number;
  broadcasts: number;
  recipients: number;
  skipped: number;
  failures: number;
  truncated: boolean;
};

const automationKey = (environment: JobEnvironment, enrollmentId: string) =>
  `ai-resale-offer:${environment}:${enrollmentId}`;

export async function scheduleAiResaleOfferLineDeliveries(input: {
  environment: JobEnvironment;
  now?: Date;
  limit?: number;
}): Promise<AiResaleOfferLineScheduleSummary> {
  const db = await import('@bunshin/database');
  const now = input.now ?? new Date();
  const limit = Math.min(Math.max(input.limit ?? 500, 1), 500);
  const summary: AiResaleOfferLineScheduleSummary = {
    programs: 0,
    candidates: 0,
    broadcasts: 0,
    recipients: 0,
    skipped: 0,
    failures: 0,
    truncated: false,
  };
  const rows = await db.prisma.serviceProgram.findMany({
    where: {
      status: 'ACTIVE',
      settings: { path: ['moduleKey'], equals: AI_RESALE_V1_MODULE_KEY },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const programs = rows.filter((program) => {
    try {
      return parseAiResaleRuntimeSettings(program.settings)?.policyKey === 'FREE_7D';
    } catch {
      return false;
    }
  });
  summary.programs = programs.length;
  const offers = new db.PrismaAiResaleOfferRepository(db.prisma);

  for (const program of programs) {
    if (summary.candidates >= limit) {
      summary.truncated = true;
      break;
    }
    try {
      const remaining = limit - summary.candidates;
      const keyPrefix = `ai-resale-offer:${input.environment}:`;
      const candidates = await db.prisma.$queryRaw<
        Array<{
          freeEnrollmentId: string;
          groupMembershipId: string;
          userId: string;
          broadcastId: string | null;
        }>
      >`
        SELECT
          enrollment."id" AS "freeEnrollmentId",
          membership."id" AS "groupMembershipId",
          membership."user_id" AS "userId",
          broadcast."id" AS "broadcastId"
        FROM "program_action_events" classified
        INNER JOIN "program_enrollments" enrollment
          ON enrollment."id" = classified."program_enrollment_id"
          AND enrollment."workspace_id" = classified."workspace_id"
          AND enrollment."group_id" = classified."group_id"
        INNER JOIN "group_memberships" membership
          ON membership."id" = enrollment."group_membership_id"
          AND membership."workspace_id" = enrollment."workspace_id"
          AND membership."group_id" = enrollment."group_id"
        INNER JOIN "users" participant ON participant."id" = membership."user_id"
        LEFT JOIN "service_line_broadcasts" broadcast
          ON broadcast."automation_key" = (${keyPrefix} || enrollment."id"::text)
        WHERE classified."workspace_id" = ${program.workspaceId}::uuid
          AND classified."group_id" = ${program.groupId}::uuid
          AND classified."event_type" = 'DAY7_CLASSIFIED'
          AND enrollment."service_program_id" = ${program.id}::uuid
          AND enrollment."status" = 'COMPLETED'
          AND membership."status" = 'ACTIVE'
          AND membership."service_role" = 'PARTICIPANT'
          AND membership."consented_at" IS NOT NULL
          AND participant."status" = 'ACTIVE'
          AND (broadcast."id" IS NULL OR broadcast."status" = 'SCHEDULED')
          AND NOT EXISTS (
            SELECT 1
            FROM "program_action_events" handled
            WHERE handled."workspace_id" = classified."workspace_id"
              AND handled."group_id" = classified."group_id"
              AND handled."program_enrollment_id" = classified."program_enrollment_id"
              AND handled."event_type" IN (
                'STANDARD_OFFER_SHOWN',
                'STANDARD_OFFER_DECLINED',
                'STANDARD_OFFER_SELECTED',
                'MONITOR_OFFER_SELECTED',
                'PAID_ENROLLED'
              )
          )
        ORDER BY classified."occurred_at" ASC, classified."id" ASC
        LIMIT ${remaining + 1}
      `;
      if (candidates.length > remaining) summary.truncated = true;
      for (const candidate of candidates.slice(0, remaining)) {
        summary.candidates += 1;
        const [configuration, actor, routingPolicy, state] = await Promise.all([
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
          offers.findState({
            workspaceId: program.workspaceId,
            groupId: program.groupId,
            actorUserId: candidate.userId,
            freeEnrollmentId: candidate.freeEnrollmentId,
            now,
          }),
        ]);
        if (!configuration || !actor || state?.status !== 'STANDARD' || !state.offer) {
          summary.skipped += 1;
          continue;
        }
        const mode = routingPolicy?.mode ?? 'SHARED';
        if (mode === 'DISABLED' || (mode === 'DEDICATED' && !routingPolicy?.pilotEnabled)) {
          summary.skipped += 1;
          continue;
        }
        const lineConfiguration =
          mode === 'DEDICATED'
            ? await db.prisma.groupLineChannelConfiguration.findFirst({
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
              })
            : await db.prisma.lineChannelConfiguration.findFirst({
                where: {
                  environment: input.environment,
                  status: 'ACTIVE',
                  lastVerifiedAt: { not: null },
                  lastErrorCategory: null,
                  globallyPaused: false,
                },
                select: { id: true },
              });
        const eligible = !lineConfiguration
          ? null
          : mode === 'DEDICATED'
            ? await db.prisma.groupLineConnection.findFirst({
                where: {
                  workspaceId: program.workspaceId,
                  groupId: program.groupId,
                  configurationId: lineConfiguration.id,
                  groupMembershipId: candidate.groupMembershipId,
                  status: 'ACTIVE',
                  notificationConsentAt: { not: null },
                  friendshipStatus: 'FOLLOWING',
                },
                select: { id: true },
              })
            : await db.prisma.lineConnection.findFirst({
                where: {
                  environment: input.environment,
                  workspaceId: program.workspaceId,
                  userId: candidate.userId,
                  status: 'ACTIVE',
                  notificationConsentAt: { not: null },
                  friendshipStatus: 'FOLLOWING',
                },
                select: { id: true },
              });
        if (!eligible) {
          summary.skipped += 1;
          continue;
        }
        const key = automationKey(input.environment, candidate.freeEnrollmentId);
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
        const offerUrl = new URL(
          `/s/${encodeURIComponent(configuration.slug)}/programs/${encodeURIComponent(candidate.freeEnrollmentId)}`,
          getServerEnvironment().APP_URL,
        ).toString();
        const message = buildAiResaleOfferLineMessage({
          serviceName: configuration.displayName,
          classification: state.classification,
          offerKind: state.offer.terms.offerKey,
          amountYen: state.offer.terms.amountYen,
          durationDays: state.offer.terms.durationDays,
          offerUrl,
        });
        const broadcast = await db.prisma.$transaction(async (tx) => {
          const row = await tx.serviceLineBroadcast.create({
            data: {
              workspaceId: program.workspaceId,
              groupId: program.groupId,
              title: '7日間体験の結果と次のプログラム',
              message,
              automationKey: key,
              segmentCriteria: {
                kind: 'AI_RESALE_OFFER',
                programEnrollmentId: candidate.freeEnrollmentId,
                offeringId: state.offer!.offeringId,
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
              groupMembershipId: candidate.groupMembershipId,
              userId: candidate.userId,
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
                programEnrollmentId: candidate.freeEnrollmentId,
                offeringId: state.offer!.offeringId,
                classification: state.classification,
              },
              reason: 'AI物販V1のDAY7結果と90日プログラムを参加者本人へ通知',
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
