import type { ValidationMetricsSnapshot } from '@bunshin/application';

const DAY_MS = 24 * 60 * 60 * 1000;

function inputDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function parseDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || inputDate(date) !== value ? null : date;
}

export function resolveValidationPeriod(query: { from?: string; to?: string }, now = new Date()) {
  const today = new Date(`${inputDate(now)}T00:00:00.000Z`);
  const defaultFrom = new Date(today.getTime() - 29 * DAY_MS);
  const requestedFrom = parseDate(query.from);
  const requestedInclusiveTo = parseDate(query.to);
  const inclusiveTo = requestedInclusiveTo ?? today;
  const from = requestedFrom ?? defaultFrom;
  const to = new Date(inclusiveTo.getTime() + DAY_MS);
  if (from >= to || to.getTime() - from.getTime() > 366 * DAY_MS) {
    return {
      from: defaultFrom,
      to: new Date(today.getTime() + DAY_MS),
      fromInput: inputDate(defaultFrom),
      toInput: inputDate(today),
      usedFallback: true,
    };
  }
  return {
    from,
    to,
    fromInput: inputDate(from),
    toInput: inputDate(inclusiveTo),
    usedFallback: requestedFrom === null || requestedInclusiveTo === null,
  };
}

export function percentage(value: number | null) {
  return value === null ? '—' : `${(value * 100).toFixed(1)}%`;
}

export function funnelRows(metrics: ValidationMetricsSnapshot) {
  return [
    ['登録', metrics.funnel.registrations],
    ['Bunshin作成', metrics.funnel.bunshinCreations],
    ['SOCIAL有効化', metrics.funnel.socialActivations],
    ['戦略完成', metrics.funnel.strategyCompletions],
    ['戦略承認', metrics.funnel.strategyApprovals],
    ['最初のMission閲覧', metrics.funnel.firstMissionViews],
    ['Mission採用', metrics.funnel.missionAcceptances],
    ['コピー', metrics.funnel.copies],
    ['投稿', metrics.funnel.posts],
    ['D7 Active', metrics.funnel.d7ActiveUsers],
  ] as const;
}
