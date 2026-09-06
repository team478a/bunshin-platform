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
      save,
      archive: vi.fn(),
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
      save: vi.fn().mockResolvedValue(null),
      archive: vi.fn(),
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
      save: vi.fn(),
      archive,
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
});
