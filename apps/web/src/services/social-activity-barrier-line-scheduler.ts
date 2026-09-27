import 'server-only';

import { createHash } from 'node:crypto';
import { EnqueueJob, type JobEnvironment } from '@bunshin/application';
import { buildSocialActivityBarrierLineMessage } from '@bunshin/capability-social';
import { getServerEnvironment } from '@bunshin/config';
import { resolveServiceLineBroadcastRecipientIds } from '../jobs/service-line-broadcast-eligibility';

export type SocialActivityBarrierLineScheduleSummary = {
  candidates: number;
  broadcasts: number;
  recipients: number;
  skipped: number;
  failures: number;
  truncated: boolean;
};

export const socialActivityBarrierNotificationKey = (
  environment: JobEnvironment,
  membershipId: string,
  bunshinId: string,
  cases: Array<{ id: string; recurrenceCount: number }>,
) => {
  const version = createHash('sha256')
    .update(
      cases
        .map((item) => `${item.id}:${item.recurrenceCount}`)
        .sort()
        .join('|'),
    )
    .digest('hex')
    .slice(0, 24);
  return `social-barrier:${environment}:${membershipId}:${bunshinId}:${version}`;
};

export async function scheduleSocialActivityBarrierLineNotifications(input: {
  environment: JobEnvironment;
  now?: Date;
  limit?: number;
}): Promise<SocialActivityBarrierLineScheduleSummary> {
  const db = await import('@bunshin/database');
  const now = input.now ?? new Date();
  const limit = Math.min(Math.max(input.limit ?? 500, 1), 500);
  const summary: SocialActivityBarrierLineScheduleSummary = {
    candidates: 0,
    broadcasts: 0,
    recipients: 0,
    skipped: 0,
    failures: 0,
    truncated: false,
  };
  const rows = await db.prisma.socialActivityBarrierCase.findMany({
    where: {
      status: 'SUSPECTED',
      groupMembership: {
        status: 'ACTIVE',
        consentedAt: { not: null },
        serviceRole: 'PARTICIPANT',
        user: { status: 'ACTIVE' },
        group: {
          status: 'ACTIVE',
          workspace: { status: 'ACTIVE' },
          serviceConfiguration: {
            is: {
              registration: { is: { lineEnabled: true } },
              AND: [
                { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
                { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
              ],
            },
          },
        },
      },
      bunshin: { status: 'ACTIVE' },
    },
    select: {
      id: true,
      workspaceId: true,
      groupId: true,
      groupMembershipId: true,
      userId: true,
      bunshinId: true,
      recurrenceCount: true,
      bunshin: { select: { ownerUserId: true } },
      groupMembership: {
        select: {
          group: {
            select: {
              serviceConfiguration: { select: { slug: true, displayName: true } },
            },
          },
        },
      },
    },
    orderBy: [{ lastDetectedAt: 'asc' }, { id: 'asc' }],
    take: limit * 11 + 1,
  });
  const grouped = new Map<string, (typeof rows)[number][]>();
  for (const row of rows) {
    if (row.bunshin.ownerUserId !== row.userId || !row.groupMembership.group.serviceConfiguration) {
      summary.skipped += 1;
      continue;
    }
    const key = `${row.workspaceId}:${row.groupId}:${row.groupMembershipId}:${row.bunshinId}`;
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  const candidateGroups = [...grouped.values()];
  if (candidateGroups.length > limit) summary.truncated = true;
  for (const cases of candidateGroups.slice(0, limit)) {
    summary.candidates += 1;
    const first = cases[0]!;
    const configuration = first.groupMembership.group.serviceConfiguration!;
    try {
      const automationKey = socialActivityBarrierNotificationKey(
        input.environment,
        first.groupMembershipId,
        first.bunshinId,
        cases,
      );
      const existing = await db.prisma.serviceLineBroadcast.findUnique({
        where: { automationKey },
        select: { id: true, status: true, updatedByUserId: true },
      });
      if (existing) {
        if (existing.status === 'SCHEDULED')
          await new EnqueueJob(new db.PrismaJobRepository()).enqueue({
            environment: input.environment,
            workspaceId: first.workspaceId,
            correlationId: automationKey,
            requestedBy: existing.updatedByUserId,
            jobType: 'SERVICE_LINE_BROADCAST_DELIVER',
            payloadReference: `service-line-broadcast:${existing.id}`,
            idempotencyKey: `${automationKey}:deliver`,
            priority: 35,
            maxAttempts: 3,
            scheduledAt: now,
          });
        summary.skipped += 1;
        continue;
      }
      const [actor, policy] = await Promise.all([
        db.prisma.groupMembership.findFirst({
          where: {
            workspaceId: first.workspaceId,
            groupId: first.groupId,
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
              workspaceId: first.workspaceId,
              groupId: first.groupId,
              environment: input.environment,
            },
          },
          select: { mode: true, pilotEnabled: true },
        }),
      ]);
      const mode = policy?.mode ?? 'SHARED';
      if (!actor || mode === 'DISABLED' || (mode === 'DEDICATED' && !policy?.pilotEnabled)) {
        summary.skipped += 1;
        continue;
      }
      const lineConfiguration =
        mode === 'DEDICATED'
          ? await db.prisma.groupLineChannelConfiguration.findFirst({
              where: {
                workspaceId: first.workspaceId,
                groupId: first.groupId,
                environment: input.environment,
                status: 'ACTIVE',
                lastVerifiedAt: { not: null },
                lastErrorCategory: null,
                globallyPaused: false,
              },
              select: { id: true, encryptedAccessToken: true },
            })
          : await db.prisma.lineChannelConfiguration.findFirst({
              where: {
                environment: input.environment,
                status: 'ACTIVE',
                lastVerifiedAt: { not: null },
                lastErrorCategory: null,
                globallyPaused: false,
              },
              select: { id: true, encryptedAccessToken: true },
            });
      if (!lineConfiguration) {
        summary.skipped += 1;
        continue;
      }
      const caseIds = cases.map((item) => item.id);
      const recipient = {
        id: first.groupMembershipId,
        groupMembershipId: first.groupMembershipId,
        userId: first.userId,
        message: null,
      };
      const recipientIds = await resolveServiceLineBroadcastRecipientIds({
        db,
        broadcast: {
          id: automationKey,
          workspaceId: first.workspaceId,
          groupId: first.groupId,
          message: '',
          updatedByUserId: actor.userId,
          segmentCriteria: {
            kind: 'SOCIAL_ACTIVITY_BARRIER',
            bunshinId: first.bunshinId,
            caseIds,
          },
        },
        configuration: lineConfiguration,
        environment: input.environment,
        mode,
        recipients: [recipient],
        now,
      });
      if (!recipientIds.has(first.groupMembershipId)) {
        summary.skipped += 1;
        continue;
      }
      const confirmationUrl = new URL(
        `/s/${encodeURIComponent(configuration.slug)}/bunshins/${encodeURIComponent(first.bunshinId)}`,
        getServerEnvironment().APP_URL,
      ).toString();
      const message = buildSocialActivityBarrierLineMessage({
        serviceName: configuration.displayName,
        confirmationUrl,
      });
      const broadcast = await db.prisma.$transaction(async (tx) => {
        const row = await tx.serviceLineBroadcast.create({
          data: {
            workspaceId: first.workspaceId,
            groupId: first.groupId,
            title: 'SNS継続サポートの確認',
            message,
            automationKey,
            segmentCriteria: {
              kind: 'SOCIAL_ACTIVITY_BARRIER',
              bunshinId: first.bunshinId,
              caseIds,
            },
            status: 'SCHEDULED',
            scheduledAt: now,
            createdByUserId: actor.userId,
            updatedByUserId: actor.userId,
          },
        });
        await tx.serviceLineBroadcastRecipient.create({
          data: {
            workspaceId: first.workspaceId,
            groupId: first.groupId,
            broadcastId: row.id,
            groupMembershipId: first.groupMembershipId,
            userId: first.userId,
          },
        });
        await tx.serviceLineBroadcastAuditLog.create({
          data: {
            workspaceId: first.workspaceId,
            groupId: first.groupId,
            broadcastId: row.id,
            action: 'AUTO_SCHEDULED',
            beforeData: {},
            afterData: {
              recipients: 1,
              environment: input.environment,
              bunshinId: first.bunshinId,
              caseIds,
            },
            reason: 'SNS継続支援の本人確認を通知',
            performedByUserId: actor.userId,
          },
        });
        return row;
      });
      await new EnqueueJob(new db.PrismaJobRepository()).enqueue({
        environment: input.environment,
        workspaceId: first.workspaceId,
        correlationId: automationKey,
        requestedBy: actor.userId,
        jobType: 'SERVICE_LINE_BROADCAST_DELIVER',
        payloadReference: `service-line-broadcast:${broadcast.id}`,
        idempotencyKey: `${automationKey}:deliver`,
        priority: 35,
        maxAttempts: 3,
        scheduledAt: now,
      });
      summary.broadcasts += 1;
      summary.recipients += 1;
    } catch {
      summary.failures += 1;
    }
  }
  return summary;
}
