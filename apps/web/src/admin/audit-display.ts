import type { AdminAuditCategory } from '@bunshin/application';

export const auditCategoryLabels: Record<AdminAuditCategory, string> = {
  ADMIN_ACCESS: '管理者と権限',
  USER_OPERATION: 'ユーザー操作',
  AI_CONFIGURATION: 'AI設定',
  LINE_CONFIGURATION: 'LINE設定',
  LINE_RICH_MENU: 'LINEメニュー',
  ACCOUNT_DELETION: '退会処理',
};

const actionLabels: Record<string, string> = {
  GRANTED: '管理者に追加',
  ROLE_CHANGED: '役割を変更',
  REACTIVATED: '利用を再開',
  REVOKED: '権限を停止',
  SUSPENDED: '利用を停止',
  CREATE_VERSION: '新しい版を作成',
  CREATE_DRAFT: '下書きを作成',
  CONNECTION_TEST: '接続を確認',
  VERIFY: '内容を確認',
  ACTIVATE: '使用を開始',
  PAUSE: '一時停止',
  DISABLE: '使用を停止',
  RETRY_BLOCKED: '退会処理を保留',
  CLAIMED: '処理を開始',
  COMPLETED: '処理を完了',
  RETRY_SCHEDULED: '再試行を予約',
  CANCELLED: '処理を取消',
};

export const auditActionLabel = (action: string) => actionLabels[action] ?? 'その他の操作';
