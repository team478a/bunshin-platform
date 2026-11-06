export interface AiUsageCostRow {
  id: string;
  provider: string;
  taskType: string;
  model: string;
  status: 'SUCCESS' | 'FAILED';
  inputTokens: number | null;
  outputTokens: number | null;
  occurredAt: string;
}

export interface AiUsageCostGroup {
  key: string;
  provider: string;
  model: string;
  status: AiUsageCostRow['status'];
  rows: AiUsageCostRow[];
  canConfirmNoProviderCost: boolean;
}

export const NO_PROVIDER_CALL_PRICING_VERSION = 'no-provider-call-verified-v1';

export function canConfirmNoProviderCost(row: AiUsageCostRow) {
  return row.status === 'FAILED' && row.inputTokens === null && row.outputTokens === null;
}

export function groupUnknownAiUsageCosts(rows: readonly AiUsageCostRow[]): AiUsageCostGroup[] {
  const groups = new Map<string, AiUsageCostGroup>();
  for (const row of rows) {
    const key = [row.provider, row.model, row.status].join(':');
    const existing = groups.get(key);
    if (existing) {
      existing.rows.push(row);
      existing.canConfirmNoProviderCost =
        existing.canConfirmNoProviderCost && canConfirmNoProviderCost(row);
      continue;
    }
    groups.set(key, {
      key,
      provider: row.provider,
      model: row.model,
      status: row.status,
      rows: [row],
      canConfirmNoProviderCost: canConfirmNoProviderCost(row),
    });
  }
  return [...groups.values()];
}
