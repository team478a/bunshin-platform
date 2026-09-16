import 'server-only';
import { FortunePolicyError, FORTUNE_THEMES } from '@bunshin/capability-fortune';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { fortuneDailyReadingService } from '../fortune/runtime';

const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(80);
const uuid = z.string().uuid();
const joinBody = z.object({ ageConfirmed: z.literal(true) }).strict();
const drawBody = z.object({ theme: z.enum(FORTUNE_THEMES) }).strict();

const mapError = (error: unknown) => {
  if (error instanceof z.ZodError)
    return new ApplicationError('VALIDATION_ERROR', '入力内容が不正です', error);
  if (!(error instanceof FortunePolicyError)) return error;
  if (error.code === 'KNOWLEDGE_NOT_READY')
    return new ApplicationError('CONFIGURATION_ERROR', error.message);
  if (error.code === 'NOT_PARTICIPANT') return new ApplicationError('FORBIDDEN', error.message);
  if (error.code === 'INVALID_THEME')
    return new ApplicationError('VALIDATION_ERROR', error.message);
  return new ApplicationError('NOT_FOUND', error.message);
};

async function actorId() {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return actor.userId;
}

async function json<T>(request: Request, run: (actorUserId: string) => Promise<T>, status = 200) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const data = await run(await actorId());
    return Response.json(
      { data, requestId },
      { status, headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(mapError(error), requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}

const requireJson = async <T>(request: Request, schema: z.ZodType<T>) => {
  requireSameOrigin(request);
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
  return schema.parse(await request.json());
};

export const joinFortuneResponse = (request: Request, serviceSlug: string) =>
  json(
    request,
    async (actorUserId) => {
      const body = await requireJson(request, joinBody);
      return (await fortuneDailyReadingService()).join({
        serviceSlug: slug.parse(serviceSlug),
        actorUserId,
        ageConfirmed: body.ageConfirmed,
      });
    },
    201,
  );

export const getFortuneTodayResponse = (request: Request, serviceSlug: string) =>
  json(request, async (actorUserId) =>
    (await fortuneDailyReadingService()).today({
      serviceSlug: slug.parse(serviceSlug),
      actorUserId,
    }),
  );

export const drawFortuneResponse = (request: Request, serviceSlug: string) =>
  json(
    request,
    async (actorUserId) => {
      const body = await requireJson(request, drawBody);
      return (await fortuneDailyReadingService()).draw({
        serviceSlug: slug.parse(serviceSlug),
        actorUserId,
        theme: body.theme,
      });
    },
    201,
  );

export const listFortuneHistoryResponse = (request: Request, serviceSlug: string) =>
  json(request, async (actorUserId) =>
    (await fortuneDailyReadingService()).history({
      serviceSlug: slug.parse(serviceSlug),
      actorUserId,
    }),
  );

export const getFortuneReadingResponse = (
  request: Request,
  serviceSlug: string,
  readingId: string,
) =>
  json(request, async (actorUserId) =>
    (await fortuneDailyReadingService()).reading({
      serviceSlug: slug.parse(serviceSlug),
      actorUserId,
      readingId: uuid.parse(readingId),
    }),
  );

export const deleteFortuneReadingResponse = (
  request: Request,
  serviceSlug: string,
  readingId: string,
) =>
  json(request, async (actorUserId) => {
    requireSameOrigin(request);
    await (
      await fortuneDailyReadingService()
    ).delete({
      serviceSlug: slug.parse(serviceSlug),
      actorUserId,
      readingId: uuid.parse(readingId),
    });
    return { deleted: true };
  });
