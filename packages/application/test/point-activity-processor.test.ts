import { describe, expect, it, vi } from 'vitest';
import {
  ProcessPointActivityBatch,
  type PointActivityCandidate,
  type PointActivityProcessorRepository,
} from '../src/point-activity-processor';

const candidate: PointActivityCandidate = {
  workspaceId: 'workspace-1',
  actorUserId: 'user-1',
  eventType: 'MISSION_VIEWED',
  sourceEventId: 'activity-1',
  occurredAt: new Date('2026-08-29T00:00:00Z'),
};

describe('point activity processor', () => {
  it('processes candidates with the explicit timezone and reports outcomes', async () => {
    const listCandidates = vi
      .fn()
      .mockResolvedValue([candidate, { ...candidate, sourceEventId: '2' }]);
    const process = vi
      .fn()
      .mockResolvedValueOnce('GRANTED')
      .mockResolvedValueOnce('ALREADY_PROCESSED');
    const repository: PointActivityProcessorRepository = { listCandidates, process };
    await expect(new ProcessPointActivityBatch(repository).execute()).resolves.toEqual({
      scanned: 2,
      GRANTED: 1,
      ALREADY_PROCESSED: 1,
      NO_ACTIVE_RULE: 0,
      NOT_ELIGIBLE: 0,
    });
    expect(process).toHaveBeenCalledWith(expect.objectContaining({ timezone: 'Asia/Tokyo' }));
  });

  it('rejects unsafe batch sizes and invalid timezone values', async () => {
    const repository: PointActivityProcessorRepository = {
      listCandidates: vi.fn(),
      process: vi.fn(),
    };
    await expect(
      new ProcessPointActivityBatch(repository).execute({ limit: 0 }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      new ProcessPointActivityBatch(repository).execute({ timezone: 'not/a-zone' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
