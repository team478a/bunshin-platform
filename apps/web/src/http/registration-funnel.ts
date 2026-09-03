import 'server-only';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { requireSameOrigin } from '../auth/request-security';
import { currentUserProvider } from '../auth/current-user';
import { recordAuthenticatedRegistrationEvent, visitorKeyHash } from '../registration/funnel';

const schema = z.discriminatedUnion('eventType', [
  z.object({ eventType: z.literal('LANDING_VIEWED'), visitorId: z.string().uuid() }).strict(),
  z.object({ eventType: z.literal('FIRST_POST_COPIED') }).strict(),
]);

export async function registrationFunnelEventResponse(request: Request) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid funnel event');
    const value = parsed.data;
    const db = await import('@bunshin/database');
    if (value.eventType === 'LANDING_VIEWED') {
      const hash = visitorKeyHash(value.visitorId);
      const day = new Date().toISOString().slice(0, 10);
      await db.prisma.registrationFunnelEvent.upsert({
        where: { idempotencyKey: `LANDING_VIEWED:${hash}:${day}` },
        create: {
          eventType: 'LANDING_VIEWED',
          visitorKeyHash: hash,
          source: 'COMMON_LP',
          idempotencyKey: `LANDING_VIEWED:${hash}:${day}`,
        },
        update: {},
      });
    } else {
      const actor = await (await currentUserProvider()).getCurrentUser();
      if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
      await recordAuthenticatedRegistrationEvent({
        eventType: 'FIRST_POST_COPIED',
        userId: actor.userId,
        source: 'ONBOARDING_COMPLETE',
      });
    }
    return Response.json({ data: { recorded: true }, requestId }, { status: 201 });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status });
  }
}
