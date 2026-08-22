import 'server-only';
import {
  ProcessLineWebhookEvents,
  type LineConfigurationEnvironment,
  type LineWebhookEventType,
} from '@bunshin/application';
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
