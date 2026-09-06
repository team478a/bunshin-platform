import { ApplicationError, toApiError } from '@bunshin/shared';

const knownFailures = [
  [
    'CONFLICT',
    'daily mission already exists',
    'ALREADY_EXISTS',
    'この日の投稿案は、すでに作成済みです。画面を更新します。',
  ],
  [
    'CONFLICT',
    'approved strategy is required',
    'STRATEGY_REQUIRED',
    '投稿内容の方針がまだ決まっていません。画面上部のかんたん設定を完了してください。',
  ],
  [
    'CONFLICT',
    'daily mission generation is in progress',
    'GENERATION_IN_PROGRESS',
    '投稿案を作成中です。少し待ってから、もう一度お試しください。',
  ],
  [
    'NOT_FOUND',
    'confirmed weekly plan item not found for date',
    'WEEKLY_PLAN_REQUIRED',
    '選んだ日の投稿予定がありません。1週間の予定を確定し、予定のある日を選んでください。',
  ],
] as const;

export function dailyMissionGenerationError(error: unknown, requestId: string) {
  const mapped = toApiError(error, requestId);
  const known =
    error instanceof ApplicationError
      ? knownFailures.find(([code, message]) => error.code === code && error.message === message)
      : undefined;
  return {
    ...mapped,
    body: {
      error: {
        ...mapped.body.error,
        ...(known ? { reason: known[2], message: known[3] } : {}),
      },
    },
  };
}
