import { describe, expect, it, vi } from 'vitest';
import {
  ReviewGroupBadgeCandidate,
  SubmitGroupBadge,
  type BadgeGroupWorkflowRepository,
} from '../src/badge-group-workflow';

const repository = (): BadgeGroupWorkflowRepository => ({
  submit: vi.fn(),
  review: vi.fn(),
  nominate: vi.fn(),
  reviewCandidate: vi.fn(),
});

describe('group badge workflow', () => {
  it('requires a reason when submitting', async () => {
    await expect(
      new SubmitGroupBadge(repository()).execute({
        workspaceId: 'w',
        groupId: 'g',
        badgeVersionId: 'v',
        actorUserId: 'u',
        reason: ' ',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('fails closed when candidate review is outside the allowed scope', async () => {
    const reviewCandidate = vi.fn().mockResolvedValue(null);
    await expect(
      new ReviewGroupBadgeCandidate({ ...repository(), reviewCandidate }).execute({
        candidateId: 'c',
        actorUserId: 'u',
        decision: 'APPROVED',
        reason: '別の管理者が確認',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
