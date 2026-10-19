import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { getServerEnvironment } from '@bunshin/config';
import {
  personalLearningDynamicProgramAllows,
  personalLearningFeatureEnabled,
  PERSONAL_LEARNING_NUDGE_FALLBACKS,
  decidePersonalLearningNudge,
  nudgeSendTimeJst,
  type NudgeHistory,
  type NudgeLearnerAction,
  type NudgePractice,
  type PersonalLearningNudgeSituation,
} from '@bunshin/capability-training';
import { prisma } from '@bunshin/database';
import { createLogger, requestIdFromHeader } from '@bunshin/observability';
import { toApiError } from '@bunshin/shared';
import {
  AI_TRAINING_AI_CONSENT_TEXT,
  AI_TRAINING_AI_CONSENT_VERSION,
} from '../services/ai-training-consent-policy';
import { authorizeCronRequest } from './cron-security';
import { AesGcmLineSecretCrypto, currentLineEnvironment } from '../line/secure-configuration';
import { LineMessagingApiAdapter } from '../line/messaging-provider';

const logger = createLogger();
const digest = createHash('sha256').update(AI_TRAINING_AI_CONSENT_TEXT).digest('hex');
const headers = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };
const learnerEventTypes = [
  'PERSONAL_LEARNING_CONVERSATION_MESSAGE',
  'PERSONAL_LEARNING_CONVERSATION_SHARE',
  'PERSONAL_LEARNING_SUPPORT_REQUEST',
  'PERSONAL_LEARNING_PRACTICE_NOTE',
  'PERSONAL_LEARNING_PRACTICE_STARTED',
  'PERSONAL_LEARNING_CAPABILITY_INTERACTION',
  'PERSONAL_LEARNING_PRACTICE_COMPLETED',
  'PERSONAL_LEARNING_FIRST_SUCCESS',
  'PERSONAL_LEARNING_NEXT_TASK_STARTED',
  'ANSWER_SUBMITTED',
] as const;
const actionKind: Record<string, NudgeLearnerAction['kind'] | undefined> = {
  PERSONAL_LEARNING_CONVERSATION_MESSAGE: 'CONVERSATION',
  PERSONAL_LEARNING_CONVERSATION_SHARE: 'CONVERSATION',
  PERSONAL_LEARNING_SUPPORT_REQUEST: 'CONSULTATION',
  PERSONAL_LEARNING_PRACTICE_NOTE: 'PRACTICE_REPORTED',
  PERSONAL_LEARNING_PRACTICE_STARTED: 'PRACTICE_STARTED',
  PERSONAL_LEARNING_PRACTICE_COMPLETED: 'PRACTICE_REPORTED',
  PERSONAL_LEARNING_FIRST_SUCCESS: 'PRACTICE_REPORTED',
  PERSONAL_LEARNING_NEXT_TASK_STARTED: 'PRACTICE_STARTED',
  ANSWER_SUBMITTED: 'PRACTICE_REPORTED',
};

