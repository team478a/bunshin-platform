import { describe, expect, it, vi } from 'vitest';
import {
  AwardBadge,
  CreateBadgeDefinition,
  CreateBadgeVersion,
  SaveBadgeProgress,
  type BadgeCoreRepository,
} from '../src/badge-core';

const repository = (): BadgeCoreRepository => ({
  createDefinition: vi.fn(),
  createVersion: vi.fn(),
  publishVersion: vi.fn(),
  saveProgress: vi.fn(),
  award: vi.fn(),
  recordProcessingEvent: vi.fn(),
});

describe('badge core use cases', () => {
  it('requires an exact owner boundary', async () => {
    const repo = repository();
    await expect(
      new CreateBadgeDefinition(repo).execute({
        actorUserId: 'actor',
        ownerType: 'SYSTEM',
        workspaceId: 'workspace',
        groupId: null,
        code: 'FIRST_POST',
        category: 'START',
        reason: 'initial catalog',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      new CreateBadgeDefinition(repo).execute({
        actorUserId: 'actor',
        ownerType: 'GROUP',
        workspaceId: 'workspace',
        groupId: null,
        code: 'GROUP_BADGE',
        category: 'GROUP',
        reason: 'group draft',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects invalid version periods before persistence', async () => {
    const repo = repository();
    await expect(
      new CreateBadgeVersion(repo).execute({
        actorUserId: 'actor',
        definitionId: 'definition',
        title: '初投稿',
        description: '初めて投稿しました',
        imageKey: 'badges/first-post.png',
        lockedImageKey: null,
        altText: '初投稿バッジ',
        backgroundColor: null,
        conditionType: 'FIRST',
        conditionConfig: { eventType: 'POSTED' },
        visibilityPolicy: 'PRIVATE',
        rewardPolicy: { type: 'NONE' },
        startsAt: new Date('2026-09-02T00:00:00Z'),
        endsAt: new Date('2026-09-01T00:00:00Z'),
        reason: 'initial version',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('requires safe progress values', async () => {
    const repo = repository();
    await expect(
      new SaveBadgeProgress(repo).execute({
        workspaceId: 'workspace',
        userId: 'user',
        badgeVersionId: 'version',
        groupId: null,
        currentValue: -1,
        targetValue: 3,
        streakState: null,
        status: 'IN_PROGRESS',
        lastEventAt: null,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects evidence that is not a sha-256 hash before awarding', async () => {
    const repo = repository();
    await expect(
      new AwardBadge(repo).execute({
        workspaceId: 'workspace',
        userId: 'user',
        badgeVersionId: 'version',
        groupId: null,
        sourceBunshinId: null,
        awardedAt: new Date(),
        sourceType: 'POST_RECORD',
        sourceId: 'post',
        evidenceHash: 'unsafe',
        idempotencyKey: 'badge:first-post:post',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
