import { describe, expect, it, vi } from 'vitest';
import {
  MemberProductProfileService,
  createMemberProductContent,
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
});

describe('member product profile service', () => {
  it('normalizes and saves a profile through the scoped repository', async () => {
    const save = vi.fn<MemberProductProfileRepository['save']>().mockResolvedValue({
      id: 'profile-1',
      externalTrackingLinkId: 'link-1',
      externalTrackingSystemName: '販売サービス',
      name: 'サンプル商品',
      appealPoint: '確認済みの特徴です。',
      targetAudience: '初めて使う方',
      updatedAt: new Date('2026-09-06T00:00:00Z'),
    });
    const repository = {
      list: vi.fn(),
      save,
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
      save: vi.fn().mockResolvedValue(null),
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
});
