import 'server-only';
import {
  ProcessLineWebhookEvents,
  ProcessGroupLineWebhookEvents,
  type LineConfigurationEnvironment,
  type LineWebhookEventType,
} from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { createHmac, randomBytes, timingSafeEqual, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { ApplicationError } from '@bunshin/shared';
import {
  personalLearningDynamicProgramAllows,
  personalLearningFeatureEnabled,
} from '@bunshin/capability-training';
import { AesGcmLineSecretCrypto, currentLineEnvironment } from './secure-configuration';
import { GroupParticipationService } from '@bunshin/application';
import { groupInvitationTokenHash } from '../http/group-invitations';
import {
  AI_TRAINING_AI_CONSENT_VERSION,
  AI_TRAINING_AI_CONSENT_TEXT,
} from '../services/ai-training-consent';

const aiConsentDigest = createHash('sha256').update(AI_TRAINING_AI_CONSENT_TEXT).digest('hex');

const webhookBody = z
  .object({
    events: z
      .array(
        z
          .object({
            type: z.string(),
            timestamp: z.number().int().nonnegative(),
            webhookEventId: z.string().min(1).max(255),
            replyToken: z.string().min(1).max(255).optional(),
            source: z
              .object({ userId: z.string().min(1).max(255).optional() })
              .passthrough()
              .optional(),
            message: z
              .object({
                type: z.enum(['text', 'image']).optional(),
                id: z.string().min(1).max(255).optional(),
                text: z.string().max(5000).optional(),
              })
              .passthrough()
              .optional(),
          })
          .passthrough(),
      )
      .max(100),
  })
  .passthrough();

export function verifyLineWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
  if (!signature || signature.length > 128 || secret.length < 8) return false;
  let supplied: Buffer;
  try {
    supplied = Buffer.from(signature, 'base64');
  } catch {
    return false;
  }
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest();
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function parseLineWebhookEvents(rawBody: string) {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return null;
  }
  const parsed = webhookBody.safeParse(json);
  if (!parsed.success) return null;
  return parsed.data.events.map((event) => {
    const type: LineWebhookEventType =
      event.type === 'follow' ? 'FOLLOW' : event.type === 'unfollow' ? 'UNFOLLOW' : 'OTHER';
    return {
      providerEventId: event.webhookEventId,
      providerUserId: event.source?.userId ?? null,
      type,
      ...(event.type === 'message' &&
      event.message?.type === 'text' &&
      event.message.text !== undefined
        ? { message: { type: 'TEXT' as const, text: event.message.text } }
        : event.type === 'message' && event.message?.type === 'image' && event.message.id
          ? { message: { type: 'IMAGE' as const, lineMessageId: event.message.id } }
          : {}),
      occurredAt: new Date(event.timestamp),
    };
  });
}

export interface ActiveLineWebhookSecretPort {
  get(environment: LineConfigurationEnvironment): Promise<string | null>;
}

export class PrismaActiveLineWebhookSecret implements ActiveLineWebhookSecretPort {
  constructor(private readonly crypto = new AesGcmLineSecretCrypto()) {}

  async get(environment: LineConfigurationEnvironment): Promise<string | null> {
    if (environment !== currentLineEnvironment()) return null;
    const { prisma } = await import('@bunshin/database');
    const configuration = await prisma.lineChannelConfiguration.findFirst({
      where: {
        environment,
        status: 'ACTIVE',
        lastVerifiedAt: { not: null },
        lastErrorCategory: null,
      },
      select: { environment: true, encryptedMessagingSecret: true },
    });
    if (!configuration || configuration.environment !== environment) return null;
    return this.crypto.decrypt(configuration.encryptedMessagingSecret);
  }
}

