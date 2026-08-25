export type ProductionGateStatus = 'READY' | 'ACTION_REQUIRED' | 'MANUAL_CHECK';

export interface ProductionGateItem {
  code: string;
  title: string;
  status: ProductionGateStatus;
  guidance: string;
  href:
    | '/admin'
    | '/admin/ai'
    | '/admin/legal'
    | '/admin/deletions'
    | '/admin/guide'
    | '/admin/production-gate';
}

export function productionGateChecklist(input: {
  environment: 'development' | 'staging' | 'production';
  operationsReady: boolean;
  legalReady: boolean;
  authReady: boolean;
  trendResearchReady: boolean;
  accountDeletionMode: 'disabled' | 'dry-run' | 'enabled';
  accountDeletionApproved: boolean;
  recordedManualChecks?: ReadonlySet<string>;
}) {
  const manualStatus = (key: string): ProductionGateStatus =>
    input.recordedManualChecks?.has(key) ? 'READY' : 'MANUAL_CHECK';
  const automatic: ProductionGateItem[] = [
    {
      code: 'PRODUCTION_ENVIRONMENT',
      title: '本番環境で確認している',
      status: input.environment === 'production' ? 'READY' : 'ACTION_REQUIRED',
      guidance:
        input.environment === 'production'
          ? '現在の画面は本番環境です。'
          : 'この画面は本番環境ではありません。本番URLの管理画面で確認してください。',
      href: '/admin',
    },
    {
      code: 'OPERATIONS_CONFIGURATION',
      title: 'AI・LINE・定期処理の必須設定',
      status: input.operationsReady ? 'READY' : 'ACTION_REQUIRED',
      guidance: input.operationsReady
        ? '管理画面で自動確認できる必須設定はそろっています。'
        : '運用設定トップの「対応が必要」を上から確認してください。',
      href: '/admin',
    },
    {
      code: 'LEGAL_DOCUMENTS',
      title: '利用規約とプライバシーの公開',
      status: input.legalReady ? 'READY' : 'ACTION_REQUIRED',
      guidance: input.legalReady
        ? '利用規約とプライバシーは公開済みです。'
        : '利用規約とプライバシーの両方を公開してください。',
      href: '/admin/legal',
    },
    {
      code: 'AUTH_ADMINISTRATION',
      title: '退会時の認証情報削除設定',
      status: input.authReady ? 'READY' : 'ACTION_REQUIRED',
      guidance: input.authReady
        ? '認証情報を安全に削除するための設定があります。'
        : 'Supabase Auth管理用の本番設定を確認してください。値は管理画面へ入力しません。',
      href: '/admin/deletions',
    },
    {
      code: 'TREND_RESEARCH_CONFIGURATION',
      title: '話題調査サービスの本番設定',
      status: input.trendResearchReady ? 'READY' : 'ACTION_REQUIRED',
      guidance: input.trendResearchReady
        ? '接続確認済みの話題調査サービスが使用中です。'
        : 'Grok、Exa、Firecrawlのいずれかを登録し、接続確認後に使用中へ切り替えてください。',
      href: '/admin/ai',
    },
    {
      code: 'ACCOUNT_DELETION_EXECUTION',
      title: '退会処理の実行モード',
      status:
        input.accountDeletionMode === 'enabled' && input.accountDeletionApproved
          ? 'READY'
          : 'ACTION_REQUIRED',
      guidance:
        input.accountDeletionMode === 'disabled'
          ? '退会処理は停止中です。まずdry-runを実施し、承認後に本番実行を有効にしてください。'
          : input.accountDeletionMode === 'dry-run'
            ? 'dry-run中です。結果を確認し、責任者の承認後に本番実行へ切り替えてください。'
            : input.accountDeletionApproved
              ? '本番実行が明示承認されています。'
              : '本番実行の明示承認がありません。',
      href: '/admin/deletions',
    },
  ];

  const manual: ProductionGateItem[] = [
    {
      code: 'BACKUP_RESTORE_REHEARSAL',
      title: 'バックアップから戻す練習',
      status: manualStatus('BACKUP_RESTORE'),
      guidance: 'Supabaseのバックアップ状態を確認し、復元練習の日時・担当者・結果を記録します。',
      href: '/admin/guide',
    },
    {
      code: 'PRODUCTION_MIGRATION_AND_HEALTH',
      title: '最新Migrationと本番Health確認',
      status: manualStatus('MIGRATION_HEALTH'),
      guidance: '最新mainのMigration workflowとHealth Smokeが成功したRunを記録します。',
      href: '/admin/guide',
    },
    {
      code: 'AUTH_SMOKE',
      title: '本番ログイン・ログアウト確認',
      status: manualStatus('AUTH_SMOKE'),
      guidance: 'LINEとメールでログインし、ログアウト後に保護画面へ戻れないことを確認します。',
      href: '/admin/guide',
    },
    {
      code: 'FREE_MVP_SMOKE',
      title: 'スマートフォンで初回投稿まで確認',
      status: manualStatus('FREE_MVP_SMOKE'),
      guidance: '分身作成から投稿完了・感想の保存まで、本番テスト利用者で一度通します。',
      href: '/admin/guide',
    },
    {
      code: 'ACCOUNT_DELETION_DRY_RUN',
      title: '退会処理の予行練習',
      status: manualStatus('ACCOUNT_DELETION_DRY_RUN'),
      guidance: '本番データを削除しないdry-runの結果と、問題がないことを記録します。',
      href: '/admin/guide',
    },
    {
      code: 'LINE_GO_NO_GO',
      title: 'LINE本番開始確認',
      status: manualStatus('LINE_GO_NO_GO'),
      guidance: 'Webhook疎通、通知同意、上限、緊急停止、Go/No-Go workflowを確認します。',
      href: '/admin/guide',
    },
    {
      code: 'TREND_RESEARCH_SMOKE',
      title: '本番データで話題調査を確認',
      status: manualStatus('TREND_RESEARCH_SMOKE'),
      guidance:
        '週次調査を1回実行し、出典、候補、期限、Missionへの反映、設定原価が正しいことを確認します。',
      href: '/admin/guide',
    },
    {
      code: 'HUMAN_APPROVAL',
      title: '責任者の最終承認',
      status: manualStatus('FINAL_APPROVAL'),
      guidance: '対象commit、日時、担当者、確認結果を記録してから利用者募集を開始します。',
      href: '/admin/guide',
    },
  ];

  return {
    automatic,
    manual,
    automaticReady: automatic.every((item) => item.status === 'READY'),
    actionRequired: automatic.filter((item) => item.status === 'ACTION_REQUIRED').length,
    launchReady:
      automatic.every((item) => item.status === 'READY') &&
      manual.every((item) => item.status === 'READY'),
  };
}
