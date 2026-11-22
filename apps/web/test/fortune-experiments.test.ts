import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@bunshin/database';
import {
  changeFortuneInterest,
  saveFortuneExperiment,
  saveFortuneHypothesis,
  saveFortuneInterestStatus,
} from '../src/fortune/experiments';

const scope = { workspaceId: 'workspace', groupId: 'service' };
const id = 'adbd8a53-89a4-4a50-bdd0-230579ab7218';

describe('fortune experiments', () => {
  const updateMany = vi.fn();
  const deleteMany = vi.fn();
  const db = {
    fortuneProductInterest: { updateMany, deleteMany },
  } as unknown as PrismaClient;

  beforeEach(() => {
    vi.clearAllMocks();
    updateMany.mockResolvedValue({ count: 0 });
  });

  it('changes applicant status only in the managed service', async () => {
    await expect(
      saveFortuneInterestStatus(db, scope, { id, status: 'CONTACTED' }),
    ).rejects.toThrow();
    expect(updateMany).toHaveBeenCalledWith({
      where: { ...scope, id },
      data: { status: 'CONTACTED' },
    });
  });

  it('allows withdrawing only the signed-in member’s interest', async () => {
    await changeFortuneInterest(
      db,
      { ...scope, memberUserId: 'reader' },
      { id, interested: false },
    );
    expect(deleteMany).toHaveBeenCalledWith({
      where: { ...scope, memberUserId: 'reader', hypothesisId: id },
    });
  });

  it('rejects unsafe outbound URLs and reversed experiment dates before persistence', async () => {
    await expect(
      saveFortuneHypothesis(db, scope, {
        kind: 'ACCESSORIES',
        name: 'Accessory',
        description: 'Interest only',
        proposedPriceYen: 9800,
        externalUrl: 'javascript:alert(1)',
        published: true,
      }),
    ).rejects.toThrow();
    await expect(
      saveFortuneExperiment(db, scope, {
        title: 'Campaign',
        productLabel: 'Reading',
        startsOn: '2026-11-23',
        endsOn: '2026-11-22',
        channel: 'newsletter',
        evidence: {
          lpVersion: 'v1',
          changes: '',
          observed: '',
          next: '',
          evaluation: 'PLANNED',
        },
      }),
    ).rejects.toThrow();
  });
});
