import { requestIdFromHeader } from '@bunshin/observability';
import 'server-only';
import { z } from 'zod';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { memberUsageReadLimit } from './member-usage-read-limit';
const headers = { 'cache-control': 'private, no-store', vary: 'Cookie, Authorization' };
const commandSchema = z
  .object({
    commandId: z.uuid(),
    expectedRevision: z.number().int().min(0).max(2_147_483_645),
    authority: z.enum(['HEADQUARTERS', 'SERVICE']),
    settings: z.unknown(),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();
export async function managedFeaturePolicyTarget(slug: string, actorUserId: string) {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug))
    throw new ApplicationError('NOT_FOUND', 'service not found');
  const db = await import('@bunshin/database');
  const configuration = await db.prisma.serviceConfiguration.findUnique({
    where: { slug },
    select: { workspaceId: true, groupId: true },
  });
  if (!configuration) throw new ApplicationError('NOT_FOUND', 'service not found');
  return { workspaceId: configuration.workspaceId, serviceId: configuration.groupId, actorUserId };
}
export async function managedFeaturePolicyResponse(
  request: Request,
  slug: string,
  createRepository: () => Promise<{
    read(scope: { workspaceId: string; serviceId: string; actorUserId: string }): Promise<unknown>;
    save(command: {
      workspaceId: string;
      serviceId: string;
      actorUserId: string;
      commandId: string;
      expectedRevision: number;
      authority: 'HEADQUARTERS' | 'SERVICE';
      settings: unknown;
      reason: string;
    }): Promise<unknown>;
  }>,
) {
  let release: (() => void) | undefined;
  try {
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    if (new URL(request.url).searchParams.size)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid query');
    const permit = memberUsageReadLimit.reserve(actor.userId);
    if (!permit.allowed)
      return Response.json(
        { error: { code: 'RATE_LIMITED', message: '時間をおいてお試しください。' } },
        { status: 429, headers: { ...headers, 'retry-after': String(permit.retryAfterSeconds) } },
      );
    release = permit.release;
    if (!['GET', 'PUT'].includes(request.method))
      return Response.json({ error: { code: 'METHOD_NOT_ALLOWED' } }, { status: 405, headers });
    let command: z.infer<typeof commandSchema> | undefined;
    if (request.method === 'PUT') {
      requireSameOrigin(request);
      if (!request.headers.get('content-type')?.startsWith('application/json'))
        throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON');
      }
      const parsed = commandSchema.safeParse(body);
      if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid command');
      command = parsed.data;
    }
    const scope = await managedFeaturePolicyTarget(slug, actor.userId);
    const repository = await createRepository();
    const data = command
      ? await repository.save({ ...scope, ...command })
      : await repository.read(scope);
    return Response.json({ data }, { headers });
  } catch (error) {
    const mapped = toApiError(error, requestIdFromHeader(request.headers.get('x-request-id')));
    return Response.json(mapped.body, { status: mapped.status, headers });
  } finally {
    release?.();
  }
}
