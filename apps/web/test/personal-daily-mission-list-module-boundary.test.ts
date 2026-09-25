import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (file: string) =>
  readFileSync(new URL(`../app/(app)/bunshins/[bunshinId]/${file}`, import.meta.url), 'utf8');

describe('personal daily mission list module boundary', () => {
  it('delegates list, detail, and accepted states through focused components', () => {
    const list = source('personal-daily-mission-list.tsx');
    const card = source('personal-daily-mission-card.tsx');
    const detail = source('personal-daily-mission-detail.tsx');

    expect(list).toContain('<PersonalDailyMissionCard');
    expect(card).toContain('<PersonalDailyMissionDetail');
    expect(detail).toContain('<PersonalDailyMissionAccepted');
  });

  it('keeps server mutations in the controller', () => {
    for (const file of [
      'personal-daily-mission-list.tsx',
      'personal-daily-mission-card.tsx',
      'personal-daily-mission-detail.tsx',
      'personal-daily-mission-accepted.tsx',
    ]) {
      const view = source(file);
      expect(view).not.toContain('fetch(');
      expect(view).not.toContain('/api/');
    }

    expect(source('personal-daily-mission-controller.ts')).toContain('fetch(');
  });
});