function dateKeyJst(now: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function run(now: Date) {
  const programs = await prisma.serviceProgram.findMany({
    where: {
      status: 'ACTIVE',
      settings: { path: ['moduleKey'], equals: 'AI_TRAINING_V1' },
    },
    select: { id: true, workspaceId: true, groupId: true, settings: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: 500,
  });
  const enabledPrograms = programs.filter(({ settings }) =>
    personalLearningFeatureEnabled(settings, 'learningNudges'),
  );
  const programIds = enabledPrograms.map(({ id }) => id);
  if (!programIds.length) return { scanned: 0, sent: 0, skipped: 0 };
  const enrollments = await prisma.programEnrollment.findMany({
    where: {
      serviceProgramId: { in: programIds },
      status: 'ACTIVE',
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
    select: {
      id: true,
      workspaceId: true,
      groupId: true,
      groupMembershipId: true,
      serviceProgramId: true,
      startsAt: true,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: 500,
  });
  const programById = new Map(enabledPrograms.map((program) => [program.id, program]));
  let sent = 0;
  let skipped = 0;
  for (const enrollment of enrollments) {
    const program = programById.get(enrollment.serviceProgramId);
    const membership = await prisma.groupMembership.findFirst({
      where: {
        id: enrollment.groupMembershipId,
        workspaceId: enrollment.workspaceId,
        groupId: enrollment.groupId,
        status: 'ACTIVE',
        consentedAt: { not: null },
        serviceRole: 'PARTICIPANT',
        user: { status: 'ACTIVE' },
      },
      select: { id: true, userId: true },
    });
    if (
      !program ||
      !enrollment.startsAt ||
      !membership ||
      !personalLearningDynamicProgramAllows(program.settings, enrollment.id)
    ) {
      skipped++;
      continue;
    }
    const s = {
      workspaceId: enrollment.workspaceId,
      groupId: enrollment.groupId,
      programEnrollmentId: enrollment.id,
      groupMembershipId: enrollment.groupMembershipId,
      userId: membership.userId,
    };
    const consent = await prisma.aiTrainingUsageConsent.findFirst({
      where: { ...s, consentVersion: AI_TRAINING_AI_CONSENT_VERSION, textDigest: digest },
      select: { id: true },
    });
    if (!consent) {
      skipped++;
      continue;
    }
    const seat = await prisma.personalLearningPilotSeat.findFirst({
      where: {
        workspaceId: s.workspaceId,
        groupId: s.groupId,
        serviceProgramId: enrollment.serviceProgramId,
        programEnrollmentId: enrollment.id,
        kind: 'INTERNAL',
        cohort: 'INTERNAL',
        revokedAt: null,
      },
      select: { id: true },
    });
    if (!seat) {
      skipped++;
      continue;
    }
    const [connection, preference, slug, topics, requests, events, lineInbox, pushes] =
      await Promise.all([
        prisma.groupLineConnection.findFirst({
          where: {
            workspaceId: s.workspaceId,
            groupId: s.groupId,
            groupMembershipId: s.groupMembershipId,
            userId: s.userId,
            status: 'ACTIVE',
            friendshipStatus: 'FOLLOWING',
            notificationConsentAt: { not: null },
          },
          select: { providerUserId: true, configurationId: true },
        }),
        prisma.personalLearningNudgePreference.findFirst({
          where: s,
          select: {
            enabled: true,
            consentVersion: true,
            consentedAt: true,
            pausedUntil: true,
            stoppedAt: true,
          },
        }),
        prisma.serviceConfiguration.findFirst({
          where: { workspaceId: s.workspaceId, groupId: s.groupId },
          select: { slug: true },
        }),
        prisma.personalLearningTopic.findMany({
          where: { ...s, status: 'ACTIVE' },
          orderBy: [
            { lastLearnerUseAt: { sort: 'desc', nulls: 'last' } },
            { createdAt: 'desc' },
            { id: 'asc' },
          ],
          take: 1,
          select: { id: true },
        }),
        prisma.personalLearningRequest.findMany({
          where: { ...s, groupMembershipId: s.groupMembershipId },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: 1,
          select: { createdAt: true },
        }),
        prisma.programActionEvent.findMany({
          where: {
            workspaceId: s.workspaceId,
            groupId: s.groupId,
            programEnrollmentId: s.programEnrollmentId,
            actorUserId: s.userId,
            eventType: { in: [...learnerEventTypes, 'PERSONAL_LEARNING_PRACTICE_COMPLETED'] },
          },
          orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
          take: 500,
          select: {
            id: true,
            eventType: true,
            missionAssignmentId: true,
            occurredAt: true,
            metadata: true,
          },
        }),
        prisma.personalLearningLineInbox.findMany({
          where: { ...s, messageType: 'TEXT', text: { not: null } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: 500,
          select: { id: true, createdAt: true },
        }),
        prisma.programActionEvent.findMany({
          where: {
            workspaceId: s.workspaceId,
            groupId: s.groupId,
            programEnrollmentId: s.programEnrollmentId,
            actorUserId: s.userId,
            eventType: 'PERSONAL_LEARNING_NUDGE_SENT',
          },
          orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
          take: 100,
          select: { eventType: true, occurredAt: true, metadata: true },
        }),
      ]);
    if (
      !connection ||
      !slug?.slug ||
      (preference &&
        (!preference.enabled ||
          preference.stoppedAt ||
          (preference.pausedUntil && preference.pausedUntil > now) ||
          preference.consentVersion !== AI_TRAINING_AI_CONSENT_VERSION))
    ) {
      skipped++;
      continue;
    }
    const configuration = await prisma.groupLineChannelConfiguration.findFirst({
      where: {
        id: connection.configurationId,
        workspaceId: s.workspaceId,
        groupId: s.groupId,
        environment: currentLineEnvironment(),
        status: 'ACTIVE',
        globallyPaused: false,
        lastVerifiedAt: { not: null },
        lastErrorCategory: null,
      },
      select: { id: true, encryptedAccessToken: true, quotaLowPriorityStop: true },
    });
    if (!configuration) {
      skipped++;
      continue;
    }
    const actions: NudgeLearnerAction[] = events.flatMap((event) => {
      const kind = actionKind[event.eventType];
      return kind ? [{ occurredAt: event.occurredAt, kind }] : [];
    });
    actions.push(
      ...lineInbox.map(({ createdAt }) => ({
        occurredAt: createdAt,
        kind: 'LINE_INBOUND' as const,
      })),
    );
    const byPractice = new Map<
      string,
      { startedAt: Date | null; reportedAt: Date | null; outcome: NudgePractice['outcome'] }
    >();
    for (const event of events) {
      if (!event.missionAssignmentId) continue;
      const practice = byPractice.get(event.missionAssignmentId) ?? {
        startedAt: null,
        reportedAt: null,
        outcome: null,
      };
      if (event.eventType === 'PERSONAL_LEARNING_PRACTICE_STARTED')
        practice.startedAt ??= event.occurredAt;
      if (event.eventType === 'PERSONAL_LEARNING_PRACTICE_COMPLETED') {
        practice.reportedAt = event.occurredAt;
        practice.outcome = 'CAN_DO';
      }
      byPractice.set(event.missionAssignmentId, practice);
    }
    const consultationCountsByPractice: Record<string, number> = {};
    const thirdConsultationAtByPractice: Record<string, Date> = {};
    for (const event of events.filter(
      (row) => row.eventType === 'PERSONAL_LEARNING_SUPPORT_REQUEST' && row.missionAssignmentId,
    )) {
      const key = event.missionAssignmentId!;
      consultationCountsByPractice[key] = (consultationCountsByPractice[key] ?? 0) + 1;
      if (consultationCountsByPractice[key] === 3)
        thirdConsultationAtByPractice[key] = event.occurredAt;
    }
    const practices: NudgePractice[] = [...byPractice].map(([id, p]) => ({
      id,
      title: '練習',
      ...p,
    }));
    const latestResponse =
      actions.map(({ occurredAt }) => occurredAt).sort((a, b) => b.getTime() - a.getTime())[0] ??
      null;
    const histories: NudgeHistory[] = pushes.flatMap((event) => {
      const metadata = object(event.metadata);
      const situation = metadata['situation'];
      const sourceKey = metadata['sourceKey'];
      if (typeof situation !== 'string' || !(situation in PERSONAL_LEARNING_NUDGE_FALLBACKS))
        return [];
      return [
        {
          situation: situation as PersonalLearningNudgeSituation,
          sourceKey: typeof sourceKey === 'string' ? sourceKey : null,
          sentAt: event.occurredAt,
          respondedAt: latestResponse && latestResponse > event.occurredAt ? latestResponse : null,
        },
      ];
    });
    const decision = decidePersonalLearningNudge({
      now,
      enrollmentStartedAt: enrollment.startsAt,
      actions,
      hasSavedWish: requests.length > 0,
      wishSavedAt: requests[0]?.createdAt ?? null,
      practices,
      consultationCountsByPractice,
      thirdConsultationAtByPractice,
      resumeAt:
        preference?.pausedUntil && preference.pausedUntil <= now ? preference.pausedUntil : null,
      histories,
    });
    if (!decision) {
      skipped++;
      continue;
    }
    if (nudgeSendTimeJst(now) > now) {
      skipped++;
      continue;
    }
    const dayKey = dateKeyJst(now);
    const providerEventId = `nudge:${enrollment.id}:${dayKey}:${decision.situation}`;
    const retryKey = randomUUID();
    const outbox = await prisma.personalLearningLinePush.upsert({
      where: {
        configurationId_providerEventId_purpose: {
          configurationId: configuration.id,
          providerEventId,
          purpose: 'NUDGE',
        },
      },
      create: {
        ...s,
        configurationId: configuration.id,
        providerEventId,
        purpose: 'NUDGE',
        retryKey,
        text: `${PERSONAL_LEARNING_NUDGE_FALLBACKS[decision.situation]}\n${new URL(`/s/${slug.slug}/programs/${enrollment.id}/learning-request${topics[0] ? `?topicId=${topics[0].id}` : ''}`, getServerEnvironment().APP_URL).toString()}`,
      },
      update: {},
    });
    // Recover a worker killed after claiming. LINE's stable retry key makes re-delivery idempotent.
    await prisma.personalLearningLinePush.updateMany({
      where: {
        id: outbox.id,
        status: 'SENDING',
        updatedAt: { lte: new Date(now.getTime() - 15 * 60_000) },
      },
      data: { status: 'PENDING' },
    });
    // Last-moment recheck after outbox reservation; no model/provider-generated copy is permitted in N-1.
    const [stillEligible, stillConnected, stillConfigured, stillSeat, stillTopic] =
      await Promise.all([
        prisma.programEnrollment.findFirst({
          where: {
            ...s,
            status: 'ACTIVE',
            startsAt: { lte: new Date() },
            OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
          },
          select: { id: true },
        }),
        prisma.groupLineConnection.findFirst({
          where: {
            configurationId: configuration.id,
            ...s,
            status: 'ACTIVE',
            friendshipStatus: 'FOLLOWING',
            notificationConsentAt: { not: null },
          },
          select: { providerUserId: true },
        }),
        prisma.serviceProgram.findFirst({
          where: {
            id: enrollment.serviceProgramId,
            workspaceId: s.workspaceId,
            groupId: s.groupId,
            status: 'ACTIVE',
            settings: { path: ['moduleKey'], equals: 'AI_TRAINING_V1' },
          },
          select: { settings: true },
        }),
        prisma.personalLearningPilotSeat.findFirst({
          where: {
            workspaceId: s.workspaceId,
            groupId: s.groupId,
            serviceProgramId: enrollment.serviceProgramId,
            programEnrollmentId: enrollment.id,
            kind: 'INTERNAL',
            cohort: 'INTERNAL',
            revokedAt: null,
          },
          select: { id: true },
        }),
        topics[0]
          ? prisma.personalLearningTopic.findFirst({
              where: { ...s, id: topics[0].id, status: 'ACTIVE' },
              select: { id: true },
            })
          : Promise.resolve(null),
      ]);
    if (
      !stillEligible ||
      !stillConnected ||
      !stillConfigured ||
      !stillSeat ||
      (topics[0] && !stillTopic) ||
      !personalLearningDynamicProgramAllows(stillConfigured.settings, enrollment.id) ||
      !personalLearningFeatureEnabled(stillConfigured.settings, 'learningNudges')
    ) {
      skipped++;
      continue;
    }
    const stillLineConfiguration = await prisma.groupLineChannelConfiguration.findFirst({
      where: {
        id: configuration.id,
        workspaceId: s.workspaceId,
        groupId: s.groupId,
        environment: currentLineEnvironment(),
        status: 'ACTIVE',
        globallyPaused: false,
        lastVerifiedAt: { not: null },
        lastErrorCategory: null,
      },
      select: { encryptedAccessToken: true, quotaLowPriorityStop: true },
    });
    if (!stillLineConfiguration) {
      skipped++;
      continue;
    }
    const currentConsent = await prisma.aiTrainingUsageConsent.findFirst({
      where: { ...s, consentVersion: AI_TRAINING_AI_CONSENT_VERSION, textDigest: digest },
      select: { id: true },
    });
    const currentPreference = await prisma.personalLearningNudgePreference.findFirst({
      where: s,
      select: { enabled: true, consentVersion: true, pausedUntil: true, stoppedAt: true },
    });
    if (
      !currentConsent ||
      (currentPreference &&
        (!currentPreference.enabled ||
          currentPreference.stoppedAt ||
          currentPreference.consentVersion !== AI_TRAINING_AI_CONSENT_VERSION ||
          (currentPreference.pausedUntil && currentPreference.pausedUntil > new Date())))
    ) {
      skipped++;
      continue;
    }
    const claimed = await prisma.personalLearningLinePush.updateMany({
      where: { id: outbox.id, status: 'PENDING' },
      data: { status: 'SENDING' },
    });
    if (!claimed.count) {
      skipped++;
      continue;
    }
    const token = new AesGcmLineSecretCrypto().decrypt(stillLineConfiguration.encryptedAccessToken);
    const line = new LineMessagingApiAdapter();
    const quota = await line.getQuota(token);
    if (
      !quota.ok ||
      (quota.limit &&
        (quota.consumption / quota.limit) * 100 >= stillLineConfiguration.quotaLowPriorityStop)
    ) {
      await prisma.personalLearningLinePush.updateMany({
        where: { id: outbox.id, status: 'SENDING' },
        data: { status: 'PENDING' },
      });
      skipped++;
      continue;
    }
    const result = await line.pushText({
      accessToken: token,
      recipientId: stillConnected.providerUserId,
      text: outbox.text,
      retryKey: outbox.retryKey,
    });
    if (!result.ok) {
      await prisma.personalLearningLinePush.updateMany({
        where: { id: outbox.id, status: 'SENDING' },
        data: { status: result.retryable ? 'PENDING' : 'FAILED' },
      });
      skipped++;
      continue;
    }
    await prisma.$transaction([
      prisma.personalLearningLinePush.update({
        where: { id: outbox.id },
        data: { status: 'SENT', sentAt: new Date() },
      }),
      prisma.programActionEvent.create({
        data: {
          workspaceId: s.workspaceId,
          groupId: s.groupId,
          programEnrollmentId: s.programEnrollmentId,
          eventType: 'PERSONAL_LEARNING_NUDGE_SENT',
          idempotencyKey: providerEventId,
          schemaVersion: 1,
          metadata: {
            situation: decision.situation,
            sourceKey: decision.sourceKey,
            judgmentDate: dayKey,
            channel: 'LINE',
            copySource: 'FIXED_N1',
          },
          actorUserId: s.userId,
          occurredAt: new Date(),
        },
      }),
    ]);
    sent++;
  }
  return { scanned: enrollments.length, sent, skipped };
}

export async function personalLearningNudgesCronResponse(request: Request): Promise<Response> {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  const started = Date.now();
  try {
    const environment = getServerEnvironment();
    authorizeCronRequest(request, environment.CRON_SECRET);
    if (request.method !== 'GET')
      return Response.json({ requestId }, { status: 405, headers: { ...headers, allow: 'GET' } });
    const result = await run(new Date());
    logger.info('personal learning nudge daily run completed', {
      requestId,
      ...result,
      latency: Date.now() - started,
    });
    return Response.json({ outcome: 'COMPLETED', ...result, requestId }, { headers });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    logger.error('personal learning nudge daily run failed', {
      requestId,
      status: mapped.status,
      latency: Date.now() - started,
      errorCode: mapped.body.error.code,
    });
    return Response.json(mapped.body, { status: mapped.status, headers });
  }
}
