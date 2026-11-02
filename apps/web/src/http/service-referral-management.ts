import 'server-only';
import { z } from 'zod';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { memberUsageReadLimit } from './member-usage-read-limit';

const reason = z.string().trim().min(1).max(1000);
const conditions = z
  .object({
    requireNewRegistration: z.boolean(),
    requireOnboarding: z.boolean(),
    requireFirstUserGeneration: z.boolean(),
    minimumActiveDays: z.number().int().min(0).max(3660),
  })
  .strict();
export const referralManagementInput = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('POLICY'),
      expectedPolicyVersionId: z.string().uuid().nullable(),
      authority: z.enum(['HEADQUARTERS', 'SERVICE']),
      status: z.enum(['ACTIVE', 'SUSPENDED']),
      timezone: z.string().min(1).max(64),
      conditions,
      reason,
    })
    .strict(),
  z
    .object({
      kind: z.literal('REVIEW'),
      commandId: z.string().uuid(),
      referralId: z.string().uuid(),
      expectedRevision: z.number().int().nonnegative().max(2_147_483_646),
      review: z.enum(['UNKNOWN', 'REQUIRED', 'CLEAR']),
      reason,
    })
    .strict(),
  z
    .object({
      kind: z.literal('CONFIRM'),
      commandId: z.string().uuid(),
      referralId: z.string().uuid(),
      expectedRevision: z.number().int().nonnegative().max(2_147_483_646),
      expectedPolicyVersionId: z.string().uuid(),
      reason,
    })
    .strict(),
  z
    .object({
      kind: z.literal('REVOKE'),
      commandId: z.string().uuid(),
      referralId: z.string().uuid(),
      expectedRevision: z.number().int().nonnegative().max(2_147_483_646),
      reason,
    })
    .strict(),
]);
/** Resolves identifiers only; the repository independently authorizes inside every transaction. */
export async function referralManagementTarget(slug: string, actorUserId: string) {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug))
    throw new ApplicationError('NOT_FOUND', 'service not found');
  const db = await import('@bunshin/database');
  const service = await db.prisma.serviceConfiguration.findUnique({
    where: { slug },
    select: { workspaceId: true, groupId: true },
  });
  if (!service) throw new ApplicationError('NOT_FOUND', 'service not found');
  return { workspaceId: service.workspaceId, serviceId: service.groupId, actorUserId };
}
const headers = { 'cache-control': 'private, no-store', vary: 'Cookie, Authorization' };
export async function serviceReferralManagementResponse(request: Request, slug: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  let release: (() => void) | undefined;
  try {
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const query = new URL(request.url).searchParams;
    const after = query.get('after') ?? undefined;
    if (
      [...query.keys()].some((key) => key !== 'after') ||
      query.getAll('after').length > 1 ||
      (after !== undefined &&
        (!z.string().uuid().safeParse(after).success || request.method !== 'GET'))
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid query');
    const permit = memberUsageReadLimit.reserve(actor.userId);
    if (!permit.allowed)
      return Response.json(
        { error: { code: 'RATE_LIMITED', message: '少し時間をおいてお試しください。', requestId } },
        { status: 429, headers: { ...headers, 'retry-after': String(permit.retryAfterSeconds) } },
      );
    release = permit.release;
    if (request.method === 'POST') {
      requireSameOrigin(request);
      if (!request.headers.get('content-type')?.startsWith('application/json'))
        throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    }
    const scope = await referralManagementTarget(slug, actor.userId);
    const db = await import('@bunshin/database');
    const repository = new db.PrismaServiceReferralManagementRepository();
    let data: unknown;
    if (request.method === 'GET') data = await repository.overview(scope, after);
    else {
      const body = await request.text();
      if (body.length > 8192) throw new ApplicationError('VALIDATION_ERROR', 'request too large');
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON');
      }
      const result = referralManagementInput.safeParse(parsed);
      if (!result.success)
        throw new ApplicationError('VALIDATION_ERROR', 'invalid referral request');
      const value = result.data;
      data =
        value.kind === 'POLICY'
          ? await repository.savePolicy(scope, value)
          : await repository.execute(scope, value);
    }
    return Response.json({ data, requestId }, { headers });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status, headers });
  } finally {
    release?.();
  }
}