export async function handleLineWebhook(
  request: Request,
  dependencies: {
    environment?: LineConfigurationEnvironment;
    secrets?: ActiveLineWebhookSecretPort;
    processor?: ProcessLineWebhookEvents;
  } = {},
): Promise<Response> {
  const environment = dependencies.environment ?? currentLineEnvironment();
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, 'utf8') > 1_000_000)
    return Response.json({ error: 'payload too large' }, { status: 413 });
  const secret = await (dependencies.secrets ?? new PrismaActiveLineWebhookSecret()).get(
    environment,
  );
  const signature = request.headers.get('x-line-signature') ?? '';
  if (!secret || !verifyLineWebhookSignature(rawBody, signature, secret))
    return Response.json({ error: 'invalid signature' }, { status: 401 });

  const events = parseLineWebhookEvents(rawBody);
  if (!events) return Response.json({ accepted: true });
  const processor =
    dependencies.processor ??
    new ProcessLineWebhookEvents(
      new (await import('@bunshin/database')).PrismaLineConnectionRepository(),
    );
  await processor.execute({ environment, events });
  return Response.json({ accepted: true });
}

export interface ActiveGroupLineWebhookConfigurationPort {
  get(
    routingKey: string,
    environment: LineConfigurationEnvironment,
  ): Promise<{
    workspaceId: string;
    groupId: string;
    configurationId: string;
    secret: string;
    accessToken: string;
    serviceSlug: string | null;
    serviceName: string | null;
    registrationMode: string | null;
    registrationLineEnabled: boolean;
  } | null>;
}

export interface GroupLineFollowReplyPort {
  send(input: {
    accessToken: string;
    replyToken: string;
    serviceName: string;
    participationUrl: string;
  }): Promise<boolean>;
}

export interface GroupLineFollowInvitationPort {
  create(input: {
    workspaceId: string;
    groupId: string;
    tokenHash: string;
    sourceEventId: string;
    expiresAt: Date;
  }): Promise<boolean>;
}

export interface GroupLineLearningInboxPort {
  persist(input: {
    environment: LineConfigurationEnvironment;
    workspaceId: string;
    groupId: string;
    configurationId: string;
    events: Array<{
      providerEventId: string;
      providerUserId: string | null;
      occurredAt: Date;
      message: { type: 'TEXT'; text: string } | { type: 'IMAGE'; lineMessageId: string };
    }>;
  }): Promise<void>;
}

