import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('mission repository module boundaries', () => {
  it('keeps the daily mission public repository as a compatibility facade', () => {
    const facade = source('../src/daily-missions.ts');
    expect(facade).toContain('PrismaDailyMissionCreationRepository');
    expect(facade).toContain('PrismaDailyMissionAccessRepository');
    expect(facade).not.toContain('$transaction');
  });

  it('separates content pillars from weekly plans', () => {
    const barrel = source('../src/mission-planning.ts');
    expect(barrel).toContain("from './content-pillar-repository'");
    expect(barrel).toContain("from './weekly-plan-repository'");
    expect(barrel).not.toContain('export class');
  });

  it('separates engagement, badges, and outcomes', () => {
    const barrel = source('../src/mission-progress.ts');
    expect(barrel).toContain("from './mission-engagement-repository'");
    expect(barrel).toContain("from './achievement-badge-repository'");
    expect(barrel).toContain("from './mission-outcome-repository'");
    expect(barrel).not.toContain('export class');
  });
});
