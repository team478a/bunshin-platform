import { describe, expect, it, vi } from 'vitest';
import {
  CreateAndSubmitGroupBadge,
  ReviewGroupBadgeCandidate,
  SubmitGroupBadge,
  type BadgeGroupWorkflowRepository,
} from '../src/badge-group-workflow';

const repository = (): BadgeGroupWorkflowRepository => ({
  createAndSubmit: vi.fn(),
  submit: vi.fn(),
  review: vi.fn(),
  nominate: vi.fn(),
  reviewCandidate: vi.fn(),
});

describe('group badge workflow', () => {
  it('normalizes a group badge code before creating and submitting', async () => {
    const createAndSubmit = vi.fn().mockResolvedValue({
      definitionId: 'd',
      badgeVersionId: 'v',
      approvalRequestId: 'a',
    });
    await new CreateAndSubmitGroupBadge({ ...repository(), createAndSubmit }).execute({
      workspaceId: 'w',
      groupId: 'g',
      actorUserId: 'u',
      code: 'helper_badge',
      category: '活動',
      title: 'お助け役',
      description: '仲間を助けた人',
      imageKey: 'badges/helper.svg',
      altText: '星のバッジ',
      reason: 'グループ活動で使用するため',
    });
    expect(createAndSubmit).toHaveBeenCalledWith(expect.objectContaining({ code: 'HELPER_BADGE' }));
  });

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
