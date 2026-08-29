import { describe, expect, it } from 'vitest';

import {
  GroupKnowledgeService,
  selectGroupKnowledgeChunksForPrompt,
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
    if (!['DRAFT', 'FAILED', 'REVIEW_REQUIRED'].includes(this.source.status))
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
  updateProductScope(input: Parameters<GroupKnowledgeRepository['updateProductScope']>[0]) {
    if (!this.allow) return Promise.resolve(null);
    this.source.productPackVersionId = input.productPackVersionId;
    return Promise.resolve(this.source);
  }
  updateReviewChunkContents(
    input: Parameters<GroupKnowledgeRepository['updateReviewChunkContents']>[0],
  ) {
    if (!this.allow || this.source.status !== 'REVIEW_REQUIRED') return Promise.resolve(false);
    const updates = new Map(input.chunks.map((chunk) => [chunk.id, chunk.content]));
    if (updates.size !== this.chunks.length) return Promise.resolve(false);
    this.chunks = this.chunks.map((chunk) => ({
      ...chunk,
      content: updates.get(chunk.id) ?? chunk.content,
    }));
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
  it('生成Promptへ渡す件数と文字数を制限する', () => {
    const chunks = Array.from({ length: 25 }, (_, index) => ({
      id: `chunk-${index}`,
      sourceId: 'source-1',
      sortOrder: index,
      type: 'GENERAL' as const,
      content: 'あ'.repeat(700),
      sourceLabel: '公式資料',
      pageNumber: null,
      startSeconds: null,
      endSeconds: null,
      confidence: 1,
    }));
    const selected = selectGroupKnowledgeChunksForPrompt(chunks);
    expect(selected).toHaveLength(17);
    expect(selected.reduce((sum, chunk) => sum + chunk.content.length, 0)).toBeLessThanOrEqual(
      12_000,
    );
  });

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

  it('資料を再登録せず商品専用とグループ共通を切り替える', async () => {
    const repository = new Repository();
    const service = new GroupKnowledgeService(repository);
    await expect(
      service.updateProductScope({
        ...scope,
        sourceId: repository.source.id,
        productPackVersionId: 'product-version-1',
      }),
    ).resolves.toMatchObject({ productPackVersionId: 'product-version-1' });
    await expect(
      service.updateProductScope({
        ...scope,
        sourceId: repository.source.id,
        productPackVersionId: null,
      }),
    ).resolves.toMatchObject({ productPackVersionId: null });
  });

  it('利用範囲の変更でも別グループとして扱われる対象を拒否する', async () => {
    const repository = new Repository();
    repository.allow = false;
    await expect(
      new GroupKnowledgeService(repository).updateProductScope({
        ...scope,
        sourceId: repository.source.id,
        productPackVersionId: 'foreign-product-version',
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

  it('確認待ちの内容を承認せず再読み取りできる', async () => {
    const repository = new Repository();
    repository.source.status = 'REVIEW_REQUIRED';
    await new GroupKnowledgeService(repository).beginProcessing({
      ...scope,
      sourceId: repository.source.id,
    });
    expect(repository.source.status).toBe('PROCESSING');
  });

  it('確認待ちの抽出文章を承認前に修正する', async () => {
    const repository = new Repository();
    repository.source.status = 'REVIEW_REQUIRED';
    repository.chunks = [
      {
        id: 'chunk-1',
        sourceId: repository.source.id,
        sortOrder: 0,
        type: 'FAQ',
        content: '修正前',
        sourceLabel: '3ページ',
        pageNumber: 3,
        startSeconds: null,
        endSeconds: null,
        confidence: 1,
      },
    ];
    await new GroupKnowledgeService(repository).updateReviewChunkContents({
      ...scope,
      sourceId: repository.source.id,
      chunks: [{ id: 'chunk-1', content: '修正後' }],
    });
    expect(repository.chunks[0]?.content).toBe('修正後');
  });
});
