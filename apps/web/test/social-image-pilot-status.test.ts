import { describe, expect, it } from 'vitest';
import {
  buildSocialImagePilotStatus,
  socialImagePilotApprovalChecks,
} from '../src/social-image-pilot-status';

const now = new Date('2026-08-30T10:00:00.000Z');
const pilot = { emergencyStop: false, startsAt: null, endsAt: null };
const approved = socialImagePilotApprovalChecks.map((checkKey) => ({
  checkKey,
  action: 'RECORDED' as const,
}));

describe('social image pilot effective status', () => {
  it('最終承認前は利用中と表示しない', () => {
    expect(buildSocialImagePilotStatus({ pilot, evidence: approved.slice(0, -1), now })).toEqual({
      state: 'PREPARING',
      label: '開始準備中',
      remainingChecks: 1,
    });
  });

  it('全確認が有効な場合だけ利用中と表示する', () => {
    expect(buildSocialImagePilotStatus({ pilot, evidence: approved, now })).toEqual({
      state: 'ACTIVE',
      label: '利用中',
      remainingChecks: 0,
    });
  });

  it('最終承認後の取消を開始準備中へ反映する', () => {
    expect(
      buildSocialImagePilotStatus({
        pilot,
        evidence: [...approved, { checkKey: 'MOBILE_E2E', action: 'REVOKED' }],
        now,
      }),
    ).toMatchObject({ state: 'PREPARING', remainingChecks: 1 });
  });

  it('緊急停止を最優先で表示する', () => {
    expect(
      buildSocialImagePilotStatus({
        pilot: { ...pilot, emergencyStop: true },
        evidence: approved,
        now,
      }),
    ).toMatchObject({ state: 'EMERGENCY_STOPPED', label: '緊急停止中' });
  });
});
