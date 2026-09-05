import 'server-only';
import {
  ProcessLineWebhookEvents,
  ProcessGroupLineWebhookEvents,
  type LineConfigurationEnvironment,
  type LineWebhookEventType,
} from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { AesGcmLineSecretCrypto, currentLineEnvironment } from './secure-configuration';

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
            serviceConfiguration: { select: { slug: true, displayName: true } },
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
  const processor =
    dependencies.processor ??
    new ProcessGroupLineWebhookEvents(
      new (await import('@bunshin/database')).PrismaGroupLineConnectionRepository(),
    );
  for (const event of events) {
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
      await (dependencies.followReply ?? new LineGroupFollowReply()).send({
        accessToken: scoped.accessToken,
        replyToken,
        serviceName: scoped.serviceName,
        participationUrl: new URL(`/s/${scoped.serviceSlug}`, baseUrl).toString(),
      });
    }
  }
  return Response.json({ accepted: true });
}
