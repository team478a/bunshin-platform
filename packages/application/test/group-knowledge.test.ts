import { describe, expect, it } from 'vitest';

import {
  GroupKnowledgeService,
  type GroupKnowledgeChunkRecord,
  type GroupKnowledgeRepository,
  type GroupKnowledgeSourceRecord,
} from '../src';

const scope = { workspaceId: 'workspace-1', groupId: 'group-1', actorUserId: 'user-1' };

class Repository implements GroupKnowledgeRepository {
  source: GroupKnowledgeSourceRecord = {
    id: 'source-1',
    ...scope,
    productPackVersionId: null,
    logicalKey: 'guide',
    version: 1,
    type: 'PDF',
    title: '商品資料',
    sourceUri: 'https://example.com/guide.pdf',
    storageKey: null,
    originalFileName: 'guide.pdf',
    mimeType: 'application/pdf',
    contentHash: null,
    status: 'DRAFT',
    failureCode: null,
    createdAt: new Date('2026-08-29T00:00:00Z'),
    updatedAt: new Date('2026-08-29T00:00:00Z'),
  };
  chunks: GroupKnowledgeChunkRecord[] = [];
  allow = true;

  createSource(input: Parameters<GroupKnowledgeRepository['createSource']>[0]) {
    if (!this.allow) return Promise.resolve(null);
    this.source = { ...this.source, ...input };
    return Promise.resolve(this.source);
  }
  beginProcessing() {
    if (this.source.status !== 'DRAFT' && this.source.status !== 'FAILED')
      return Promise.resolve(false);
    this.source.status = 'PROCESSING';
    return Promise.resolve(true);
  }
  replaceExtractedChunks(input: Parameters<GroupKnowledgeRepository['replaceExtractedChunks']>[0]) {
    if (this.source.status !== 'PROCESSING') return Promise.resolve(false);
    this.chunks = input.chunks.map((chunk, index) => ({
      ...chunk,
      id: `chunk-${index}`,
      sourceId: input.sourceId,
    }));
    this.source.status = 'REVIEW_REQUIRED';
    return Promise.resolve(true);
  }
  markFailed() {
    this.source.status = 'FAILED';
    return Promise.resolve(true);
  }
  approve() {
    if (this.source.status !== 'REVIEW_REQUIRED' || this.chunks.length === 0)
      return Promise.resolve(false);
    this.source.status = 'ACTIVE';
    return Promise.resolve(true);
  }
  archive() {
    this.source.status = 'ARCHIVED';
    return Promise.resolve(true);
  }
  listForManagement() {
    return Promise.resolve(this.allow ? [this.source] : null);
  }
  listApprovedChunksForGeneration() {
    if (!this.allow) return Promise.resolve(null);
    return Promise.resolve(this.source.status === 'ACTIVE' ? this.chunks : []);
  }
}

describe('GroupKnowledgeService', () => {
  it('PDFの抽出結果を人間確認後だけ生成に公開する', async () => {
    const repository = new Repository();
    const service = new GroupKnowledgeService(repository);
    await service.createSource({
      ...scope,
      logicalKey: 'official-guide',
      type: 'PDF',
      title: '公式商品資料',
      sourceUri: 'https://example.com/guide.pdf',
      originalFileName: 'guide.pdf',
      mimeType: 'application/pdf',
    });
    expect(await service.listApprovedChunksForGeneration(scope)).toEqual([]);

    await service.beginProcessing({ ...scope, sourceId: 'source-1' });
    await service.saveExtraction({
      ...scope,
      sourceId: 'source-1',
      chunks: [
        {
          type: 'FAQ',
          content: 'Q: 解約できますか？ A: 管理画面からいつでも申請できます。',
          sourceLabel: '公式商品資料 3ページ',
          pageNumber: 3,
          confidence: 0.98,
        },
      ],
    });
    expect(await service.listApprovedChunksForGeneration(scope)).toEqual([]);

    await service.approve({ ...scope, sourceId: 'source-1' });
    expect(await service.listApprovedChunksForGeneration(scope)).toHaveLength(1);
  });

  it('URLはHTTPSだけを受け付ける', async () => {
    const service = new GroupKnowledgeService(new Repository());
    await expect(
      service.createSource({
        ...scope,
        type: 'URL',
        title: '危険なURL',
        sourceUri: 'http://example.com',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      service.createSource({
        ...scope,
        type: 'URL',
        title: '認証情報入りURL',
        sourceUri: 'https://user:password@example.com',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('別グループとして扱われる権限拒否を隠さない', async () => {
    const repository = new Repository();
    repository.allow = false;
    await expect(
      new GroupKnowledgeService(repository).createSource({
        ...scope,
        type: 'TEXT',
        title: 'FAQ',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('動画の根拠時刻が逆転している抽出を拒否する', async () => {
    const repository = new Repository();
    repository.source.status = 'PROCESSING';
    await expect(
      new GroupKnowledgeService(repository).saveExtraction({
        ...scope,
        sourceId: 'source-1',
        chunks: [{ content: '説明', sourceLabel: '動画', startSeconds: 20, endSeconds: 10 }],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
