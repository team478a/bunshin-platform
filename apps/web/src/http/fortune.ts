import 'server-only';
import {
  FortunePolicyError,
  FORTUNE_FEEDBACK_ISSUES,
  FORTUNE_FEEDBACK_RATINGS,
  FORTUNE_INTAKE_KEYS,
  FORTUNE_INTAKE_MAX_QUESTIONS,
  FORTUNE_PERSONAL_FIT_RATINGS,
  FORTUNE_THEMES,
  FORTUNE_PROFILE_STYLES,
  FORTUNE_REFLECTION_ANSWERS,
  FORTUNE_UNDERSTANDING_FIELDS,
  FORTUNE_UNDERSTANDING_SOURCES,
  parseFortuneReviewedItems,
  fortuneUnderstandingConsultation,
  toJapanLocalDate,
} from '@bunshin/capability-fortune';
import { createLogger, requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { fortuneDailyReadingService } from '../fortune/runtime';
import {
  fortunePersonalProfileRepository,
  fortuneUnderstandingRepository,
} from '../fortune/personal-profile';
import { recordServiceUse } from '../services/service-membership';
import { askFortuneFollowUp, fortuneFollowUpRepository } from '../fortune/follow-ups';
import { selectFortuneIntakeQuestion } from '../providers/openai-fortune-intake';

import { recordFortuneFunnel } from '../fortune/funnel';

const logger = createLogger();

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
const reviewedItemBody = z
  .object({
    field: z.enum(FORTUNE_UNDERSTANDING_FIELDS),
    state: z.literal('CONFIRMED'),
    text: z.string().trim().min(1).max(200),
    source: z.enum(FORTUNE_UNDERSTANDING_SOURCES),
  })
  .strict();
const reviewedItemsBody = z.array(reviewedItemBody).min(1).max(FORTUNE_UNDERSTANDING_FIELDS.length);
const drawBody = z
  .object({
    theme: z.enum(FORTUNE_THEMES),
    consultation: z.string().trim().max(500).optional(),
    reviewedUnderstanding: reviewedItemsBody.optional(),
    paidReading: z.literal(true).optional(),
    intakeOutcome: z.enum(['REVIEWED', 'SKIPPED']).optional(),
  })
  .strict();
const intakeBody = z
  .object({
    theme: z.enum(FORTUNE_THEMES),
    consultation: z.string().trim().max(200),
    answers: z
      .array(
        z
          .object({
            key: z.enum(FORTUNE_INTAKE_KEYS),
            answer: z.string().trim().min(1).max(50).nullable(),
          })
          .strict(),
      )
      .max(FORTUNE_INTAKE_MAX_QUESTIONS),
  })
  .strict();
const notificationSlotBody = z
  .object({
    slot: z
      .object({ weekday: z.number().int().min(0).max(6), hour: z.number().int().min(0).max(23) })
      .strict()
      .nullable(),
  })
  .strict();
const understandingBody = z
  .object({
    revision: uuid.nullable(),
    profileRevision: z.string().datetime(),
    items: reviewedItemsBody,
  })
  .strict();
const reflectionBody = z.object({ answer: z.enum(FORTUNE_REFLECTION_ANSWERS).nullable() }).strict();
const personalFitBody = z
  .object({ rating: z.enum(FORTUNE_PERSONAL_FIT_RATINGS).nullable() })
  .strict();
const followUpBody = z
  .object({
    requestId: uuid,
    question: z.string().trim().min(1).max(300),
    expectedCreditCost: z.number().int().min(1).max(100_000).optional(),
  })
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
  const body: unknown = await request.json().catch(() => {
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

export const updateFortuneNotificationSlotResponse = (request: Request, serviceSlug: string) =>
  json(request, serviceSlug, async (actorUserId, parsedSlug) => {
    const { slot } = await requireJson(request, notificationSlotBody);
    const saved = await (
      await fortunePersonalProfileRepository()
    ).saveNotificationSlot({
      serviceSlug: parsedSlug,
      actorUserId,
      slot,
    });
    if (!saved) throw new ApplicationError('FORBIDDEN', '通知の曜日と時刻を変更できません。');
    return { saved };
  });

export const getFortuneUnderstandingResponse = (request: Request, serviceSlug: string) =>
  json(request, serviceSlug, async (actorUserId, parsedSlug) => {
    const snapshot = await (
      await fortuneUnderstandingRepository()
    ).read({
      serviceSlug: parsedSlug,
      actorUserId,
    });
    if (!snapshot) throw new ApplicationError('NOT_FOUND', '相談の保存内容を確認できません。');
    return snapshot;
  });

export const updateFortuneUnderstandingResponse = (request: Request, serviceSlug: string) =>
  json(request, serviceSlug, async (actorUserId, parsedSlug) => {
    const body = await requireJson(request, understandingBody);
    const items = parseFortuneReviewedItems(body.items);
    if (!items) throw new ApplicationError('VALIDATION_ERROR', '保存する項目を確認してください。');
    const actor = { serviceSlug: parsedSlug, actorUserId };
    const repository = await fortuneUnderstandingRepository();
    const result = await repository.save({
      ...actor,
      items,
      revision: body.revision,
      profileRevision: new Date(body.profileRevision),
    });
    if (result === 'CONFLICT')
      throw new ApplicationError(
        'CONFLICT',
        '保存設定が変更されました。ページを読み直してください。',
      );
    if (result === 'UNAVAILABLE')
      throw new ApplicationError('FORBIDDEN', '保存には個別化への同意が必要です。');
    return repository.read(actor);
  });

export const deleteFortuneUnderstandingResponse = (request: Request, serviceSlug: string) =>
  json(request, serviceSlug, async (actorUserId, parsedSlug) => {
    requireSameOrigin(request);
    const deleted = await (
      await fortuneUnderstandingRepository()
    ).delete({
      serviceSlug: parsedSlug,
      actorUserId,
    });
    if (!deleted) throw new ApplicationError('NOT_FOUND', '相談の保存内容を削除できません。');
    return { deleted };
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
      const reviewed = parseFortuneReviewedItems(body.reviewedUnderstanding);
      if (body.reviewedUnderstanding && (!reviewed || body.consultation !== undefined))
        throw new ApplicationError('VALIDATION_ERROR', '今回の相談内容を確認してください。');
      if (body.paidReading && !reviewed)
        throw new ApplicationError(
          'VALIDATION_ERROR',
          '深層鑑定に使う相談内容を確認してください。',
        );
      const consultation = reviewed
        ? fortuneUnderstandingConsultation(reviewed)
        : body.consultation;
      if (body.intakeOutcome && (body.intakeOutcome === 'REVIEWED') !== Boolean(reviewed))
        throw new ApplicationError('VALIDATION_ERROR', '今回の相談内容を確認してください。');
      if (!body.paidReading) await recordFortuneFunnel(parsedSlug, actorUserId, 'FREE_START');
      const result = await (
        await fortuneDailyReadingService()
      ).draw({
        serviceSlug: parsedSlug,
        actorUserId,
        theme: body.theme,
        ...(consultation ? { consultation } : {}),
        ...(reviewed ? { reviewedUnderstanding: reviewed } : {}),
        ...(body.paidReading ? { paidReading: true } : {}),
      });
      if (!body.paidReading && result.status === 'READY_BASIC')
        await recordFortuneFunnel(parsedSlug, actorUserId, 'FREE_COMPLETE');
      if (body.intakeOutcome)
        await recordFortuneIntakeProgress({
          serviceSlug: parsedSlug,
          actorUserId,
          outcome: body.intakeOutcome,
          localDate: result.localDate,
        });
      return result;
    },
    201,
  );

async function recordFortuneIntakeProgress(input: {
  serviceSlug: string;
  actorUserId: string;
  outcome?: 'REVIEWED' | 'SKIPPED';
  localDate?: string;
  questionsShown?: number;
}) {
  try {
    const db = await import('@bunshin/database');
    await new db.PrismaFortuneIntakeRepository(db.prisma).recordProgress(input);
  } catch {
    logger.warn('fortune intake progress could not be recorded');
  }
}

export const startFortuneIntakeResponse = (request: Request, serviceSlug: string) =>
  json(request, serviceSlug, async (actorUserId, parsedSlug) => {
    await recordFortuneIntakeProgress({ serviceSlug: parsedSlug, actorUserId });
    return { ok: true };
  });

export const nextFortuneIntakeResponse = (request: Request, serviceSlug: string) =>
  json(request, serviceSlug, async (actorUserId, parsedSlug) => {
    const body = await requireJson(request, intakeBody);
    const answered = body.answers.map(({ key }) => key);
    if (new Set(answered).size !== answered.length)
      throw new ApplicationError('VALIDATION_ERROR', '同じ質問への回答が重複しています。');
    const db = await import('@bunshin/database');
    const repo = new db.PrismaFortuneIntakeRepository(db.prisma);
    const actor = { serviceSlug: parsedSlug, actorUserId };
    const localDate = toJapanLocalDate(new Date());
    const recordQuestion = async () =>
      recordFortuneIntakeProgress({ ...actor, localDate, questionsShown: answered.length + 1 });
    const reservation = await repo.reserve({ ...actor, theme: body.theme, answered });
    if (reservation.kind !== 'RESERVED') {
      if (reservation.kind === 'QUESTION') await recordQuestion();
      return reservation;
    }
    const claim = { ...actor, id: reservation.id, profileRevision: reservation.profileRevision };
    const key = await selectFortuneIntakeQuestion({
      ...reservation,
      ...body,
      actorUserId,
      candidates: FORTUNE_INTAKE_KEYS.filter((question) => !answered.includes(question)),
      allowed: () => repo.allowed(claim),
    }).catch(() => null);
    const step = await repo.finish({ ...claim, key });
    if (step.kind === 'QUESTION') await recordQuestion();
    return step;
  });

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

export const updateFortuneReflectionResponse = (
  request: Request,
  serviceSlug: string,
  readingId: string,
) =>
  json(request, serviceSlug, async (actorUserId, parsedSlug) => {
    const body = await requireJson(request, reflectionBody);
    const db = await import('@bunshin/database');
    const saved = await new db.PrismaFortuneRepository(db.prisma).saveReflection({
      serviceSlug: parsedSlug,
      actorUserId,
      readingId: uuid.parse(readingId),
      answer: body.answer,
    });
    if (!saved) throw new ApplicationError('NOT_FOUND', '振り返りを保存できません。');
    return { saved };
  });

export const updateFortunePersonalFitResponse = (
  request: Request,
  serviceSlug: string,
  readingId: string,
) =>
  json(request, serviceSlug, async (actorUserId, parsedSlug) => {
    const { rating } = await requireJson(request, personalFitBody);
    const db = await import('@bunshin/database');
    const saved = await new db.PrismaFortuneRepository(db.prisma).savePersonalFit({
      serviceSlug: parsedSlug,
      actorUserId,
      readingId: uuid.parse(readingId),
      rating,
    });
    if (!saved) throw new ApplicationError('NOT_FOUND', '個別化の評価を保存できません。');
    return { saved };
  });

export const getFortuneFollowUpsResponse = (
  request: Request,
  serviceSlug: string,
  readingId: string,
) =>
  json(request, serviceSlug, async (actorUserId, parsedSlug) =>
    (await fortuneFollowUpRepository()).read({
      serviceSlug: parsedSlug,
      actorUserId,
      readingId: uuid.parse(readingId),
    }),
  );

export const askFortuneFollowUpResponse = (
  request: Request,
  serviceSlug: string,
  readingId: string,
) =>
  json(request, serviceSlug, async (actorUserId, parsedSlug) => {
    const body = await requireJson(request, followUpBody);
    return askFortuneFollowUp({
      requestId: body.requestId,
      question: body.question,
      ...(body.expectedCreditCost === undefined
        ? {}
        : { expectedCreditCost: body.expectedCreditCost }),
      serviceSlug: parsedSlug,
      actorUserId,
      readingId: uuid.parse(readingId),
    });
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