export class PrismaGroupLineLearningInbox implements GroupLineLearningInboxPort {
  async persist(input: Parameters<GroupLineLearningInboxPort['persist']>[0]) {
    const { prisma } = await import('@bunshin/database');
    await prisma.$transaction(async (tx) => {
      const configuration = await tx.groupLineChannelConfiguration.findFirst({
        where: {
          id: input.configurationId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          environment: input.environment,
          status: 'ACTIVE',
          globallyPaused: false,
          group: {
            status: 'ACTIVE',
            lineRoutingPolicies: {
              some: { environment: input.environment, mode: 'DEDICATED', pilotEnabled: true },
            },
          },
        },
        select: { id: true },
      });
      if (!configuration) throw new Error('LINE learning configuration unavailable');
      for (const event of input.events) {
        const prior = await tx.groupLineWebhookEvent.findUnique({
          where: {
            configurationId_providerEventId: {
              configurationId: input.configurationId,
              providerEventId: event.providerEventId,
            },
          },
          select: { id: true },
        });
        if (prior) continue;
        const connection = event.providerUserId
          ? await tx.groupLineConnection.findFirst({
              where: {
                configurationId: input.configurationId,
                workspaceId: input.workspaceId,
                groupId: input.groupId,
                providerUserId: event.providerUserId,
                status: 'ACTIVE',
                friendshipStatus: 'FOLLOWING',
                notificationConsentAt: { not: null },
                user: { status: 'ACTIVE' },
                groupMembership: { status: 'ACTIVE', consentedAt: { not: null } },
              },
              select: { id: true, userId: true, groupMembershipId: true },
            })
          : null;
        const enrollment = connection
          ? await tx.programEnrollment.findFirst({
              where: {
                workspaceId: input.workspaceId,
                groupId: input.groupId,
                groupMembershipId: connection.groupMembershipId,
                status: 'ACTIVE',
                startsAt: { lte: new Date() },
                OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
              },
              orderBy: [{ startsAt: 'desc' }, { id: 'asc' }],
              select: { id: true, serviceProgramId: true },
            })
          : null;
        const program = enrollment
          ? await tx.serviceProgram.findFirst({
              where: {
                id: enrollment.serviceProgramId,
                workspaceId: input.workspaceId,
                groupId: input.groupId,
                status: 'ACTIVE',
                settings: { path: ['moduleKey'], equals: 'AI_TRAINING_V1' },
              },
              select: { settings: true },
            })
          : null;
        const settings = program?.settings;
        const lineLearning = personalLearningFeatureEnabled(settings, 'lineLearning');
        const dynamicEnabled = enrollment
          ? personalLearningDynamicProgramAllows(settings, enrollment.id)
          : false;
        const consent =
          enrollment && connection
            ? await tx.aiTrainingUsageConsent.findFirst({
                where: {
                  workspaceId: input.workspaceId,
                  groupId: input.groupId,
                  programEnrollmentId: enrollment.id,
                  groupMembershipId: connection.groupMembershipId,
                  userId: connection.userId,
                  consentVersion: AI_TRAINING_AI_CONSENT_VERSION,
                  textDigest: aiConsentDigest,
                },
                select: { id: true },
              })
            : null;
        let outcome: 'APPLIED' | 'CONNECTION_NOT_FOUND' | 'IGNORED' = 'IGNORED';
        if (connection) outcome = 'CONNECTION_NOT_FOUND';
        let seat = false;
        if (connection && enrollment && program) {
          try {
            const db = await import('@bunshin/database');
            await db.requirePersonalLearningPilotSeat(
              tx,
              {
                workspaceId: input.workspaceId,
                groupId: input.groupId,
                programEnrollmentId: enrollment.id,
                userId: connection.userId,
              },
              true,
            );
            seat = true;
          } catch (error) {
            if (!(error instanceof ApplicationError) || error.code !== 'NOT_FOUND') throw error;
            seat = false;
          }
        }
        if (
          connection &&
          enrollment &&
          program &&
          lineLearning &&
          dynamicEnabled &&
          consent &&
          seat
        ) {
          const multiTopic = personalLearningFeatureEnabled(settings, 'multiTopic');
          const activeTopics = multiTopic
            ? await tx.personalLearningTopic.findMany({
                where: {
                  workspaceId: input.workspaceId,
                  groupId: input.groupId,
                  programEnrollmentId: enrollment.id,
                  groupMembershipId: connection.groupMembershipId,
                  userId: connection.userId,
                  status: 'ACTIVE',
                },
                orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
                take: 3,
                select: { id: true },
              })
            : [];
          const topicId = multiTopic && activeTopics.length === 1 ? activeTopics[0]!.id : null;
          const inbox = await tx.personalLearningLineInbox.create({
            data: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              programEnrollmentId: enrollment.id,
              groupMembershipId: connection.groupMembershipId,
              userId: connection.userId,
              configurationId: input.configurationId,
              providerEventId: event.providerEventId,
              topicId,
              messageType: event.message.type,
              ...(event.message.type === 'TEXT'
                ? { text: event.message.text }
                : { lineMessageId: event.message.lineMessageId }),
            },
          });
          await tx.job.create({
            data: {
              environment: input.environment,
              workspaceId: input.workspaceId,
              jobType: 'PERSONAL_LEARNING_LINE_PROCESS',
              payloadReference: `personal-learning-line:${inbox.id}`,
              idempotencyKey: `personal-learning-line:${input.configurationId}:${event.providerEventId}`,
              correlationId: randomUUID(),
              requestedBy: connection.userId,
              priority: 70,
              maxAttempts: 5,
            },
          });
          outcome = 'APPLIED';
        }
        await tx.groupLineWebhookEvent.create({
          data: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            configurationId: input.configurationId,
            providerEventId: event.providerEventId,
            type: 'OTHER',
            outcome,
            occurredAt: event.occurredAt,
          },
        });
      }
    });
  }
}

