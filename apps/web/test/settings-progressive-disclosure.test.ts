import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('settings progressive disclosure', () => {
  it('keeps service settings available while grouping infrequent operations', () => {
    const basics = read('app/s/[serviceSlug]/manage/settings/service-basics-fields.tsx');
    const onboarding = read('app/s/[serviceSlug]/manage/settings/service-onboarding-fields.tsx');

    expect(basics).toContain('<summary>基本情報・ブランド</summary>');
    expect(basics).toContain('<summary>参加方法・公開条件</summary>');
    expect(basics).toContain('<summary>投稿案・参加者へのお知らせ</summary>');
    expect(onboarding).toContain('<summary>初回案内・毎日の配信</summary>');

    for (const field of [
      'displayName',
      'registrationAccess',
      'lineEnabled',
      'announcementEnabled',
    ]) {
      expect(basics).toContain(`name="${field}"`);
    }
    expect(onboarding).toContain('<DailyIdeaDeliveryFields');
  });

  it('keeps limits and periods but puts them behind exception settings', () => {
    const groupPolicy = read('app/(app)/admin/groups/[groupId]/features/[featureKey]/page.tsx');
    const memberPolicy = read(
      'app/(app)/groups/[groupId]/members/group-member-feature-settings.tsx',
    );

    expect(groupPolicy).toContain('必要な場合だけ、利用回数や期間を制限する');
    expect(memberPolicy).toContain('この参加者だけ、上限や利用期間を変える');
    for (const source of [groupPolicy, memberPolicy]) {
      expect(source).toContain('name="dailyLimit"');
      expect(source).toContain('name="monthlyLimit"');
      expect(source).toContain('name="startsAt"');
      expect(source).toContain('name="endsAt"');
      expect(source).toContain('name="reason"');
    }
  });

  it('shows dedicated LINE setup only when dedicated mode is selected', () => {
    const line = read('app/(app)/admin/groups/[groupId]/line/group-line-editor.tsx');

    expect(line).toContain('通常は「ワタシワークス共通LINE」を選ぶだけで完了です。');
    expect(line.match(/hidden=\{mode !== 'DEDICATED'\}/g)).toHaveLength(2);
    expect(line).toContain("{mode === 'DEDICATED' && (");
    expect(line).toContain('<h2>新しい専用LINE設定</h2>');
    expect(line).toContain('<h2>保存した設定</h2>');
    expect(line).toContain('<h2>標準リッチメニュー</h2>');
  });
});
