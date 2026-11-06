import { describe, expect, it } from 'vitest';
import { providerRuntimeReadiness } from '../app/(app)/admin/ai/provider-runtime-readiness';

const active = {
  status: 'ACTIVE' as const,
  apiKeyConfigured: true,
  requestCostUsdMicros: 10_000,
  globallyPaused: false,
  lastVerifiedAt: '2026-11-06T00:00:00.000Z',
  lastErrorCategory: null,
};

describe('providerRuntimeReadiness', () => {
  it('does not present a legacy active zero-cost configuration as usable', () => {
    expect(providerRuntimeReadiness({ ...active, requestCostUsdMicros: 0 })).toEqual({
      ready: false,
      usageLabel: '使用不可（要修正）',
      nextAction: '正の予約額を設定した新しい設定を登録する',
    });
  });

  it('requires verification, activation and an unpaused state', () => {
    expect(providerRuntimeReadiness({ ...active, lastVerifiedAt: null }).ready).toBe(false);
    expect(providerRuntimeReadiness({ ...active, status: 'DRAFT' }).ready).toBe(false);
    expect(providerRuntimeReadiness({ ...active, globallyPaused: true }).ready).toBe(false);
  });

  it('reports a fully valid runtime configuration as ready', () => {
    expect(providerRuntimeReadiness(active)).toEqual({
      ready: true,
      usageLabel: '使用中',
      nextAction: '設定済みです',
    });
  });
});
