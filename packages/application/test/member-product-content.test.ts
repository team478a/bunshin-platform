import { describe, expect, it, vi } from 'vitest';
import {
  MemberProductProfileService,
  createMemberProductContent,
  finalizeMemberProductCandidate,
  type MemberProductProfileRepository,
} from '../src';

describe('member product content', () => {
  it('creates disclosed copy with the approved member URL', () => {
    const result = createMemberProductContent({
      productName: 'サンプル商品',
      appealPoint: '毎日の活動に取り入れやすい商品です。',
      targetAudience: '新しい習慣を始めたい方',
      approvedUrl: 'https://shop.example.jp/item/1?ref=member-1',
      platform: 'INSTAGRAM',
    });

    expect(result.body).toContain('サンプル商品についてご紹介します。');
    expect(result.body).toContain('新しい習慣を始めたい方');
    expect(result.body).toContain('#PR');
    expect(result.body).toContain('https://shop.example.jp/item/1?ref=member-1');
  });

  it('keeps X copy within the platform limit', () => {
    const result = createMemberProductContent({
      productName: 'サンプル商品',
      appealPoint: 'あ'.repeat(280),
      approvedUrl: 'https://shop.example.jp/item/1?ref=member-1',
      platform: 'X',
    });

    expect(result.characterLimit).toBe(280);
    expect(result.body.length).toBeLessThanOrEqual(280);
    expect(result.body).toContain('#PR');
    expect(result.body).toContain('https://shop.example.jp/item/1?ref=member-1');
  });

  it.each([
    'http://shop.example.jp/item/1',
    'https://user:secret@shop.example.jp/item/1',
    'https://shop.example.jp/item/1#member',
  ])('rejects an unsafe member URL: %s', (approvedUrl) => {
    expect(() =>
      createMemberProductContent({
        productName: 'サンプル商品',
        appealPoint: '確認済みの特徴です。',
        approvedUrl,
        platform: 'THREADS',
      }),
    ).toThrow();
  });

  it('finalizes an AI draft with the approved URL and one disclosure', () => {
    const result = finalizeMemberProductCandidate({
      draft: '毎日の楽しみに取り入れやすい商品をご紹介します。 #PR',
      approvedUrl: 'https://shop.example.jp/item/1?ref=member-1',
      platform: 'THREADS',
    });

    expect(result.body.match(/#PR/gu)).toHaveLength(1);
    expect(result.body).toContain('https://shop.example.jp/item/1?ref=member-1');
    expect(result.body.length).toBeLessThanOrEqual(500);
  });

  it('rejects an AI draft containing a provider-supplied URL', () => {
    expect(() =>
      finalizeMemberProductCandidate({
        draft: '詳しくは https://unapproved.example をご覧ください。',
        approvedUrl: 'https://shop.example.jp/item/1?ref=member-1',
        platform: 'INSTAGRAM',
      }),
    ).toThrow('unapproved URL');
  });

  it('appends official disclosures once before the PR label and approved URL', () => {
    const result = finalizeMemberProductCandidate({
      draft: '毎日の習慣に取り入れやすい商品です。 提供：サンプル社',
      approvedUrl: 'https://shop.example.jp/item/1?ref=member-1',
      platform: 'THREADS',
      requiredDisclosures: ['提供：サンプル社'],
    });

    expect(result.body.match(/提供：サンプル社/gu)).toHaveLength(1);
    expect(result.body).toContain('提供：サンプル社\n#PR\nhttps://shop.example.jp');
  });

  it('rejects an AI draft containing an official forbidden expression', () => {
    expect(() =>
      finalizeMemberProductCandidate({
        draft: '絶対に結果が出る商品です。',
        approvedUrl: 'https://shop.example.jp/item/1?ref=member-1',
        platform: 'INSTAGRAM',
        forbiddenExpressions: ['絶対'],
      }),
    ).toThrow('forbidden expression');
  });
});

describe('member product profile service', () => {
  it('normalizes and saves a profile through the scoped repository', async () => {
    const save = vi.fn<MemberProductProfileRepository['save']>().mockResolvedValue({
      id: 'profile-1',
      externalTrackingLinkId: 'link-1',
      externalTrackingSystemName: '販売サービス',
      productPackId: null,
      productPackName: null,
      name: 'サンプル商品',
      appealPoint: '確認済みの特徴です。',
      targetAudience: '初めて使う方',
      updatedAt: new Date('2026-09-06T00:00:00Z'),
    });
    const repository = {
      list: vi.fn(),
      listProductMasters: vi.fn(),
      getGenerationContext: vi.fn(),
      save,
      archive: vi.fn(),
      recordGeneration: vi.fn(),
      recordActivity: vi.fn(),
    } satisfies MemberProductProfileRepository;

    await new MemberProductProfileService(repository).save({
      workspaceId: 'workspace-1',
      groupId: 'group-1',
      actorUserId: 'user-1',
      externalTrackingLinkId: 'link-1',
      name: '  サンプル商品  ',
      appealPoint: '  確認済みの特徴です。  ',
      targetAudience: '  初めて使う方  ',
    });

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        groupId: 'group-1',
        actorUserId: 'user-1',
        name: 'サンプル商品',
        appealPoint: '確認済みの特徴です。',
        targetAudience: '初めて使う方',
      }),
    );
  });

  it('fails closed when the active member URL is outside the user scope', async () => {
    const repository = {
      list: vi.fn(),
      listProductMasters: vi.fn(),
      getGenerationContext: vi.fn(),
      save: vi.fn().mockResolvedValue(null),
      archive: vi.fn(),
      recordGeneration: vi.fn(),
      recordActivity: vi.fn(),
    } satisfies MemberProductProfileRepository;

    await expect(
      new MemberProductProfileService(repository).save({
        workspaceId: 'workspace-1',
        groupId: 'group-1',
        actorUserId: 'user-1',
        externalTrackingLinkId: 'other-user-link',
        name: 'サンプル商品',
        appealPoint: '確認済みの特徴です。',
      }),
    ).rejects.toThrow('active member URL unavailable');
  });

  it('archives only through the scoped repository', async () => {
    const archive = vi.fn<MemberProductProfileRepository['archive']>().mockResolvedValue(true);
    const repository = {
      list: vi.fn(),
      listProductMasters: vi.fn(),
      getGenerationContext: vi.fn(),
      save: vi.fn(),
      archive,
      recordGeneration: vi.fn(),
      recordActivity: vi.fn(),
    } satisfies MemberProductProfileRepository;

    await new MemberProductProfileService(repository).archive({
      workspaceId: 'workspace-1',
      groupId: 'group-1',
      actorUserId: 'user-1',
      profileId: 'profile-1',
    });

    expect(archive).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        groupId: 'group-1',
        actorUserId: 'user-1',
        profileId: 'profile-1',
      }),
    );
  });

  it('records generated, copied and posted activity through the scoped repository', async () => {
    const recordGeneration = vi
      .fn<MemberProductProfileRepository['recordGeneration']>()
      .mockResolvedValue(true);
    const recordActivity = vi
      .fn<MemberProductProfileRepository['recordActivity']>()
      .mockResolvedValue(true);
    const repository = {
      list: vi.fn(),
      listProductMasters: vi.fn(),
      getGenerationContext: vi.fn(),
      save: vi.fn(),
      archive: vi.fn(),
      recordGeneration,
      recordActivity,
    } satisfies MemberProductProfileRepository;
    const service = new MemberProductProfileService(repository);

    const generated = await service.recordGeneration({
      workspaceId: 'workspace-1',
      groupId: 'group-1',
      actorUserId: 'user-1',
      profileId: 'profile-1',
      bunshinId: 'bunshin-1',
      platform: 'INSTAGRAM',
    });
    await service.recordActivity({
      workspaceId: 'workspace-1',
      groupId: 'group-1',
      actorUserId: 'user-1',
      generationId: generated.generationId,
      type: 'COPIED',
      candidateIndex: 1,
    });

    expect(recordGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: 'profile-1', bunshinId: 'bunshin-1' }),
    );
    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        generationId: generated.generationId,
        type: 'COPIED',
        candidateIndex: 1,
      }),
    );
  });

  it('rejects a candidate index outside the generated three options', async () => {
    const repository = {
      list: vi.fn(),
      listProductMasters: vi.fn(),
      getGenerationContext: vi.fn(),
      save: vi.fn(),
      archive: vi.fn(),
      recordGeneration: vi.fn(),
      recordActivity: vi.fn(),
    } satisfies MemberProductProfileRepository;

    await expect(
      new MemberProductProfileService(repository).recordActivity({
        workspaceId: 'workspace-1',
        groupId: 'group-1',
        actorUserId: 'user-1',
        generationId: 'generation-1',
        type: 'POSTED',
        candidateIndex: 3,
      }),
    ).rejects.toThrow('invalid member product candidate index');
  });
});
