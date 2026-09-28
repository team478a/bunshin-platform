export type GroupMemberLineStatusKey =
  | 'READY'
  | 'MEMBERSHIP_INACTIVE'
  | 'MEMBERSHIP_CONSENT_MISSING'
  | 'USER_INACTIVE'
  | 'SERVICE_DISABLED'
  | 'SERVICE_CONFIGURATION_UNAVAILABLE'
  | 'SERVICE_PAUSED'
  | 'CONNECTION_MISSING'
  | 'CONNECTION_INACTIVE'
  | 'NOTIFICATION_CONSENT_MISSING'
  | 'NOT_FOLLOWING';

export interface GroupMemberLineStatus {
  key: GroupMemberLineStatusKey;
  ready: boolean;
  label: string;
  description: string;
}

export interface GroupMemberLineStatusInput {
  membershipStatus: string;
  membershipConsentedAt: Date | null;
  userStatus: string;
  mode: 'SHARED' | 'DEDICATED' | 'DISABLED';
  dedicatedPilotEnabled: boolean;
  configurationReady: boolean;
  globallyPaused: boolean;
  connection: {
    status: string;
    friendshipStatus: string;
    notificationConsentAt: Date | null;
  } | null;
}

const status = (
  key: GroupMemberLineStatusKey,
  label: string,
  description: string,
): GroupMemberLineStatus => ({ key, ready: key === 'READY', label, description });

export function resolveGroupMemberLineStatus(
  input: GroupMemberLineStatusInput,
): GroupMemberLineStatus {
  if (input.membershipStatus !== 'ACTIVE')
    return status(
      'MEMBERSHIP_INACTIVE',
      '参加状態を確認',
      'サービスの利用状態が「利用中」ではないため、LINE配信の対象外です。',
    );
  if (!input.membershipConsentedAt)
    return status(
      'MEMBERSHIP_CONSENT_MISSING',
      'サービス同意を確認',
      'サービスへの参加同意が記録されていないため、LINE配信の対象外です。',
    );
  if (input.userStatus !== 'ACTIVE')
    return status(
      'USER_INACTIVE',
      'アカウント状態を確認',
      'アカウントが利用中ではないため、LINE配信の対象外です。',
    );
  if (input.mode === 'DISABLED')
    return status(
      'SERVICE_DISABLED',
      'LINEを使用していません',
      'このサービスではLINE配信が停止されています。',
    );
  if (!input.configurationReady || (input.mode === 'DEDICATED' && !input.dedicatedPilotEnabled))
    return status(
      'SERVICE_CONFIGURATION_UNAVAILABLE',
      'LINE設定を確認',
      '現在使用できるLINE設定がないため、配信できません。',
    );
  if (input.globallyPaused)
    return status(
      'SERVICE_PAUSED',
      'LINE配信を停止中',
      'LINE設定はありますが、サービス全体の配信が停止されています。',
    );
  if (!input.connection)
    return status(
      'CONNECTION_MISSING',
      'LINE未接続',
      'このサービスで使うLINEとの接続が完了していません。本人にLINE接続をご案内ください。',
    );
  if (input.connection.status !== 'ACTIVE')
    return status(
      'CONNECTION_INACTIVE',
      'LINE接続を確認',
      '保存されているLINE接続が利用中ではありません。本人に再接続をご案内ください。',
    );
  if (!input.connection.notificationConsentAt)
    return status(
      'NOTIFICATION_CONSENT_MISSING',
      '通知への同意が必要',
      'LINE通知への同意が確認できません。本人にお知らせ設定の完了をご案内ください。',
    );
  if (input.connection.friendshipStatus !== 'FOLLOWING')
    return status(
      'NOT_FOLLOWING',
      '友だち状態を確認',
      '公式LINEの友だち追加を確認できません。ブロック解除または友だち追加をご案内ください。',
    );
  return status('READY', 'LINE配信対象', 'LINE接続、通知同意、友だち追加が確認できています。');
}
