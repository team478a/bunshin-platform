import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pointsPage = readFileSync('app/(app)/points/page.tsx', 'utf8');
const badgesPage = readFileSync('app/(app)/badges/page.tsx', 'utf8');
const pointsApi = readFileSync('app/api/workspaces/[workspaceId]/points/route.ts', 'utf8');
const badgesApi = readFileSync('src/http/badge-user-experience.ts', 'utf8');
const membersPage = readFileSync('app/(app)/groups/[groupId]/members/page.tsx', 'utf8');
const servicePointsPage = readFileSync('app/s/[serviceSlug]/manage/points/page.tsx', 'utf8');

describe('rewards pilot web boundary', () => {
  it.each([pointsPage, badgesPage])(
    'shows a clear pilot message outside the selected users',
    (source) => {
      expect(source).toContain('getActiveRewardsPilotAccess');
      expect(source).toContain('現在は試験利用中です');
      expect(source).toContain('運営者から案内を受けた方だけ利用できます。');
    },
  );

  it.each([pointsApi, badgesApi])('rejects direct API use outside the pilot', (source) => {
    expect(source).toContain('hasActiveRewardsPilotAccess');
    expect(source).toContain('rewards pilot access required');
  });

  it.each([pointsPage, badgesPage])(
    'warns selected users during the final seven days',
    (source) => {
      expect(source).toContain('getRewardsPilotExpiryNotice');
      expect(source).toContain('RewardsPilotExpiryNoticeCard');
    },
  );

  it('shows operators the 30-person pilot count and a clear limit error', () => {
    expect(membersPage).toContain('試験利用中：');
    expect(membersPage).toContain('{rewardsPilotCount}人／30人');
    expect(membersPage).toContain('試験利用は30人までです。');
  });

  it('links the service operator from point settings to pilot enrollment', () => {
    expect(servicePointsPage).toContain('現在 <strong>{rewardsPilotActiveCount}人／30人</strong>');
    expect(servicePointsPage).toContain('試験利用者を選ぶ');
    expect(servicePointsPage).toContain('/s/${serviceSlug}/manage/members');
    expect(servicePointsPage).toContain('/admin/groups/${service.serviceId}/features');
  });

  it('shows operators a plain-language pilot report and review candidates', () => {
    expect(servicePointsPage).toContain('試験運用の結果');
    expect(servicePointsPage).toContain('resolveRewardsPilotMeasurementPeriod');
    expect(servicePointsPage).toContain('集計期間中にポイントとバッジを利用できた人数');
    expect(servicePointsPage).toContain('投稿した人');
    expect(servicePointsPage).toContain('3日以上続けた人');
    expect(servicePointsPage).toContain('ポイントを使った人');
    expect(servicePointsPage).toContain('確認候補');
    expect(servicePointsPage).toContain('自動判定は不正を断定するものではありません');
  });

  it('warns operators about service and participant expiration separately', () => {
    expect(servicePointsPage).toContain('サービスの試験利用終了日が近づいています');
    expect(servicePointsPage).toContain('参加者の試験利用終了日が近づいています');
    expect(servicePointsPage).toContain('参加者の終了日を確認する');
  });
});
