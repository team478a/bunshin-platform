import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('external tracking HTTP module boundary', () => {
  it('keeps the public module as a compatibility export surface', () => {
    const barrel = source('src/http/external-tracking-links.ts');
    expect(barrel).toContain("from './external-tracking-configuration';");
    expect(barrel).toContain("from './external-tracking-csv';");
    expect(barrel).toContain("from './external-tracking-mutations';");
    expect(barrel).toContain("from './external-tracking-placements';");
    expect(barrel).not.toContain('async function');
  });

  it('keeps shared authorization and repository construction in one module', () => {
    const core = source('src/http/external-tracking-http-core.ts');
    expect(core).toContain('currentUserProvider');
    expect(core).toContain('PrismaExternalTrackingLinkRepository(undefined, serviceId)');
    expect(core).toContain('PrismaExternalLinkPlacementRepository');
  });

  it('separates CSV, mutation, and placement responsibilities', () => {
    const csv = source('src/http/external-tracking-csv.ts');
    const mutations = source('src/http/external-tracking-mutations.ts');
    const placements = source('src/http/external-tracking-placements.ts');
    expect(csv).toContain('parseExternalTrackingCsv');
    expect(csv).not.toContain('queueMemberTrackingLinkResultNotification');
    expect(mutations).toContain('queueMemberTrackingLinkResultNotification');
    expect(mutations).not.toContain('parseExternalTrackingCsv');
    expect(placements).toContain('ExternalLinkPlacementsResponse');
    expect(placements).not.toContain('ExternalTrackingCsvResponse');
  });
});
