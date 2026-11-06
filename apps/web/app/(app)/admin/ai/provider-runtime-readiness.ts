export type ProviderRuntimeReadinessConfiguration = {
  status: 'DRAFT' | 'ACTIVE' | 'DISABLED' | 'ERROR';
  apiKeyConfigured: boolean;
  requestCostUsdMicros?: number;
  globallyPaused: boolean;
  lastVerifiedAt: string | null;
  lastErrorCategory: string | null;
};

export type ProviderRuntimeReadiness =
  | { ready: true; usageLabel: '使用中'; nextAction: '設定済みです' }
  | { ready: false; usageLabel: '停止中' | '使用不可（要修正）'; nextAction: string };

export function providerRuntimeReadiness(
  configuration: ProviderRuntimeReadinessConfiguration | undefined,
): ProviderRuntimeReadiness {
  if (!configuration?.apiKeyConfigured)
    return { ready: false, usageLabel: '停止中', nextAction: 'APIキーを登録する' };
  if ((configuration.requestCostUsdMicros ?? 0) <= 0)
    return {
      ready: false,
      usageLabel: configuration.status === 'ACTIVE' ? '使用不可（要修正）' : '停止中',
      nextAction: '正の予約額を設定した新しい設定を登録する',
    };
  if (configuration.lastVerifiedAt === null || configuration.lastErrorCategory !== null)
    return {
      ready: false,
      usageLabel: configuration.status === 'ACTIVE' ? '使用不可（要修正）' : '停止中',
      nextAction: '接続確認に成功した設定を使い始める',
    };
  if (configuration.status !== 'ACTIVE' || configuration.globallyPaused)
    return { ready: false, usageLabel: '停止中', nextAction: 'この設定を使い始める' };
  return { ready: true, usageLabel: '使用中', nextAction: '設定済みです' };
}
