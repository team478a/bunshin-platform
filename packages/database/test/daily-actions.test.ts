import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PrismaDailyActionRepository } from '../src';

const scope = {
  workspaceId: 'workspace-1',
  bunshinId: 'bunshin-1',
  actorUserId: 'user-1',
  groupId: 'group-1',
};

describe('PrismaDailyActionRepository', () => {
  it('Migrationで追記履歴、冪等性、素材整合性をDB制約にする', () => {
    const migration = readFileSync(
      new URL(
        '../prisma/migrations/20260908100000_add_daily_actions/migration.sql',
        import.meta.url,
      ),
      'utf8',
    );
    expect(migration).toContain('CREATE TABLE "daily_actions"');
    expect(migration).toContain('daily_actions_owner_user_id_idempotency_key_key');
    expect(migration).toContain('daily_actions_kind_asset_check');
  });
  it('一覧取得を本人・Workspace・分身・サービスの全境界で制限する', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: scope.bunshinId });
    const findMany = vi.fn().mockResolvedValue([]);
    const client = { bunshin: { findFirst }, dailyAction: { findMany } };
    await new PrismaDailyActionRepository(client as never).list({ ...scope, limit: 20 });
    expect(findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: scope.bunshinId,
        workspaceId: scope.workspaceId,
        ownerUserId: scope.actorUserId,
        groupId: scope.groupId,
      }),
      select: { id: true },
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: scope.workspaceId,
          bunshinId: scope.bunshinId,
          ownerUserId: scope.actorUserId,
        },
      }),
    );
  });

  it('対象分身を所有していなければKnowledgeもActionも作らない', async () => {
    const tx = {
      dailyAction: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
      bunshin: { findFirst: vi.fn().mockResolvedValue(null) },
      dailyMission: { findFirst: vi.fn() },
      ownerKnowledge: { create: vi.fn() },
      bunshinKnowledgeGrant: { create: vi.fn() },
    };
    const client = {
      $transaction: vi.fn((callback: (value: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const result = await new PrismaDailyActionRepository(client as never).create({
      ...scope,
      dailyMissionId: null,
      kind: 'REST_REASON',
      title: '投稿を休んだ理由',
      content: '今日は休む',
      knowledgeType: 'OTHER',
      assetStorageKey: null,
      assetMimeType: null,
      assetOriginalFilename: null,
      assetSizeBytes: null,
      idempotencyKey: 'key-1',
    });
    expect(result).toBeNull();
    expect(tx.ownerKnowledge.create).not.toHaveBeenCalled();
    expect(tx.bunshinKnowledgeGrant.create).not.toHaveBeenCalled();
    expect(tx.dailyAction.create).not.toHaveBeenCalled();
  });
});
