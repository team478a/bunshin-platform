import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { ServiceImprovementReadRequest } from '@bunshin/application';
import { PrismaServiceImprovementOverviewReader } from '../src/service-improvement-overview';
import {
  PrismaSocialProgressImprovementAdapter,
  PrismaTrainingProgressImprovementAdapter,
} from '../src/service-improvement-progress';
import { PrismaImprovementFeedbackObservationAdapter } from '../src/improvement-feedback-observation-adapter';
import { PrismaSocialSupportBehaviorAdapter } from '../src/social-support-behavior-adapter';
import { PrismaHassySupportImprovementAdapter } from '../src/hassy-improvement-support-adapter';
import { PrismaHassyPhotoQualityImprovementAdapter } from '../src/hassy-improvement-photo-quality-adapter';

const input: ServiceImprovementReadRequest = {
  actorUserId: 'admin',
  scope: {
    tenantRef: 'tenant',
    workspaceId: 'workspace',
    serviceId: 'service',
    environment: 'DEVELOPMENT',
  },
  fromInclusive: new Date('2026-09-01Z'),
  toExclusive: new Date('2026-10-01Z'),
  limit: 100,
};
function setup() {
  const adapters = [
    PrismaSocialProgressImprovementAdapter,
    PrismaImprovementFeedbackObservationAdapter,
    PrismaHassySupportImprovementAdapter,
    PrismaHassyPhotoQualityImprovementAdapter,
    PrismaSocialSupportBehaviorAdapter,
    PrismaTrainingProgressImprovementAdapter,
  ];
  const reads = adapters.map((adapter) =>
    vi.spyOn(adapter.prototype, 'readObservations').mockResolvedValue({
      observations: [],
      coverage: { completeness: 'COMPLETE', missingCount: 0, truncated: false },
    }),
  );
  const collection = {
    observations: [],
    coverage: { completeness: 'COMPLETE' as const, missingCount: 0, truncated: false },
  };
  const exposure = vi
    .spyOn(PrismaHassySupportImprovementAdapter.prototype, 'readPairedObservations')
    .mockResolvedValue({ outcomes: collection, exposure: collection });
  const client = {} as PrismaClient; // Every source is mocked; no default/real connection.
  return {
    exposure,
    reads,
    reader: new PrismaServiceImprovementOverviewReader(client, input.scope),
  };
}
afterEach(() => vi.restoreAllMocks());
describe('explicit service overview composition', () => {
  it('reuses feedback, support and photo readers for SOCIAL without TRAINING reads', async () => {
    const s = setup();
    const result = await s.reader.read(input, 'SOCIAL');
    expect(result.sections).toHaveLength(6);
    expect(
      result.sections.every(
        (section) => section.visibility === 'WITHHELD' && section.observedRecords === null,
      ),
    ).toBe(true);
    for (const read of s.reads.slice(0, 5).filter((_, index) => index !== 2))
      expect(read).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: 'admin',
          scope: expect.objectContaining({ ...input.scope, packageKey: 'SOCIAL' }),
          subject: null,
          limit: 100,
        }),
      );
    expect(s.exposure).toHaveBeenCalledOnce();
    expect(s.reads[5]).not.toHaveBeenCalled();
  });
  it('reads TRAINING without SOCIAL sources and without inventing successful learning', async () => {
    const s = setup();
    const result = await s.reader.read(input, 'TRAINING');
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]?.adapterKey).toBe('TRAINING_PROGRESS');
    for (const read of s.reads.slice(0, 5)) expect(read).not.toHaveBeenCalled();
    expect(s.exposure).not.toHaveBeenCalled();
    expect(s.reads[5]).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain('PASS');
  });
  it('rejects another service or unsupported package before any source read', async () => {
    const s = setup();
    await expect(
      s.reader.read({ ...input, scope: { ...input.scope, serviceId: 'other' } }, 'SOCIAL'),
    ).rejects.toBeDefined();
    await expect(s.reader.read(input, 'OTHER' as 'SOCIAL')).rejects.toBeDefined();
    for (const read of s.reads) expect(read).not.toHaveBeenCalled();
  });
  it('propagates a reused source failure instead of a misleading partial success', async () => {
    const s = setup();
    s.reads[1]!.mockRejectedValue(new Error('source failed'));
    await expect(s.reader.read(input, 'SOCIAL')).rejects.toThrow('source failed');
    expect(s.reads[2]).not.toHaveBeenCalled();
  });
});
