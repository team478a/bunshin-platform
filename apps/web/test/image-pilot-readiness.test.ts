import { describe, expect, it } from 'vitest';
import { buildImagePilotReadiness } from '../app/(app)/admin/images/readiness-view-model';

const now = new Date('2026-08-30T00:00:00.000Z');
const readyInput = {
  now,
  pilot: {
    emergencyStop: false,
    startsAt: new Date('2026-08-29T00:00:00.000Z'),
    endsAt: new Date('2026-09-30T00:00:00.000Z'),
    dailyLimit: 10,
    monthlyLimit: 100,
    memberMonthlyLimit: 20,
  },
  enrolledCount: 3,
  provider: {
    apiKeyConfigured: true,
    lastVerifiedAt: new Date('2026-08-29T12:00:00.000Z'),
    globallyPaused: false,
    lastErrorCategory: null,
  },
  storageConfigured: true,
};

describe('image pilot readiness', () => {
  it('自動確認がすべてそろうと開始可能になる', () => {
    expect(buildImagePilotReadiness(readyInput)).toMatchObject({ ready: true, blockerCount: 0 });
  });

  it('緊急停止中は開始不可になる', () => {
    const value = buildImagePilotReadiness({
      ...readyInput,
      pilot: { ...readyInput.pilot, emergencyStop: true },
    });
    expect(value.ready).toBe(false);
    expect(value.items.find((item) => item.key === 'EMERGENCY_STOP')).toMatchObject({
      ready: false,
    });
  });

  it('期限切れ、参加者なし、未確認Providerを個別に示す', () => {
    const value = buildImagePilotReadiness({
      ...readyInput,
      pilot: { ...readyInput.pilot, endsAt: new Date('2026-08-29T00:00:00.000Z') },
      enrolledCount: 0,
      provider: { ...readyInput.provider, lastVerifiedAt: null },
    });
    expect(value.blockerCount).toBe(3);
    expect(value.items.filter((item) => !item.ready).map((item) => item.key)).toEqual([
      'OPENAI',
      'PERIOD',
      'ENROLLMENT',
    ]);
  });

  it('参加者上限がグループ月間上限を超える設定を拒否する', () => {
    const value = buildImagePilotReadiness({
      ...readyInput,
      pilot: { ...readyInput.pilot, monthlyLimit: 10, memberMonthlyLimit: 20 },
    });
    expect(value.items.find((item) => item.key === 'LIMITS')).toMatchObject({ ready: false });
  });
});
