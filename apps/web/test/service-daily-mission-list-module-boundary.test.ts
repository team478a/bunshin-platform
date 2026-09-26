import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) =>
  readFileSync(
    new URL(`../app/s/[serviceSlug]/bunshins/[bunshinId]/${file}`, import.meta.url),
    'utf8',
  );

describe('service daily mission list module boundary', () => {
  it('keeps the list focused on mission composition', () => {
    const list = read('service-daily-mission-list.tsx');

    expect(list).toContain('<ServiceDailyMissionCard');
    expect(list).not.toContain('mission-variant-actions');
    expect(list).not.toContain('mission-business-outcomes');
    expect(list).not.toContain('mission-manual-image-flow');
  });

  it('separates card, detail, image guide, and accepted-result responsibilities', () => {
    const card = read('service-daily-mission-card.tsx');
    const detail = read('service-daily-mission-detail.tsx');
    const imageGuide = read('service-daily-mission-image-guide.tsx');
    const accepted = read('service-daily-mission-accepted.tsx');

    expect(card).toContain('<ServiceDailyMissionImageGuide');
    expect(card).toContain('<ServiceDailyMissionDetail');
    expect(detail).toContain('<ServiceDailyMissionAccepted');
    expect(imageGuide).toContain('mission-manual-image-flow');
    expect(accepted).toContain('mission-business-outcomes');
  });
});
