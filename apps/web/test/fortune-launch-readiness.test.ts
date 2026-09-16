import { describe, expect, it } from 'vitest';
import { buildFortuneLaunchSteps, isFortuneLineReady } from '../src/fortune/launch-readiness';
import type { FortuneOperatorStatus } from '../src/fortune/operator';

const status = (override: Partial<FortuneOperatorStatus> = {}): FortuneOperatorStatus => ({
  configured: true,
  enabled: false,
  aiEnabled: false,
  weeklyNotificationEnabled: false,
  weeklyNotificationDay: 3,
  weeklyNotificationHour: 19,
  timeZone: 'Asia/Tokyo',
  bunshinId: 'bunshin-1',
  approvedVersion: 1,
  approvedMeaningCount: 468,
  requiredMeaningCount: 468,
  termsReady: true,
  privacyReady: true,
  brandReady: true,
  lineReady: true,
  bunshinReady: true,
  canEnable: true,
  bunshins: [{ id: 'bunshin-1', name: '占い案内パートナー' }],
  ...override,
});

describe('fortune launch readiness', () => {
  it('keeps every package launch requirement visible in a stable order', () => {
    const steps = buildFortuneLaunchSteps('daily-fortune', status());
    expect(steps.map(({ key }) => key)).toEqual([
      'PACKAGE',
      'SERVICE_INFO',
      'TERMS',
      'PRIVACY',
      'LINE',
    ]);
    expect(steps.every(({ ready }) => ready)).toBe(true);
  });

  it('links each incomplete requirement to the screen where it can be completed', () => {
    const steps = buildFortuneLaunchSteps(
      'daily-fortune',
      status({ brandReady: false, termsReady: false, privacyReady: false, lineReady: false }),
    );
    expect(steps.filter(({ ready }) => !ready).map(({ href }) => href)).toEqual([
      '/s/daily-fortune/manage/settings',
      '/s/daily-fortune/manage/legal',
      '/s/daily-fortune/manage/legal',
      '/s/daily-fortune/manage/line',
    ]);
  });

  it('does not treat partial package data as installed', () => {
    const [packageStep] = buildFortuneLaunchSteps(
      'daily-fortune',
      status({ approvedMeaningCount: 467 }),
    );
    expect(packageStep?.ready).toBe(false);
  });

  it('accepts a verified shared LINE and rejects a stopped shared LINE', () => {
    const input = {
      registrationLineEnabled: true,
      mode: 'SHARED' as const,
      sharedLineReadyCount: 1,
      dedicatedPilotEnabled: false,
      dedicatedLastVerifiedAt: null,
      dedicatedLastErrorCategory: null,
      dedicatedGloballyPaused: true,
    };
    expect(isFortuneLineReady(input)).toBe(true);
    expect(isFortuneLineReady({ ...input, sharedLineReadyCount: 0 })).toBe(false);
  });

  it('requires every dedicated LINE safety condition', () => {
    const input = {
      registrationLineEnabled: true,
      mode: 'DEDICATED' as const,
      sharedLineReadyCount: 0,
      dedicatedPilotEnabled: true,
      dedicatedLastVerifiedAt: new Date('2026-09-16T00:00:00Z'),
      dedicatedLastErrorCategory: null,
      dedicatedGloballyPaused: false,
    };
    expect(isFortuneLineReady(input)).toBe(true);
    expect(isFortuneLineReady({ ...input, dedicatedPilotEnabled: false })).toBe(false);
    expect(isFortuneLineReady({ ...input, dedicatedLastErrorCategory: 'TOKEN' })).toBe(false);
    expect(isFortuneLineReady({ ...input, dedicatedGloballyPaused: true })).toBe(false);
  });
});
