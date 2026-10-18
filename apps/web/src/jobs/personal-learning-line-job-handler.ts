import 'server-only';
import type { Job } from '@bunshin/application';
import {
  personalLearningDynamicProgramAllows,
  personalLearningFeatureEnabled,
} from '@bunshin/capability-training';
import { createLogger } from '@bunshin/observability';
import { randomUUID } from 'node:crypto';
import { getServerEnvironment } from '@bunshin/config';
import { AesGcmLineSecretCrypto, currentLineEnvironment } from '../line/secure-configuration';
import { LineMessagingApiAdapter } from '../line/messaging-provider';
import { resolvePersonalLearningRequestActor } from '../services/personal-learning-request-access';
import { sendPersonalLearningConversationTurn } from '../services/personal-learning-conversation';
import { requestPracticeSupport } from '../services/personal-learning-practice-support';
import { normalizePracticeSupportImage } from '../learning/personal-learning-support-image';

const logger = createLogger();
const inboxReference = /^personal-learning-line:([0-9a-f-]{36})$/i;
const webFallback = '続きはWebの研修画面から確認してください。';

export async function executePersonalLearningLineJob(job: Job) {
  if (job.jobType !== 'PERSONAL_LEARNING_LINE_PROCESS') return { retryable: false } as const;
  const inboxId = inboxReference.exec(job.payloadReference)?.[1];
  if (!inboxId) return { retryable: false } as const;
  const db = await import('@bunshin/database');
  const recordQuotaThreshold = async (input: {
    workspaceId: string;
    groupId: string;
    configurationId: string;
    environment: 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION';
    actorUserId: string;
    monthKey: string;
    stop: boolean;
    thresholdPercent: number;
    observedPercent: number;
  }) => {
    const { stop, actorUserId, ...noticeData } = input;
    const inserted = await db.prisma.personalLearningLineQuotaNotice.createMany({
      data: [{ ...noticeData, observedPercent: Math.ceil(input.observedPercent) }],
      skipDuplicates: true,
    });
    if (inserted.count !== 1) return;
    logger.warn(
      stop
        ? 'personal learning LINE learning pushes stopped at monthly quota threshold'
        : 'personal learning LINE monthly quota warning threshold reached',
      {
        groupId: input.groupId,
        configurationId: input.configurationId,
        environment: input.environment,
        threshold: input.thresholdPercent,
        observedPercent: Math.ceil(input.observedPercent),
      },
    );
    await db.prisma.groupLineConfigurationAudit.create({
      data: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        configurationId: input.configurationId,
        environment: currentLineEnvironment(),
        actorUserId,
        action: stop ? 'LEARNING_QUOTA_STOP' : 'LEARNING_QUOTA_WARNING',
        reason: stop
          ? 'LINE月間送信上限の90%に到達したため研修Pushを停止'
          : 'LINE月間送信上限の80%に到達したため運営者へ警告',
        afterData: {
          thresholdPercent: input.thresholdPercent,
          observedPercent: Math.ceil(input.observedPercent),
          monthKey: input.monthKey,
        },
        occurredAt: new Date(),
      },
    });
  };
  const inbox = await db.prisma.personalLearningLineInbox.findFirst({
    where: { id: inboxId, workspaceId: job.workspaceId, userId: job.requestedBy },
  });
  if (!inbox || inbox.status === 'PROCESSED') return { retryable: false } as const;
  const now = new Date();
  const [connection, enrollment, membership, configuration] = await Promise.all([
    db.prisma.groupLineConnection.findFirst({
      where: {
        configurationId: inbox.configurationId,
        workspaceId: inbox.workspaceId,
        groupId: inbox.groupId,
        groupMembershipId: inbox.groupMembershipId,
        userId: inbox.userId,
        status: 'ACTIVE',
        friendshipStatus: 'FOLLOWING',
        notificationConsentAt: { not: null },
        user: { status: 'ACTIVE' },
        groupMembership: { status: 'ACTIVE', consentedAt: { not: null } },
      },
      select: { providerUserId: true },
    }),
    db.prisma.programEnrollment.findFirst({
      where: {
        id: inbox.programEnrollmentId,
        workspaceId: inbox.workspaceId,
        groupId: inbox.groupId,
        groupMembershipId: inbox.groupMembershipId,
        status: 'ACTIVE',
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      select: { id: true, serviceProgramId: true },
    }),
    db.prisma.groupMembership.findFirst({
      where: {
        id: inbox.groupMembershipId,
        workspaceId: inbox.workspaceId,
        groupId: inbox.groupId,
        userId: inbox.userId,
        status: 'ACTIVE',
        consentedAt: { not: null },
      },
      select: { id: true },
    }),
    db.prisma.groupLineChannelConfiguration.findFirst({
      where: {
        id: inbox.configurationId,
        workspaceId: inbox.workspaceId,
        groupId: inbox.groupId,
        environment: currentLineEnvironment(),
        status: 'ACTIVE',
        globallyPaused: false,
        lastVerifiedAt: { not: null },
        lastErrorCategory: null,
      },
      select: {
        id: true,
        environment: true,
        createdByUserId: true,
        encryptedAccessToken: true,
        quotaWarningPercent: true,
        quotaLowPriorityStop: true,
        group: { select: { serviceConfiguration: { select: { slug: true } } } },
      },
    }),
  ]);
  const program = enrollment
    ? await db.prisma.serviceProgram.findFirst({
        where: {
          id: enrollment.serviceProgramId,
          workspaceId: inbox.workspaceId,
          groupId: inbox.groupId,
          status: 'ACTIVE',
          settings: { path: ['moduleKey'], equals: 'AI_TRAINING_V1' },
        },
        select: { settings: true },
      })
    : null;
  if (!connection || !enrollment || !membership || !program || !configuration) {
    await db.prisma.personalLearningLineInbox.updateMany({
      where: { id: inbox.id, status: 'PENDING' },
      data: { status: 'PROCESSED', processedAt: now },
    });
    return { retryable: false } as const;
  }
  const settings = program.settings;
  if (
    !personalLearningDynamicProgramAllows(settings, enrollment.id) ||
    !personalLearningFeatureEnabled(settings, 'lineLearning') ||
    !personalLearningFeatureEnabled(settings, 'conversation')
  ) {
    await db.prisma.personalLearningLineInbox.updateMany({
      where: { id: inbox.id, status: 'PENDING' },
      data: { status: 'PROCESSED', processedAt: now },
    });
    return { retryable: false } as const;
  }

  const slug = configuration.group.serviceConfiguration?.slug;
  const homeUrl = slug
    ? new URL(`/s/${slug}/home`, getServerEnvironment().APP_URL).toString()
    : getServerEnvironment().APP_URL;
  let text = `${webFallback}\n${homeUrl}`;
  const quota = await new LineMessagingApiAdapter().getQuota(
    new AesGcmLineSecretCrypto().decrypt(configuration.encryptedAccessToken),
  );
  if (!quota.ok) return { retryable: quota.retryable, category: quota.category } as const;
  const usagePercent = quota.limit ? (quota.consumption / quota.limit) * 100 : 0;
  const monthKey = new Date().toISOString().slice(0, 7);
  if (quota.limit && usagePercent >= configuration.quotaWarningPercent)
    await recordQuotaThreshold({
      workspaceId: inbox.workspaceId,
      groupId: inbox.groupId,
      configurationId: inbox.configurationId,
      environment: configuration.environment,
      actorUserId: configuration.createdByUserId,
      monthKey,
      stop: false,
      thresholdPercent: configuration.quotaWarningPercent,
      observedPercent: usagePercent,
    });
  if (quota.limit && usagePercent >= configuration.quotaLowPriorityStop) {
    await recordQuotaThreshold({
      workspaceId: inbox.workspaceId,
      groupId: inbox.groupId,
      configurationId: inbox.configurationId,
      environment: configuration.environment,
      actorUserId: configuration.createdByUserId,
      monthKey,
      stop: true,
      thresholdPercent: configuration.quotaLowPriorityStop,
      observedPercent: usagePercent,
    });
  } else if (
    (inbox.messageType === 'TEXT' && inbox.text && inbox.text.length <= 1200) ||
    (inbox.messageType === 'IMAGE' && inbox.lineMessageId)
  ) {
    try {
      const actor = await resolvePersonalLearningRequestActor(
        slug ?? '',
        enrollment.id,
        inbox.userId,
        'lineLearning',
        inbox.topicId,
      );
      if (inbox.messageType === 'TEXT' && inbox.text && inbox.text.length <= 1200) {
        const request = await db.prisma.personalLearningRequest.findFirst({
          where: {
            workspaceId: inbox.workspaceId,
            groupId: inbox.groupId,
            programEnrollmentId: enrollment.id,
            groupMembershipId: inbox.groupMembershipId,
            userId: inbox.userId,
            ...(actor.topicId ? { topicId: actor.topicId } : {}),
          },
          orderBy: [{ revision: 'desc' }, { updatedAt: 'desc' }],
          select: { id: true, revision: true },
        });
        if (request) {
          const result = await sendPersonalLearningConversationTurn({
            actor,
            requestId: request.id,
            requestRevision: request.revision,
            operationId: inbox.operationId,
            text: inbox.text,
          });
          const response = result.conversation.messages.find(
            (message) => message.role === 'ASSISTANT' && message.operationId === inbox.operationId,
          );
          if (response) text = `${response.text.slice(0, 3500)}\n\n${homeUrl}`;
        }
      } else if (inbox.messageType === 'IMAGE' && inbox.lineMessageId) {
        let image =
          inbox.imageBytes && inbox.imageSha256 && inbox.imageSizeBytes
            ? {
                mimeType: 'image/jpeg' as const,
                base64: Buffer.from(inbox.imageBytes).toString('base64'),
                sha256: inbox.imageSha256,
                sizeBytes: inbox.imageSizeBytes,
              }
            : null;
        if (!image) {
          const accessToken = new AesGcmLineSecretCrypto().decrypt(
            configuration.encryptedAccessToken,
          );
          const response = await fetch(
            `https://api-data.line.me/v2/bot/message/${encodeURIComponent(inbox.lineMessageId)}/content`,
            {
              headers: { authorization: `Bearer ${accessToken}` },
              signal: AbortSignal.timeout(10_000),
            },
          );
          if (!response.ok) throw new Error(`LINE image fetch failed (${response.status})`);
          const content = Buffer.from(await response.arrayBuffer());
          if (content.byteLength > 3_000_000) throw new Error('LINE image exceeds upload limit');
          const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim();
          if (!mimeType || !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType))
            throw new Error('LINE image type is unsupported');
          image = await normalizePracticeSupportImage(
            `data:${mimeType};base64,${content.toString('base64')}`,
          );
          await db.prisma.personalLearningLineInbox.updateMany({
            where: { id: inbox.id, imageBytes: null },
            data: {
              imageMimeType: image.mimeType,
              imageSha256: image.sha256,
              imageSizeBytes: image.sizeBytes,
              imageBytes: Buffer.from(image.base64, 'base64'),
            },
          });
        }
        const practice = await new db.PrismaPersonalLearningPracticeRepository(
          db.prisma,
        ).readPractice(actor);
        if (practice.current) {
          const support = await requestPracticeSupport({
            actor,
            assignmentId: practice.current.assignmentId,
            operationId: inbox.operationId,
            expectedNoteRevision: practice.current.note?.revision ?? 0,
            expectedSupportRevision: practice.current.support.revision,
            reason: 'UNKNOWN',
            text: 'LINEで共有した画像を見ながら、今の練習を相談したいです。',
            image,
          });
          const advice = support.support.history.find(
            (item) => item.operationId === inbox.operationId,
          )?.advice;
          if (advice)
            text = `${advice.explanation}\n${advice.nextAction}\n${advice.question}\n\n${homeUrl}`;
          const event = await db.prisma.programActionEvent.findFirst({
            where: {
              workspaceId: inbox.workspaceId,
              groupId: inbox.groupId,
              idempotencyKey: `practice-support-request:${inbox.operationId}`,
            },
            select: { id: true },
          });
          if (event)
            await db.prisma.personalLearningPracticeSupportImage.updateMany({
              where: {
                workspaceId: inbox.workspaceId,
                groupId: inbox.groupId,
                requestEventId: event.id,
                userId: inbox.userId,
              },
              data: { createdAt: inbox.createdAt },
            });
          await db.prisma.personalLearningLineInbox.updateMany({
            where: { id: inbox.id },
            data: { imageBytes: null },
          });
        } else {
          text = `${webFallback} 画像を使った相談は、Webの練習画面から送ってください。\n${homeUrl}`;
        }
      }
    } catch {
      // Invalid topic / missing enrollment context is a web handoff, never a guessed theme.
      text = `${webFallback}\n${homeUrl}`;
    }
  }
  const retryKey = randomUUID();
  const outbox = await db.prisma.personalLearningLinePush.upsert({
    where: {
      configurationId_providerEventId_purpose: {
        configurationId: inbox.configurationId,
        providerEventId: inbox.providerEventId,
        purpose: 'RESPONSE',
      },
    },
    create: {
      workspaceId: inbox.workspaceId,
      groupId: inbox.groupId,
      programEnrollmentId: inbox.programEnrollmentId,
      groupMembershipId: inbox.groupMembershipId,
      userId: inbox.userId,
      configurationId: inbox.configurationId,
      providerEventId: inbox.providerEventId,
      purpose: 'RESPONSE',
      retryKey,
      text,
    },
    update: {},
  });
  if (outbox.status === 'SENT') {
    await db.prisma.personalLearningLineInbox.updateMany({
      where: { id: inbox.id, status: 'PENDING' },
      data: { status: 'PROCESSED', processedAt: new Date() },
    });
    return { retryable: false } as const;
  }
  const push = await new LineMessagingApiAdapter().pushText({
    accessToken: new AesGcmLineSecretCrypto().decrypt(configuration.encryptedAccessToken),
    recipientId: connection.providerUserId,
    text: outbox.text,
    retryKey: outbox.retryKey,
  });
  if (!push.ok) return { retryable: push.retryable, category: push.category } as const;
  await db.prisma.$transaction([
    db.prisma.personalLearningLinePush.update({
      where: { id: outbox.id },
      data: { status: 'SENT', sentAt: new Date() },
    }),
    db.prisma.personalLearningLineInbox.updateMany({
      where: { id: inbox.id, status: 'PENDING' },
      data: { status: 'PROCESSED', processedAt: new Date() },
    }),
  ]);
  return { retryable: false } as const;
}

