import 'server-only';
import {
  ListProductionGateEvidence,
  PRODUCTION_GATE_CHECK_KEYS,
  RecordProductionGateEvidence,
  type ProductionGateEvidence,
} from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';

const inputSchema = z
  .object({
    checkKey: z.enum(PRODUCTION_GATE_CHECK_KEYS),
    action: z.enum(['RECORDED', 'REVOKED']),
    reason: z.string().min(10).max(1000),
    evidenceUrl: z.union([z.url(), z.literal('')]).optional(),
  })
  .strict();

function productionContext() {
  const environment = getServerEnvironment();
  const commitSha = process.env['VERCEL_GIT_COMMIT_SHA']?.toLowerCase() ?? '';
  if (environment.APP_ENV !== 'production' || !/^[0-9a-f]{40}$/.test(commitSha))
    throw new ApplicationError('CONFIGURATION_ERROR', 'production commit is unavailable');
  return { environment: 'PRODUCTION' as const, commitSha };
}
async function actor() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return user.userId;
}
async function repository() {
  const db = await import('@bunshin/database');
  return new db.PrismaProductionGateEvidenceRepository();
}
const dto = (value: ProductionGateEvidence) => ({
  ...value,
  occurredAt: value.occurredAt.toISOString(),
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

export function listProductionGateEvidenceResponse(request: Request) {
  return respond(request, async () => {
    const values = await new ListProductionGateEvidence(await repository()).execute({
      actorUserId: await actor(),
      ...productionContext(),
    });
    return values.map(dto);
  });
}

export function recordProductionGateEvidenceResponse(request: Request) {
  return respond(
    request,
    async () => {
      requireSameOrigin(request);
      let body: unknown;
      try {
        body = await request.json();
      } catch (error) {
        throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON', error);
      }
      const parsed = inputSchema.safeParse(body);
      if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
      return dto(
        await new RecordProductionGateEvidence(await repository()).execute({
          actorUserId: await actor(),
          ...productionContext(),
          ...parsed.data,
          evidenceUrl: parsed.data.evidenceUrl || null,
        }),
      );
    },
    201,
  );
}
