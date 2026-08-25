import type {
  AiProviderConfiguration,
  LineChannelConfiguration,
  LineOperationalAssessment,
  LineRichMenu,
} from '@bunshin/application';

export type OperationsWarningLevel = 'ACTION_REQUIRED' | 'CHECK';
export interface OperationsWarning {
  code: string;
  level: OperationsWarningLevel;
  title: string;
  guidance: string;
  href: '/admin/ai' | '/admin/line' | '/admin/guide';
}

const lineAlertText: Record<string, { title: string; guidance: string }> = {
  ACTIVE_CONFIGURATION_MISSING: {
    title: '使用中のLINE設定がありません',
    guidance: 'LINE設定を登録し、接続テスト後に使用中へ切り替えてください。',
  },
  ACTIVE_CONFIGURATION_UNVERIFIED: {
    title: 'LINE設定の接続確認が必要です',
    guidance: 'LINE設定画面で接続テストを行ってください。',
  },
  DELIVERY_GLOBALLY_PAUSED: {
    title: 'LINE通知が全体停止中です',
    guidance: '意図した停止か確認してください。再開する場合は新しい設定版を有効にします。',
  },
  DEAD_DELIVERY_JOBS: {
    title: '自動再実行できないLINE通知があります',
    guidance: 'LINE配信状況を確認し、安全を確認してから再実行してください。',
  },
  RETRY_SCHEDULED_DELIVERY_JOBS: {
    title: '再実行待ちのLINE通知があります',
    guidance: '一時的な障害であれば自動で再実行されます。件数が減るか確認してください。',
  },
};

export function operationsReadiness(input: {
  aiConfigurations: AiProviderConfiguration[];
  lineConfigurations: LineChannelConfiguration[];
  lineAssessment: LineOperationalAssessment;
  richMenus: LineRichMenu[];
  encryptionKeyReady: boolean;
  cronSecretReady: boolean;
  storageReady: boolean;
}) {
  const warnings: OperationsWarning[] = [];
  const activeOpenAi = input.aiConfigurations.find(
    (item) => item.provider === 'OPENAI' && item.status === 'ACTIVE',
  );
  if (!activeOpenAi)
    warnings.push({
      code: 'OPENAI_ACTIVE_MISSING',
      level: 'ACTION_REQUIRED',
      title: '使用中の文章作成AIがありません',
      guidance: 'OpenAI設定を登録し、接続テスト後に使用中へ切り替えてください。',
      href: '/admin/ai',
    });
  else if (activeOpenAi.globallyPaused)
    warnings.push({
      code: 'OPENAI_PAUSED',
      level: 'CHECK',
      title: '文章作成AIが全体停止中です',
      guidance: '意図した停止か確認してください。',
      href: '/admin/ai',
    });
  else if (!activeOpenAi.lastVerifiedAt || activeOpenAi.lastErrorCategory)
    warnings.push({
      code: 'OPENAI_UNVERIFIED',
      level: 'ACTION_REQUIRED',
      title: '文章作成AIの接続確認が必要です',
      guidance: 'AI設定画面で接続テストを行ってください。',
      href: '/admin/ai',
    });

  const activeTrendProvider = input.aiConfigurations.find(
    (item) =>
      ['GROK', 'EXA', 'FIRECRAWL'].includes(item.provider) &&
      item.status === 'ACTIVE' &&
      !item.globallyPaused,
  );
  if (!activeTrendProvider)
    warnings.push({
      code: 'TREND_PROVIDER_ACTIVE_MISSING',
      level: 'ACTION_REQUIRED',
      title: '使用中の話題調査サービスがありません',
      guidance: 'Grok、Exa、Firecrawlのいずれかを登録し、接続確認後に使用中へ切り替えてください。',
      href: '/admin/ai',
    });
  else if (!activeTrendProvider.lastVerifiedAt || activeTrendProvider.lastErrorCategory)
    warnings.push({
      code: 'TREND_PROVIDER_UNVERIFIED',
      level: 'ACTION_REQUIRED',
      title: '話題調査サービスの接続確認が必要です',
      guidance: 'AI設定画面で話題調査サービスの接続テストを行ってください。',
      href: '/admin/ai',
    });

  for (const alert of input.lineAssessment.alerts) {
    const known = lineAlertText[alert.code];
    warnings.push({
      code: alert.code,
      level: alert.severity === 'CRITICAL' ? 'ACTION_REQUIRED' : 'CHECK',
      title: known?.title ?? 'LINE配信で確認が必要です',
      guidance:
        known?.guidance ??
        `LINE設定画面で「${alert.code}」を確認してください${alert.count ? `（${alert.count}件）` : ''}。`,
      href: '/admin/line',
    });
  }

  if (!input.richMenus.some((item) => item.status === 'ACTIVE'))
    warnings.push({
      code: 'RICH_MENU_ACTIVE_MISSING',
      level: 'CHECK',
      title: '公開中のLINEメニューがありません',
      guidance: '必要な場合は画像を登録し、確認済みにしてから公開してください。',
      href: '/admin/line',
    });
  if (!input.encryptionKeyReady)
    warnings.push({
      code: 'ENCRYPTION_KEY_MISSING',
      level: 'ACTION_REQUIRED',
      title: '秘密情報を守る鍵がありません',
      guidance: '配備環境のENCRYPTION_KEYを設定してください。値は管理画面へ入力しません。',
      href: '/admin/guide',
    });
  if (!input.cronSecretReady)
    warnings.push({
      code: 'CRON_SECRET_MISSING',
      level: 'ACTION_REQUIRED',
      title: '定期処理を守る鍵がありません',
      guidance: '配備環境のCRON_SECRETを設定してください。',
      href: '/admin/guide',
    });
  if (!input.storageReady)
    warnings.push({
      code: 'STORAGE_CONFIGURATION_MISSING',
      level: 'ACTION_REQUIRED',
      title: '画像の保存先が準備されていません',
      guidance: 'Supabase URLとService Role Keyの初回設定を確認してください。',
      href: '/admin/guide',
    });

  const actionRequired = warnings.filter((item) => item.level === 'ACTION_REQUIRED').length;
  return {
    ready: actionRequired === 0,
    actionRequired,
    checkCount: warnings.length - actionRequired,
    warnings,
    activeLineVersion:
      input.lineConfigurations.find((item) => item.status === 'ACTIVE')?.version ?? null,
    activeRichMenuVersion:
      input.richMenus.find((item) => item.status === 'ACTIVE')?.version ?? null,
  };
}
