import 'server-only';
import { createHash } from 'node:crypto';

export type AuthenticatedRegistrationFunnelEvent =
  | 'LINE_AUTHENTICATED'
  | 'ONBOARDING_STARTED'
  | 'ONBOARDING_COMPLETED'
  | 'FIRST_POST_VIEWED'
  | 'FIRST_POST_COPIED'
  | 'ORGANIZATION_JOINED'
  | 'GROUP_JOINED';

export function visitorKeyHash(visitorId: string): string {
  return createHash('sha256').update(visitorId, 'utf8').digest('hex');
}

export async function recordAuthenticatedRegistrationEvent(input: {
  eventType: AuthenticatedRegistrationFunnelEvent;
  userId: string;
  keySuffix?: string;
  source?: string;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  const db = await import('@bunshin/database');
  return db.prisma.registrationFunnelEvent.upsert({
    where: {
      idempotencyKey: `${input.eventType}:${input.userId}:${input.keySuffix ?? 'once'}`,
    },
    create: {
      eventType: input.eventType,
      userId: input.userId,
      source: input.source ?? 'WEB',
      metadata: input.metadata ?? {},
      idempotencyKey: `${input.eventType}:${input.userId}:${input.keySuffix ?? 'once'}`,
    },
    update: {},
  });
}
