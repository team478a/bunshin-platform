export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'INTERNAL_ERROR',
  'DATABASE_UNAVAILABLE',
  'CONFIGURATION_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export class ApplicationError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ApplicationError';
  }
}

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; requestId: string };
}

const PUBLIC_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_ERROR: '入力内容を確認してください。',
  UNAUTHENTICATED: '認証が必要です。',
  FORBIDDEN: 'この操作を行う権限がありません。',
  NOT_FOUND: '対象の情報を確認できませんでした。',
  CONFLICT: '現在の状態では操作を完了できません。',
  INTERNAL_ERROR: '処理を完了できませんでした。',
  DATABASE_UNAVAILABLE: '現在データを確認できません。',
  CONFIGURATION_ERROR: 'サービスの準備が完了していません。',
};

export function toApiError(
  error: unknown,
  requestId: string,
): { status: number; body: ApiErrorBody } {
  const code = error instanceof ApplicationError ? error.code : 'INTERNAL_ERROR';
  const statusByCode: Record<ErrorCode, number> = {
    VALIDATION_ERROR: 400,
    UNAUTHENTICATED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    DATABASE_UNAVAILABLE: 503,
    CONFIGURATION_ERROR: 503,
    INTERNAL_ERROR: 500,
  };
  return {
    status: statusByCode[code],
    body: { error: { code, message: PUBLIC_MESSAGES[code], requestId } },
  };
}
