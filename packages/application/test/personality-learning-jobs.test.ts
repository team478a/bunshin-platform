import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';
import {
  GeneratePersonalityLearningProposal,
  RunPersonalityLearningProposalJob,
  type PersonalityLearningCandidate,
  type PersonalityLearningCandidateRepository,
  type PersonalityLearningProposalRepository,
} from '../src';

const content = {
  tone: 'やさしい',
  formality: 'ふつう',
  energyLevel: '落ち着いている',
  expertiseLevel: '初心者向け',
  sentenceStyle: '短い文',
  firstPerson: 'わたし',
  forbiddenExpressions: [] as string[],
  preferredExpressions: [] as string[],
  visualDirection: null,
  facePolicy: 'FULL_ANONYMOUS' as const,
};
const candidate = (count = 3): PersonalityLearningCandidate => ({
  workspaceId: 'workspace-1',
  bunshinId: 'bunshin-1',
  actorUserId: 'user-1',
  basedOnVersionId: 'version-1',
  currentContent: content,
  evidence: Array.from({ length: count }, (_, index) => ({
    feedbackId: `feedback-${index}`,
    rating: 'BAD' as const,
    missionFormat: 'TEXT',
    occurredAt: new Date(`2026-09-0${index + 1}T00:00:00Z`),
  })),
});

describe('Personality learning proposal job', () => {
  it('does not ask for a suggestion with fewer than three feedback records', async () => {
    const suggest = vi.fn();
    const create = vi.fn();
    const generate = new GeneratePersonalityLearningProposal(
      { create } as unknown as PersonalityLearningProposalRepository,
      { suggest },
    );
    await expect(generate.execute(candidate(2))).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(suggest).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('passes only classified evidence, not mission content, to the suggestion provider', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'proposal-1' });
    const suggest = vi.fn().mockResolvedValue({ proposedContent: content, reason: '短く整える' });
    await new GeneratePersonalityLearningProposal(
      { create } as unknown as PersonalityLearningProposalRepository,
      { suggest },
    ).execute(candidate());
    expect(suggest).toHaveBeenCalledWith({
      currentContent: content,
      evidence: Array(3).fill({ rating: 'BAD', missionFormat: 'TEXT' }),
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ evidenceIds: ['feedback-0', 'feedback-1', 'feedback-2'] }),
    );
  });

  it('continues other candidates when one already has a pending proposal', async () => {
    const candidates: PersonalityLearningCandidateRepository = {
      listEligible: () =>
        Promise.resolve({ candidates: [candidate(), candidate()], truncated: false }),
    };
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new ApplicationError('CONFLICT', 'pending proposal exists'))
      .mockResolvedValueOnce({});
    const summary = await new RunPersonalityLearningProposalJob(candidates, {
      execute,
    } as never).execute();
    expect(summary).toMatchObject({ candidates: 2, skipped: 1, failures: 0, created: 1 });
  });
});
