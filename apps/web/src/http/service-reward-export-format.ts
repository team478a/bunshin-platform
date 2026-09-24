import 'server-only';

export const displayName = (user: { displayName: string; email: string | null }) =>
  user.displayName || user.email || '参加者';

export const serviceRoleLabel = (role: string) =>
  role === 'SERVICE_OWNER'
    ? 'サービス所有者'
    : role === 'SERVICE_ADMIN'
      ? '運営管理者'
      : role === 'CONTENT_EDITOR'
        ? 'コンテンツ担当者'
        : '参加者';

export const timestamp = (value: Date | null) => value?.toISOString() ?? '';

export const jsonCell = (value: unknown) =>
  value === null || value === undefined ? '' : JSON.stringify(value);

export const pointAuditActionLabel = (action: string) =>
  action === 'POINT_RULES_UPDATED'
    ? 'ポイント獲得条件を変更'
    : action === 'POINT_BONUS_GRANTED'
      ? 'ボーナスポイントを付与'
      : action === 'POINT_BALANCE_CORRECTED'
        ? 'ポイント残高を訂正'
        : action === 'POINT_RECOVERY_REGISTERED'
          ? '誤付与ポイントを回収'
          : action === 'POINT_RECOVERY_CANCELLED'
            ? '誤付与ポイントの回収を取消'
            : action;

export const badgeAuditActionLabels: Record<string, string> = {
  GROUP_BADGE_CREATED_AND_SUBMITTED: 'バッジを作成',
  GROUP_BADGE_REVISED_BY_SERVICE_OPERATOR: 'バッジを編集',
  GROUP_BADGE_SUSPENDED_BY_SERVICE_OPERATOR: 'バッジを停止',
  GROUP_BADGE_REACTIVATED_BY_SERVICE_OPERATOR: 'バッジを再開',
  GROUP_BADGE_SUBMITTED: 'バッジを審査へ提出',
  GROUP_BADGE_APPROVED: 'バッジを承認',
  GROUP_BADGE_REJECTED: 'バッジを却下',
  GROUP_BADGE_CANDIDATE_NOMINATED: '参加者をバッジ候補に追加',
  BADGE_CANDIDATE_APPROVED: '参加者へバッジを付与',
  BADGE_CANDIDATE_REJECTED: 'バッジ候補を却下',
  BADGE_AWARD_REVOKED_BY_SERVICE_OPERATOR: 'バッジ付与を取り消し',
};
