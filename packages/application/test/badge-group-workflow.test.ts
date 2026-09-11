import { describe, expect, it, vi } from 'vitest';
import {
  CreateAndSubmitGroupBadge,
  RevokeGroupBadgeAward,
  ReviseGroupBadge,
  ReviewGroupBadgeCandidate,
  SetGroupBadgeAvailability,
  SubmitGroupBadge,
  type BadgeGroupWorkflowRepository,
} from '../src/badge-group-workflow';

const repository = (): BadgeGroupWorkflowRepository => ({
  createAndSubmit: vi.fn(),
  submit: vi.fn(),
  review: vi.fn(),
  nominate: vi.fn(),
  reviewCandidate: vi.fn(),
  revokeAward: vi.fn(),
  setDefinitionStatus: vi.fn(),
  reviseDefinition: vi.fn(),
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

  it('requires a reason and fails closed when revoking an award', async () => {
    await expect(
      new RevokeGroupBadgeAward(repository()).execute({
        awardId: 'a',
        actorUserId: 'u',
        reason: ' ',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const revokeAward = vi.fn().mockResolvedValue(null);
    await expect(
      new RevokeGroupBadgeAward({ ...repository(), revokeAward }).execute({
        awardId: 'a',
        actorUserId: 'u',
        reason: '誤って付与したため',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('requires a reason and fails closed when changing badge availability', async () => {
    await expect(
      new SetGroupBadgeAvailability(repository()).execute({
        definitionId: 'd',
        actorUserId: 'u',
        status: 'SUSPENDED',
        reason: ' ',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const setDefinitionStatus = vi.fn().mockResolvedValue(null);
    await expect(
      new SetGroupBadgeAvailability({ ...repository(), setDefinitionStatus }).execute({
        definitionId: 'd',
        actorUserId: 'u',
        status: 'SUSPENDED',
        reason: '企画が終了したため',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('validates revisions and fails closed outside the service operator scope', async () => {
    await expect(
      new ReviseGroupBadge(repository()).execute({
        definitionId: 'd',
        actorUserId: 'u',
        category: '活動',
        title: ' ',
        description: '参加へのお礼',
        altText: '星のバッジ',
        reason: '表記を直すため',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const reviseDefinition = vi.fn().mockResolvedValue(null);
    await expect(
      new ReviseGroupBadge({ ...repository(), reviseDefinition }).execute({
        definitionId: 'd',
        actorUserId: 'u',
        category: '活動',
        title: '参加ありがとう',
        description: '参加へのお礼',
        altText: '星のバッジ',
        reason: '表記を直すため',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