class DatabaseGroupLineFollowInvitation implements GroupLineFollowInvitationPort {
  async create(input: Parameters<GroupLineFollowInvitationPort['create']>[0]) {
    const db = await import('@bunshin/database');
    const invitation = await new GroupParticipationService(
      new db.PrismaGroupParticipationRepository(),
    ).createLineFollowInvitation(input);
    return invitation !== null;
  }
}

export class LineGroupFollowReply implements GroupLineFollowReplyPort {
  constructor(private readonly request: typeof fetch = fetch) {}

  async send(input: {
    accessToken: string;
    replyToken: string;
    serviceName: string;
    participationUrl: string;
  }): Promise<boolean> {
    try {
      const response = await this.request('https://api.line.me/v2/bot/message/reply', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${input.accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          replyToken: input.replyToken,
          messages: [
            {
              type: 'template',
              altText: `${input.serviceName}の参加登録はこちら`,
              template: {
                type: 'buttons',
                title: '参加登録のご案内',
                text: `${input.serviceName}を利用するには、参加登録を完了してください。`,
                actions: [
                  {
                    type: 'uri',
                    label: '参加登録する',
                    uri: input.participationUrl,
                  },
                ],
              },
            },
          ],
        }),
        signal: AbortSignal.timeout(10_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export class PrismaActiveGroupLineWebhookConfiguration implements ActiveGroupLineWebhookConfigurationPort {
  constructor(private readonly crypto = new AesGcmLineSecretCrypto()) {}
  async get(routingKey: string, environment: LineConfigurationEnvironment) {
    if (environment !== currentLineEnvironment()) return null;
    const { prisma } = await import('@bunshin/database');
    const configuration = await prisma.groupLineChannelConfiguration.findFirst({
      where: {
        webhookRoutingKey: routingKey,
        environment,
        status: 'ACTIVE',
        lastVerifiedAt: { not: null },
        lastErrorCategory: null,
        group: {
          status: 'ACTIVE',
          lineRoutingPolicies: { some: { environment, mode: 'DEDICATED', pilotEnabled: true } },
        },
      },
      select: {
        id: true,
        workspaceId: true,
        groupId: true,
        encryptedMessagingSecret: true,
        encryptedAccessToken: true,
        group: {
          select: {
            serviceConfiguration: {
              select: {
                slug: true,
                displayName: true,
                registration: { select: { mode: true, lineEnabled: true } },
              },
            },
          },
        },
      },
    });
    return configuration
      ? {
          workspaceId: configuration.workspaceId,
          groupId: configuration.groupId,
          configurationId: configuration.id,
          secret: this.crypto.decrypt(configuration.encryptedMessagingSecret),
          accessToken: this.crypto.decrypt(configuration.encryptedAccessToken),
          serviceSlug: configuration.group.serviceConfiguration?.slug ?? null,
          serviceName: configuration.group.serviceConfiguration?.displayName ?? null,
          registrationMode: configuration.group.serviceConfiguration?.registration?.mode ?? null,
          registrationLineEnabled:
            configuration.group.serviceConfiguration?.registration?.lineEnabled ?? false,
        }
      : null;
  }
}

export async function handleGroupLineWebhook(
  request: Request,
  routingKey: string,
  dependencies: {
    environment?: LineConfigurationEnvironment;
    configurations?: ActiveGroupLineWebhookConfigurationPort;
    processor?: ProcessGroupLineWebhookEvents;
    followReply?: GroupLineFollowReplyPort;
    followInvitations?: GroupLineFollowInvitationPort;
    learningInbox?: GroupLineLearningInboxPort;
  } = {},
) {
  if (!z.string().uuid().safeParse(routingKey).success)
    return Response.json({ error: 'not found' }, { status: 404 });
  const environment = dependencies.environment ?? currentLineEnvironment();
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, 'utf8') > 1_000_000)
    return Response.json({ error: 'payload too large' }, { status: 413 });
  const scoped = await (
    dependencies.configurations ?? new PrismaActiveGroupLineWebhookConfiguration()
  ).get(routingKey, environment);
  const signature = request.headers.get('x-line-signature') ?? '';
  if (!scoped || !verifyLineWebhookSignature(rawBody, signature, scoped.secret))
    return Response.json({ error: 'invalid signature' }, { status: 401 });
  const events = parseLineWebhookEvents(rawBody);
  if (!events) return Response.json({ accepted: true });
  const parsedBody = webhookBody.safeParse(JSON.parse(rawBody));
  const replyTokens = parsedBody.success
    ? new Map(parsedBody.data.events.map((event) => [event.webhookEventId, event.replyToken]))
    : new Map<string, string | undefined>();
  const learningEvents = events.filter((event) => 'message' in event);
  if (learningEvents.length) {
    try {
      await (dependencies.learningInbox ?? new PrismaGroupLineLearningInbox()).persist({
        environment,
        workspaceId: scoped.workspaceId,
        groupId: scoped.groupId,
        configurationId: scoped.configurationId,
        events: learningEvents.map(({ message, ...event }) => ({
          ...event,
          message,
        })),
      });
    } catch {
      return Response.json({ error: 'temporary persistence failure' }, { status: 500 });
    }
  }
  const processor =
    dependencies.processor ??
    new ProcessGroupLineWebhookEvents(
      new (await import('@bunshin/database')).PrismaGroupLineConnectionRepository(),
    );
  for (const event of events.filter((candidate) => !('message' in candidate))) {
    const result = await processor.execute({
      environment,
      workspaceId: scoped.workspaceId,
      groupId: scoped.groupId,
      configurationId: scoped.configurationId,
      events: [event],
    });
    const replyToken = replyTokens.get(event.providerEventId);
    const shouldReplyToFollow =
      result?.outcomes.APPLIED === 1 || result?.outcomes.CONNECTION_NOT_FOUND === 1;
    if (
      event.type === 'FOLLOW' &&
      shouldReplyToFollow &&
      replyToken &&
      scoped.serviceSlug &&
      scoped.serviceName
    ) {
      const baseUrl = getServerEnvironment().APP_URL;
      let participationUrl = new URL(`/s/${scoped.serviceSlug}`, baseUrl).toString();
      if (
        result?.outcomes.CONNECTION_NOT_FOUND === 1 &&
        ['INVITATION_ONLY', 'INVITATION_APPROVAL_REQUIRED'].includes(
          scoped.registrationMode ?? '',
        ) &&
        scoped.registrationLineEnabled
      ) {
        const token = randomBytes(32).toString('base64url');
        const created = await (
          dependencies.followInvitations ?? new DatabaseGroupLineFollowInvitation()
        ).create({
          workspaceId: scoped.workspaceId,
          groupId: scoped.groupId,
          tokenHash: groupInvitationTokenHash(token),
          sourceEventId: event.providerEventId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });
        // Never send a token unless the invitation was durably created.
        if (!created) continue;
        participationUrl = new URL(`/s/${scoped.serviceSlug}/join/${token}`, baseUrl).toString();
      }
      await (dependencies.followReply ?? new LineGroupFollowReply()).send({
        accessToken: scoped.accessToken,
        replyToken,
        serviceName: scoped.serviceName,
        participationUrl,
      });
    }
  }
  return Response.json({ accepted: true });
}
