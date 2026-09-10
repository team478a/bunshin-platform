import type { MissionDecision } from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';
import { describe, expect, it } from 'vitest';
import { missionDecisionOrPending } from '../src/mission-decision-fallback';

const existingDecision: MissionDecision = {
  id: 'decision-1',
  workspaceId: 'workspace-1',
  bunshinId: 'bunshin-1',
  dailyMissionId: 'mission-1',
  decision: 'ACCEPTED',
  rejectionReason: null,
  rejectionDetail: null,
  decidedAt: new Date('2026-09-11T00:00:00Z'),
  createdAt: new Date('2026-09-11T00:00:00Z'),
  updatedAt: new Date('2026-09-11T00:00:00Z'),
};

describe('missionDecisionOrPending', () => {
  it('uses the stored decision when it exists', async () => {
    await expect(
      missionDecisionOrPending(() => Promise.resolve(existingDecision)),
    ).resolves.toEqual({
      decision: 'ACCEPTED',
      rejectionReason: null,
    });
  });

  it('treats a legacy mission without a decision row as pending', async () => {
    await expect(
      missionDecisionOrPending(() =>
        Promise.reject(new ApplicationError('NOT_FOUND', 'mission decision not found')),
      ),
    ).resolves.toEqual({ decision: 'PENDING', rejectionReason: null });
  });

  it('does not hide unrelated failures', async () => {
    const failure = new ApplicationError('INTERNAL_ERROR', 'database unavailable');
    await expect(missionDecisionOrPending(() => Promise.reject(failure))).rejects.toBe(failure);
  });
});
