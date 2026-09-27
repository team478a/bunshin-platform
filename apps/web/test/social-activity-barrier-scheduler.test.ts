import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../src/http/mission-scheduler.ts', import.meta.url), 'utf8');

describe('social activity barrier scheduler boundary', () => {
  it('connects the scoped daily projection to the existing scheduler', () => {
    expect(source).toContain('RunSocialActivityBarrierProjectionBatch');
    expect(source).toContain('PrismaSocialActivityBarrierProjectionCandidateRepository');
    expect(source).toContain('PrismaSocialActivityBarrierObservationRepository');
    expect(source).toContain('PrismaSocialActivityBarrierCaseRepository');
    expect(source).toContain('socialActivityBarriers: socialActivityBarrierResult');
  });
});
