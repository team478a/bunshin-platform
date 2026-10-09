import 'server-only';
import { getServerEnvironment } from '@bunshin/config';
import { parsePersonalLearningPreparationAuthority } from '@bunshin/application';
import { REPRODUCTION_CHALLENGE_REVIEW_FIXTURES } from '@bunshin/capability-training';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { requestIdFromHeader } from '@bunshin/observability';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolveManagedServiceContext } from '../services/public-service';

const headers = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };
const denied = () => new ApplicationError('NOT_FOUND', 'challenge review unavailable');
const invalid = () => new ApplicationError('VALIDATION_ERROR', 'invalid challenge review request');
const configKeys = [
  'PERSONAL_LEARNING_CHALLENGE_REVIEW_ADMIN',
  'PERSONAL_LEARNING_PRODUCTION_PREPARATION',
  'PERSONAL_LEARNING_PILOT',
  'PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT',
  'VERCEL_GIT_COMMIT_SHA',
] as const;

/** Human review records only. This endpoint cannot grant Assignment execution permission. */
export async function reproductionChallengeReviewResponse(request: Request, serviceSlug: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    if (!['GET', 'POST'].includes(request.method))
      return Response.json(
        { requestId },
        { status: 405, headers: { ...headers, allow: 'GET, POST' } },
      );
    if (request.method === 'POST') requireSameOrigin(request);
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const environment = getServerEnvironment().APP_ENV;
    const snapshot = configKeys.map((key) => process.env[key]);
    const commit = process.env['VERCEL_GIT_COMMIT_SHA'] ?? '';
    if (
      !['production', 'staging', 'development'].includes(environment) ||
      process.env['PERSONAL_LEARNING_CHALLENGE_REVIEW_ADMIN'] !== 'true' ||
      process.env['PERSONAL_LEARNING_PILOT'] !== 'false' ||
      process.env['PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT'] !== 'false' ||
      !/^[a-f0-9]{40}$/.test(commit)
    )
      throw denied();
    let raw: unknown;
    try {
      raw = JSON.parse(process.env['PERSONAL_LEARNING_PRODUCTION_PREPARATION'] ?? 'null');
    } catch {
      throw denied();
    }
    const authority = parsePersonalLearningPreparationAuthority(raw);
    if (!authority) throw denied();
    const service = await resolveManagedServiceContext(serviceSlug, actor.userId).catch(
      (error: unknown) => {
        if (error instanceof Error && error.message === 'SERVICE_NOT_FOUND') throw denied();
        throw error;
      },
    );
    if (service.workspaceId !== authority.workspaceId || service.serviceId !== authority.groupId)
      throw denied();
    const guard = () => {
      if (
        getServerEnvironment().APP_ENV !== environment ||
        configKeys.some((key, index) => process.env[key] !== snapshot[index])
      )
        throw denied();
    };
    guard();
    const url = new URL(request.url);
    let reference;
    let input: unknown;
    if (request.method === 'GET') {
      const entries = [...url.searchParams];
      if (url.search.length > 256 || entries.length !== 1 || entries[0]?.[0] !== 'challengeKey')
        throw invalid();
      reference = REPRODUCTION_CHALLENGE_REVIEW_FIXTURES.find(
        (fixture) => fixture.reference.challengeKey === entries[0]?.[1],
      )?.reference;
      if (!reference) throw denied();
    } else {
      if (
        url.search ||
        request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
          'application/json' ||
        !request.body
      )
        throw invalid();
      const reader = request.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          bytes += part.value.byteLength;
          if (bytes > 4096) {
            await reader.cancel();
            return Response.json({ requestId }, { status: 413, headers });
          }
          chunks.push(part.value);
        }
      } finally {
        reader.releaseLock();
      }
      try {
        input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        throw invalid();
      }
    }
    const db = await import('@bunshin/database');
    const command =
      request.method === 'POST'
        ? db.validateReproductionChallengeReviewAdminCommand(input)
        : undefined;
    guard();
    const repository = new db.PrismaReproductionChallengeReviewAdminRepository(
      db.prisma,
      authority,
      commit,
      guard,
    );
    const data = command
      ? await repository.change(actor.userId, command)
      : await repository.read(actor.userId, reference);
    guard();
    return Response.json({ data, requestId }, { headers });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status, headers });
  }
}
