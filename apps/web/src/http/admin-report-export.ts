import 'server-only';
import { ADMIN_USER_STAGES, GetAdminOperationsSnapshot } from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { currentUserProvider } from '../auth/current-user';
import { currentLineEnvironment } from '../line/secure-configuration';

const stageLabels = {
  REGISTERED: '登録',
  BUNSHIN_CREATED: 'BUNSHIN作成',
  SOCIAL_ACTIVATED: 'SNS利用開始',
  STRATEGY_APPROVED: '発信方針を決定',
  MISSION_VIEWED: '投稿案を確認',
  MISSION_ACCEPTED: '投稿案を採用',
  COPIED: '投稿文をコピー',
  POSTED: '投稿完了',
} as const;

function parseDate(value: string | null, end: boolean) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApplicationError('VALIDATION_ERROR', '日付を確認してください');
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ApplicationError('VALIDATION_ERROR', '日付を確認してください');
  }
  return end ? new Date(date.getTime() + 86_400_000) : date;
}

export function safeCsvCell(value: string | number | null): string {
  let text = value === null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""').replace(/[\r\n]+/g, ' ')}"`;
}

export function csv(rows: Array<Array<string | number | null>>) {
  return `\uFEFF${rows.map((row) => row.map(safeCsvCell).join(',')).join('\r\n')}\r\n`;
}

export async function adminReportExportResponse(request: Request) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const url = new URL(request.url);
    const fromInput = url.searchParams.get('from');
    const toInput = url.searchParams.get('to');
    const type = url.searchParams.get('type');
    if (type !== 'summary' && type !== 'users') {
      throw new ApplicationError('VALIDATION_ERROR', '出力形式を確認してください');
    }
    const from = parseDate(fromInput, false);
    const to = parseDate(toInput, true);
    const db = await import('@bunshin/database');
    const snapshot = await new GetAdminOperationsSnapshot(
      new db.PrismaAdminOperationsRepository(),
    ).execute({
      actorUserId: actor.userId,
      environment: currentLineEnvironment(),
      from,
      to,
      limit: type === 'users' ? 5_000 : 1,
    });

    const rows: Array<Array<string | number | null>> =
      type === 'summary'
        ? [
            ['項目', '値'],
            ['開始日', fromInput],
            ['終了日', toInput],
            ['全ユーザー', snapshot.totals.users],
            ['利用中ユーザー', snapshot.totals.activeUsers],
            ['新規登録', snapshot.totals.newUsers],
            ['投稿完了', snapshot.totals.posts],
            ['AI実行', snapshot.totals.aiCalls],
            ['AI失敗', snapshot.totals.aiFailedCalls],
            [
              'AI見積原価（USD）',
              snapshot.totals.estimatedAiCostUsdMicros === null
                ? null
                : (snapshot.totals.estimatedAiCostUsdMicros / 1_000_000).toFixed(6),
            ],
            ['LINE接続中', snapshot.totals.lineConnectedUsers],
            ['退会処理待ち', snapshot.totals.deletionPendingUsers],
            ['LINE送信成功', snapshot.totals.lineSent],
            ['LINE送信失敗', snapshot.totals.lineFailed],
            ['問い合わせ開始', snapshot.totals.supportCasesCreated],
            ['問い合わせ解決', snapshot.totals.supportCasesResolved],
            ['翌日継続の対象者', snapshot.retention.d1EligibleUsers],
            ['翌日継続ユーザー', snapshot.retention.d1ActiveUsers],
            [
              '翌日継続率',
              snapshot.retention.d1ActiveRate === null
                ? null
                : snapshot.retention.d1ActiveRate.toFixed(6),
            ],
            ['7日目継続の対象者', snapshot.retention.d7EligibleUsers],
            ['7日目継続ユーザー', snapshot.retention.d7ActiveUsers],
            [
              '7日目継続率',
              snapshot.retention.d7ActiveRate === null
                ? null
                : snapshot.retention.d7ActiveRate.toFixed(6),
            ],
            ...ADMIN_USER_STAGES.map((stage) => [
              `利用段階：${stageLabels[stage]}`,
              snapshot.funnel[stage],
            ]),
          ]
        : [
            [
              'ユーザーID',
              '表示名',
              'メール',
              '状態',
              '認証方法',
              '登録日時',
              '現在の段階',
              'BUNSHIN数',
              '投稿数',
              'AI実行',
              'AI失敗',
              'LINE接続',
              'LINE友だち状態',
              '退会処理待ち',
              '最終利用日時',
              '確認事項',
            ],
            ...snapshot.users.map((user) => [
              user.id,
              user.displayName,
              user.email,
              user.status,
              user.authProviders.join('・'),
              user.createdAt.toISOString(),
              stageLabels[user.stage],
              user.bunshinCount,
              user.postCount,
              user.aiCalls,
              user.aiFailedCalls,
              user.lineConnected ? 'はい' : 'いいえ',
              user.lineFollowing ? 'はい' : 'いいえ',
              user.deletionPending ? 'はい' : 'いいえ',
              user.lastActiveAt?.toISOString() ?? null,
              user.attentionReason,
            ]),
          ];
    const filename = `bunshin-${type}-${fromInput}-${toInput}.csv`;
    return new Response(csv(rows), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
