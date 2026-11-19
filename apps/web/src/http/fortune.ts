import 'server-only';
import {
  FortunePolicyError,
  FORTUNE_FEEDBACK_ISSUES,
  FORTUNE_FEEDBACK_RATINGS,
  FORTUNE_THEMES,
  FORTUNE_PROFILE_STYLES,
} from '@bunshin/capability-fortune';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { fortuneDailyReadingService } from '../fortune/runtime';
import { fortunePersonalProfileRepository } from '../fortune/personal-profile';
import { recordServiceUse } from '../services/service-membership';

const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(80);
const uuid = z.string().uuid();
const joinBody = z.object({ ageConfirmed: z.literal(true) }).strict();
const personalizationBody = z.object({ bunshinId: uuid.nullable() }).strict();
const optionalProfileText = (limit: number) =>
  z
    .string()
    .trim()
    .max(limit)
    .nullable()
    .transform((value) => value || null);
const personalProfileBody = z.discriminatedUnion('consented', [
  z.object({ consented: z.literal(false) }).strict(),
  z
    .object({
      consented: z.literal(true),
      interest: optionalProfileText(120),
      question: optionalProfileText(500),
      style: z.enum(FORTUNE_PROFILE_STYLES).nullable(),
    })
    .strict(),
]);
const drawBody = z
  .object({ theme: z.enum(FORTUNE_THEMES), consultation: z.string().trim().max(500).optional() })
  .strict();
const feedbackBody = z
  .object({
    rating: z.enum(FORTUNE_FEEDBACK_RATINGS),
    issue: z.enum(FORTUNE_FEEDBACK_ISSUES).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.issue && value.rating !== 'NOT_HELPFUL')
      context.addIssue({
        code: 'custom',
        path: ['issue'],
        message: 'reason is available only for NOT_HELPFUL feedback',
      });
  });

const mapError = (error: unknown) => {
  if (error instanceof z.ZodError)
    return new ApplicationError('VALIDATION_ERROR', '入力内容が不正です', error);
  if (!(error instanceof FortunePolicyError)) return error;
  if (error.code === 'KNOWLEDGE_NOT_READY')
    return new ApplicationError('CONFIGURATION_ERROR', error.message);
  if (error.code === 'NOT_PARTICIPANT') return new ApplicationError('FORBIDDEN', error.message);
  if (error.code === 'INVALID_THEME')
    return new ApplicationError('VALIDATION_ERROR', error.message);
  if (error.code === 'INVALID_FEEDBACK')
    return new ApplicationError('VALIDATION_ERROR', error.message);
  return new ApplicationError('NOT_FOUND', error.message);
};

async function actorId() {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return actor.userId;
}

async function json<T>(
  request: Request,
  serviceSlug: string,
  run: (actorUserId: string, parsedSlug: string) => Promise<T>,
  status = 200,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const parsedSlug = slug.parse(serviceSlug);
    const actorUserId = await actorId();
    await recordServiceUse(parsedSlug, actorUserId);
    const data = await run(actorUserId, parsedSlug);
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
  const body = await request.json().catch(() => {
    throw new ApplicationError('VALIDATION_ERROR', 'JSON形式の入力が必要です');
  });
  return schema.parse(body);
};

export const joinFortuneResponse = (request: Request, serviceSlug: string) =>
  json(
    request,
    serviceSlug,
    async (actorUserId, parsedSlug) => {
      const body = await requireJson(request, joinBody);
      return (await fortuneDailyReadingService()).join({
        serviceSlug: parsedSlug,
        actorUserId,
        ageConfirmed: body.ageConfirmed,
      });
    },
    201,
  );

export const updateFortunePersonalizationResponse = (request: Request, serviceSlug: string) =>
  json(request, serviceSlug, async (actorUserId, parsedSlug) => {
    const body = await requireJson(request, personalizationBody);
    return (await fortuneDailyReadingService()).updatePersonalization({
      serviceSlug: parsedSlug,
      actorUserId,
      bunshinId: body.bunshinId,
    });
  });

export const updateFortunePersonalProfileResponse = (request: Request, serviceSlug: string) =>
  json(request, serviceSlug, async (actorUserId, parsedSlug) => {
    const profile = await requireJson(request, personalProfileBody);
    const saved = await (
      await fortunePersonalProfileRepository()
    ).update({
      serviceSlug: parsedSlug,
      actorUserId,
      profile,
    });
    if (!saved) throw new ApplicationError('FORBIDDEN', 'プロフィールを更新できません。');
    return { saved };
  });

export const getFortuneTodayResponse = (request: Request, serviceSlug: string) =>
  json(request, serviceSlug, async (actorUserId, parsedSlug) =>
    (await fortuneDailyReadingService()).today({
      serviceSlug: parsedSlug,
      actorUserId,
      recordView: true,
    }),
  );

export const drawFortuneResponse = (request: Request, serviceSlug: string) =>
  json(
    request,
    serviceSlug,
    async (actorUserId, parsedSlug) => {
      const body = await requireJson(request, drawBody);
      return (await fortuneDailyReadingService()).draw({
        serviceSlug: parsedSlug,
        actorUserId,
        theme: body.theme,
        ...(body.consultation ? { consultation: body.consultation } : {}),
      });
    },
    201,
  );

export const listFortuneHistoryResponse = (request: Request, serviceSlug: string) =>
  json(request, serviceSlug, async (actorUserId, parsedSlug) =>
    (await fortuneDailyReadingService()).history({
      serviceSlug: parsedSlug,
      actorUserId,
    }),
  );

export const getFortuneReadingResponse = (
  request: Request,
  serviceSlug: string,
  readingId: string,
) =>
  json(request, serviceSlug, async (actorUserId, parsedSlug) =>
    (await fortuneDailyReadingService()).reading({
      serviceSlug: parsedSlug,
      actorUserId,
      readingId: uuid.parse(readingId),
    }),
  );

export const deleteFortuneReadingResponse = (
  request: Request,
  serviceSlug: string,
  readingId: string,
) =>
  json(request, serviceSlug, async (actorUserId, parsedSlug) => {
    requireSameOrigin(request);
    await (
      await fortuneDailyReadingService()
    ).delete({
      serviceSlug: parsedSlug,
      actorUserId,
      readingId: uuid.parse(readingId),
    });
    return { deleted: true };
  });

export const updateFortuneFeedbackResponse = (
  request: Request,
  serviceSlug: string,
  readingId: string,
) =>
  json(request, serviceSlug, async (actorUserId, parsedSlug) => {
    const body = await requireJson(request, feedbackBody);
    return (await fortuneDailyReadingService()).feedback({
      serviceSlug: parsedSlug,
      actorUserId,
      readingId: uuid.parse(readingId),
      rating: body.rating,
      issue: body.issue,
    });
  });
