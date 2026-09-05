import { describe, expect, it, vi } from 'vitest';
import { PrismaPersonalityLearningCandidateRepository } from '../src';

const version = {
  id: 'version-1',
  version: 1,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  tone: 'やさしい',
  formality: 'ふつう',
  energyLevel: '静か',
  expertiseLevel: '初心者向け',
  sentenceStyle: '短文',
  firstPerson: 'わたし',
  forbiddenExpressions: [],
  preferredExpressions: [],
  visualDirection: null,
  facePolicy: 'FULL_ANONYMOUS' as const,
};
const feedback = (id: string, at: string) => ({
  id,
  rating: 'BAD' as const,
  updatedAt: new Date(at),
  dailyMission: { format: 'TEXT' as const },
});

describe('PrismaPersonalityLearningCandidateRepository', () => {
  it('uses only repeated BAD feedback after the current personality version', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        workspaceId: 'workspace-1',
        id: 'bunshin-1',
        ownerUserId: 'user-1',
        workspace: { memberships: [{ userId: 'user-1' }] },
        personalityVersions: [version],
        missionFeedback: [
          feedback('new-1', '2026-09-04T00:00:00Z'),
          feedback('new-2', '2026-09-03T00:00:00Z'),
          feedback('new-3', '2026-09-02T00:00:00Z'),
          feedback('old', '2026-08-31T00:00:00Z'),
        ],
      },
    ]);
    const repository = new PrismaPersonalityLearningCandidateRepository({
      bunshin: { findMany },
    } as never);
    const result = await repository.listEligible({ limit: 10, evidenceLimit: 20 });
    expect(result.candidates[0]?.evidence.map(({ feedbackId }) => feedbackId)).toEqual([
      'new-1',
      'new-2',
      'new-3',
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          personalityLearningProposals: { none: { status: 'PENDING' } },
          missionFeedback: { some: { rating: 'BAD' } },
        }),
      }),
    );
  });

  it('does not return a candidate with fewer than three new ratings', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        workspaceId: 'workspace-1',
        id: 'bunshin-1',
        ownerUserId: 'user-1',
        workspace: { memberships: [{ userId: 'user-1' }] },
        personalityVersions: [version],
        missionFeedback: [
          feedback('one', '2026-09-02T00:00:00Z'),
          feedback('two', '2026-09-03T00:00:00Z'),
        ],
      },
    ]);
    const repository = new PrismaPersonalityLearningCandidateRepository({
      bunshin: { findMany },
    } as never);
    await expect(repository.listEligible({ limit: 10, evidenceLimit: 20 })).resolves.toMatchObject({
      candidates: [],
    });
  });
});
