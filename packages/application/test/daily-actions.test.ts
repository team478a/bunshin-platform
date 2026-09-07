import { describe, expect, it } from 'vitest';
import { DailyActionService, type DailyActionRecord, type DailyActionRepository } from '../src';

const scope = {
  workspaceId: '10000000-0000-4000-8000-000000000001',
  bunshinId: '10000000-0000-4000-8000-000000000002',
  actorUserId: '10000000-0000-4000-8000-000000000003',
};
const key = '10000000-0000-4000-8000-000000000004';

class Repository implements DailyActionRepository {
  created: Parameters<DailyActionRepository['create']>[0] | null = null;
  allowed = true;
  find() {
    return Promise.resolve(null);
  }
  findByIdempotency() {
    return Promise.resolve(null);
  }
  list() {
    return Promise.resolve(this.allowed ? [] : null);
  }
  create(input: Parameters<DailyActionRepository['create']>[0]) {
    this.created = input;
    if (!this.allowed) return Promise.resolve(null);
    return Promise.resolve({
      id: '10000000-0000-4000-8000-000000000005',
      ...input,
      ownerUserId: input.actorUserId,
      ownerKnowledgeId: '10000000-0000-4000-8000-000000000006',
      assetPurgedAt: null,
      createdAt: new Date('2026-09-08T00:00:00Z'),
    } satisfies DailyActionRecord);
  }
}

describe('DailyActionService', () => {
  it('お客様の質問を本人Knowledgeとして選択中の分身だけへ渡す', async () => {
    const repository = new Repository();
    await new DailyActionService(repository).create({
      ...scope,
      kind: 'CUSTOMER_QUESTION',
      content: '初めてでも使えますか？',
      idempotencyKey: key,
    });
    expect(repository.created).toMatchObject({
      ...scope,
      kind: 'CUSTOMER_QUESTION',
      knowledgeType: 'FAQ',
      content: '初めてでも使えますか？',
      assetStorageKey: null,
    });
  });

  it('写真は検証済みの画像メタデータが揃わない限り登録しない', async () => {
    const service = new DailyActionService(new Repository());
    await expect(
      service.create({ ...scope, kind: 'PHOTO', content: '', idempotencyKey: key }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      service.create({
        ...scope,
        kind: 'PHOTO',
        content: '店頭の写真',
        idempotencyKey: key,
        assetStorageKey: 'scope/photo.jpg',
        assetMimeType: 'audio/mpeg',
        assetOriginalFilename: 'photo.jpg',
        assetSizeBytes: 100,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('別利用者・別分身として拒否された保存をNOT_FOUNDとして扱う', async () => {
    const repository = new Repository();
    repository.allowed = false;
    await expect(
      new DailyActionService(repository).create({
        ...scope,
        kind: 'REST_REASON',
        content: '今日は休む',
        idempotencyKey: key,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
