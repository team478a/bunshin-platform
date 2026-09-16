import type { FortunePackageReleaseState } from '../services/service-creation-templates';

export type FortuneLicenseState = 'ACTIVE' | 'NOT_LICENSED' | 'SUSPENDED' | 'NOT_STARTED' | 'ENDED';

export type FortuneInventoryHealth =
  | 'LIVE'
  | 'READY'
  | 'PREPARING'
  | 'UPDATE_REQUIRED'
  | 'UNSUPPORTED_VERSION'
  | 'STOPPED'
  | 'ATTENTION';

export function fortuneLicenseState(
  entitlement: {
    fortunePackageEnabled: boolean;
    suspended: boolean;
    startsAt: Date | null;
    endsAt: Date | null;
  } | null,
  now = new Date(),
): FortuneLicenseState {
  if (!entitlement?.fortunePackageEnabled) return 'NOT_LICENSED';
  if (entitlement.suspended) return 'SUSPENDED';
  if (entitlement.startsAt && entitlement.startsAt > now) return 'NOT_STARTED';
  if (entitlement.endsAt && entitlement.endsAt <= now) return 'ENDED';
  return 'ACTIVE';
}

export function fortuneInventoryHealth(input: {
  organizationActive: boolean;
  projectActive: boolean;
  configured: boolean;
  enabled: boolean;
  readyCount: number;
  packageReleaseState: FortunePackageReleaseState;
}): FortuneInventoryHealth {
  if (!input.organizationActive || !input.projectActive) return 'STOPPED';
  if (input.packageReleaseState === 'UNSUPPORTED_NEWER') return 'UNSUPPORTED_VERSION';
  if (input.packageReleaseState === 'UPDATE_AVAILABLE') return 'UPDATE_REQUIRED';
  if (input.configured && input.packageReleaseState === 'NOT_SELECTED') return 'ATTENTION';
  if (input.enabled && input.readyCount < 5) return 'ATTENTION';
  if (input.enabled) return 'LIVE';
  if (input.configured && input.readyCount === 5) return 'READY';
  return 'PREPARING';
}

export const fortuneLicenseLabels: Record<FortuneLicenseState, string> = {
  ACTIVE: '契約有効',
  NOT_LICENSED: '未契約',
  SUSPENDED: '契約停止中',
  NOT_STARTED: '契約開始前',
  ENDED: '契約終了',
};

export const fortuneInventoryHealthLabels: Record<FortuneInventoryHealth, string> = {
  LIVE: '公開中',
  READY: '公開準備完了',
  PREPARING: '準備中',
  UPDATE_REQUIRED: '更新あり',
  UNSUPPORTED_VERSION: '版の確認が必要',
  STOPPED: '団体・プロジェクト停止中',
  ATTENTION: '公開条件を再確認',
};
