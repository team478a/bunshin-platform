import type { AdminUserStage } from '@bunshin/application';

export const stageLabels: Record<AdminUserStage, string> = {
  REGISTERED: '登録',
  BUNSHIN_CREATED: 'BUNSHIN作成',
  SOCIAL_ACTIVATED: 'SNS利用開始',
  STRATEGY_APPROVED: '発信方針を決定',
  MISSION_VIEWED: '投稿案を確認',
  MISSION_ACCEPTED: '投稿案を採用',
  COPIED: '投稿文をコピー',
  POSTED: '投稿完了',
};

export function resolvePeriod(query: { from?: string; to?: string }) {
  const today = new Date();
  const defaultTo = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1),
  );
  const defaultFrom = new Date(defaultTo.getTime() - 30 * 86_400_000);
  const parse = (value: string | undefined, end: boolean) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) return null;
    return end ? new Date(date.getTime() + 86_400_000) : date;
  };
  const from = parse(query.from, false) ?? defaultFrom;
  const to = parse(query.to, true) ?? defaultTo;
  const valid = from < to && to.getTime() - from.getTime() <= 366 * 86_400_000;
  const finalFrom = valid ? from : defaultFrom;
  const finalTo = valid ? to : defaultTo;
  return {
    from: finalFrom,
    to: finalTo,
    fromInput: finalFrom.toISOString().slice(0, 10),
    toInput: new Date(finalTo.getTime() - 1).toISOString().slice(0, 10),
  };
}

export const percentage = (value: number, total: number) =>
  total === 0 ? '—' : `${((value / total) * 100).toFixed(1)}%`;

export const usd = (micros: number | null) =>
  micros === null ? '未集計' : `$${(micros / 1_000_000).toFixed(2)}`;

export const dateTime = (value: Date | null) =>
  value ? value.toLocaleString('ja-JP') : '利用記録なし';
