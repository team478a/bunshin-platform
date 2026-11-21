import { expect, it } from 'vitest';
import { fortuneLineMenuKind } from '../src/line/rich-menu-layout';

it('limits the Oracle artwork to the owned Fortune service', () => {
  const onboarding = { fortunePackage: { key: 'FORTUNE_DAILY_GUIDANCE', version: 2 } };
  expect(fortuneLineMenuKind('watashi-fortune', onboarding)).toBe('ORACLE');
  expect(fortuneLineMenuKind('other-fortune', onboarding)).toBe('FORTUNE');
  expect(fortuneLineMenuKind('watashi-fortune', {})).toBeUndefined();
  expect(fortuneLineMenuKind('posting', {})).toBeUndefined();
});
