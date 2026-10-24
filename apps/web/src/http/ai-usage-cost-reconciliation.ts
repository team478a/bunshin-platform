import 'server-only';
import {
  ListUnknownAiUsageCosts,
  RepairUnknownAiUsageCosts,
  type UnknownAiUsageCostObservation,
} from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentAiProviderEnvironment } from '../ai/secure-provider-configuration';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';

const updateSchema = z
  .object({
    usageEventId: z.string().uuid(),
    estimatedCostUsdMicros: z.number().int().positive().safe(),
    pricingVersion: z.string().trim().min(1).max(120),
  })
  .strict();
const repairSchema = z
  .object({
    reason: z.string().trim().min(3).max(500),
    evidenceReference: z.string().trim().min(1).max(200),
    updates: z.array(updateSchema).min(1).max(100),
  })
  .strict();

async function actor() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return user.userId;
}

async function json(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
  try {
    return (await request.json()) as unknown;
  } catch (error) {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON', error);
  }
}

async function repository() {
  const db = await import('@bunshin/database');
  return new db.PrismaAiUsageCostReconciliationRepository();
}

const dto = (row: UnknownAiUsageCostObservation) => ({
  ...row,
  occurredAt: row.occurredAt.toISOString(),
});

async function respond(request: Request, operation: () => Promise<unknown>, status = 200) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    return Response.json(
      { data: await operation(), requestId },
      { status, headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}

export function listUnknownAiUsageCostsResponse(request: Request) {
  return respond(request, async () => {
    const result = await new ListUnknownAiUsageCosts(await repository()).execute({
      actorUserId: await actor(),
      environment: currentAiProviderEnvironment(),
      provider: 'OPENAI',
      limit: 100,
    });
    return { ...result, rows: result.rows.map(dto) };
  });
}

export function repairUnknownAiUsageCostsResponse(request: Request) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const parsed = repairSchema.safeParse(await json(request));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
    return new RepairUnknownAiUsageCosts(await repository()).execute({
      actorUserId: await actor(),
      environment: currentAiProviderEnvironment(),
      provider: 'OPENAI',
      reason: parsed.data.reason,
      evidenceReference: parsed.data.evidenceReference,
      updates: parsed.data.updates,
    });
  });
}