/** Dead jobs get one generic, event-deduplicated handoff attempt; no learner content is logged. */
export async function sendPersonalLearningLineFailureFallback(job: Job) {
  const inboxId = inboxReference.exec(job.payloadReference)?.[1];
  if (!inboxId || !job.requestedBy) return;
  const db = await import('@bunshin/database');
  const inbox = await db.prisma.personalLearningLineInbox.findFirst({
    where: { id: inboxId, workspaceId: job.workspaceId, userId: job.requestedBy },
  });
  if (!inbox) return;
  const [connection, configuration] = await Promise.all([
    db.prisma.groupLineConnection.findFirst({
      where: {
        configurationId: inbox.configurationId,
        workspaceId: inbox.workspaceId,
        groupId: inbox.groupId,
        groupMembershipId: inbox.groupMembershipId,
        userId: inbox.userId,
        status: 'ACTIVE',
        friendshipStatus: 'FOLLOWING',
        notificationConsentAt: { not: null },
        user: { status: 'ACTIVE' },
        groupMembership: { status: 'ACTIVE', consentedAt: { not: null } },
      },
      select: { providerUserId: true },
    }),
    db.prisma.groupLineChannelConfiguration.findFirst({
      where: {
        id: inbox.configurationId,
        workspaceId: inbox.workspaceId,
        groupId: inbox.groupId,
        environment: currentLineEnvironment(),
        status: 'ACTIVE',
        globallyPaused: false,
        lastVerifiedAt: { not: null },
        lastErrorCategory: null,
      },
      select: { encryptedAccessToken: true },
    }),
  ]);
  const alreadyQueued = await db.prisma.personalLearningLinePush.findUnique({
    where: {
      configurationId_providerEventId_purpose: {
        configurationId: inbox.configurationId,
        providerEventId: inbox.providerEventId,
        purpose: 'FALLBACK',
      },
    },
  });
  const slug = await db.prisma.serviceConfiguration.findFirst({
    where: { workspaceId: inbox.workspaceId, groupId: inbox.groupId },
    select: { slug: true },
  });
  const homeUrl = slug?.slug
    ? new URL(`/s/${slug.slug}/home`, getServerEnvironment().APP_URL).toString()
    : getServerEnvironment().APP_URL;
  const text = alreadyQueued?.text ?? `${webFallback}\n${homeUrl}`;
  const outbox =
    alreadyQueued ??
    (await db.prisma.personalLearningLinePush.create({
      data: {
        workspaceId: inbox.workspaceId,
        groupId: inbox.groupId,
        programEnrollmentId: inbox.programEnrollmentId,
        groupMembershipId: inbox.groupMembershipId,
        userId: inbox.userId,
        configurationId: inbox.configurationId,
        providerEventId: inbox.providerEventId,
        purpose: 'FALLBACK',
        retryKey: randomUUID(),
        text,
      },
    }));
  if (!connection || !configuration || outbox.status === 'SENT') {
    await db.prisma.personalLearningLineInbox.updateMany({
      where: { id: inbox.id, status: { in: ['PENDING', 'PROCESSING'] } },
      data: { status: 'FAILED', processedAt: new Date() },
    });
    return;
  }
  const token = new AesGcmLineSecretCrypto().decrypt(configuration.encryptedAccessToken);
  const quota = await new LineMessagingApiAdapter().getQuota(token);
  if (!quota.ok) return;
  const result = await new LineMessagingApiAdapter().pushText({
    accessToken: token,
    recipientId: connection.providerUserId,
    text: outbox.text,
    retryKey: outbox.retryKey,
  });
  if (result.ok) {
    await db.prisma.personalLearningLinePush.update({
      where: { id: outbox.id },
      data: { status: 'SENT', sentAt: new Date() },
    });
  }
  await db.prisma.personalLearningLineInbox.updateMany({
    where: { id: inbox.id, status: { in: ['PENDING', 'PROCESSING'] } },
    data: { status: 'FAILED', processedAt: new Date() },
  });
}
