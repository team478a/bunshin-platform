import { describe, expect, it, vi } from 'vitest';
import { PrismaMissionContentVariantRepository } from '../src';

const scope = {
  workspaceId: 'workspace-1',
  groupId: 'group-1',
  bunshinId: 'bunshin-1',
  actorUserId: 'user-1',
  dailyMissionId: 'mission-1',
};

function client(options: { authorized: boolean }) {
  const findMany = vi.fn().mockResolvedValue([
    {
      id: 'generation-1',
      status: 'SUCCEEDED',
      variantId: 'variant-1',
      errorCategory: null,
      promptVersion: 'mission-content-variant-v1',
      qualityVerdict: 'PASS',
      qualityScore: 92,
      qualityIssueCodes: ['PHOTO_FIRST_UNCONFIRMED_FACT'],
      qualityRepairCount: 1,
      createdAt: new Date('2026-10-02T00:00:00Z'),
      updatedAt: new Date('2026-10-02T00:01:00Z'),
    },
  ]);
  return {
    findMany,
    database: {
      dailyMission: {
        findFirst: vi.fn().mockResolvedValue(
          options.authorized
            ? {
                id: scope.dailyMissionId,
                format: 'TEXT',
                bunshin: {
                  ownerUserId: scope.actorUserId,
                  workspace: { memberships: [{ role: 'MEMBER' }] },
                },
              }
            : null,
        ),
      },
      missionContentVariantGeneration: { findMany },
    },
  };
}

describe('mission content variant quality audit query', () => {
  it('returns only bounded audit metadata inside the authorized tenant scope', async () => {
    const { database, findMany } = client({ authorized: true });
    const result = await new PrismaMissionContentVariantRepository(
      database as never,
    ).listQualityAudits({
      ...scope,
      issueCode: 'PHOTO_FIRST_UNCONFIRMED_FACT',
    });
    expect(result).toEqual([
      expect.objectContaining({
        generationId: 'generation-1',
        qualityVerdict: 'PASS',
        qualityRepairCount: 1,
      }),
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: scope.workspaceId,
        bunshinId: scope.bunshinId,
        dailyMissionId: scope.dailyMissionId,
        qualityIssueCodes: { has: 'PHOTO_FIRST_UNCONFIRMED_FACT' },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
      select: {
        id: true,
        status: true,
        variantId: true,
        errorCategory: true,
        promptVersion: true,
        qualityVerdict: true,
        qualityScore: true,
        qualityIssueCodes: true,
        qualityRepairCount: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    expect(JSON.stringify(result)).not.toContain('contentJson');
    expect(JSON.stringify(result)).not.toContain('confirmationAnswer');
    expect(JSON.stringify(result)).not.toContain('actorUserId');
    expect(JSON.stringify(result)).not.toContain('idempotencyKey');
  });

  it('does not query generations when the mission is outside the authorized scope', async () => {
    const { database, findMany } = client({ authorized: false });
    await expect(
      new PrismaMissionContentVariantRepository(database as never).listQualityAudits({
        ...scope,
        workspaceId: 'other-workspace',
        issueCode: 'PHOTO_FIRST_UNCONFIRMED_FACT',
      }),
    ).resolves.toBeNull();
    expect(findMany).not.toHaveBeenCalled();
  });
});
