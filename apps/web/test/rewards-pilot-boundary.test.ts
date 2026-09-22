import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pointsPage = readFileSync('app/(app)/points/page.tsx', 'utf8');
const badgesPage = readFileSync('app/(app)/badges/page.tsx', 'utf8');
const pointsApi = readFileSync('app/api/workspaces/[workspaceId]/points/route.ts', 'utf8');
const badgesApi = readFileSync('src/http/badge-user-experience.ts', 'utf8');
const membersPage = readFileSync('app/(app)/groups/[groupId]/members/page.tsx', 'utf8');
const servicePointsPage = [
  readFileSync('app/s/[serviceSlug]/manage/points/page.tsx', 'utf8'),
  readFileSync('app/s/[serviceSlug]/manage/points/actions.ts', 'utf8'),
].join('\n');

describe('rewards pilot web boundary', () => {
  it.each([pointsPage, badgesPage])(
    'shows a clear pilot message outside the selected users',
    (source) => {
      expect(source).toContain('listActiveRewardsPilotServiceAccesses');
      expect(source).toContain('現在は試験利用中です');
      expect(source).toContain('サービスへの登録と、規約への同意が必要です。');
    },
  );

  it.each([pointsApi, badgesApi])('rejects direct API use outside the pilot', (source) => {
    expect(source).toMatch(/(?:has|get)ActiveRewardsPilotAccess/);
    expect(source).toContain('rewards pilot access required');
  });

  it('resolves the point API to one authorized service before loading its dashboard', () => {
    expect(pointsApi).toContain('getActiveRewardsPilotAccess');
    expect(pointsApi).toContain('groupId: access.groupId');
  });

  it.each([pointsPage, badgesPage])(
    'warns selected users during the final seven days',
    (source) => {
      expect(source).toContain('getRewardsPilotExpiryNotice');
      expect(source).toContain('RewardsPilotExpiryNoticeCard');
    },
  );

  it('shows operators that all registered participants are included automatically', () => {
    expect(membersPage).toContain('一般参加者');
    expect(membersPage).toContain('{rewardsPilotCount}人全員');
    expect(membersPage).toContain('個別の利用許可は必要ありません。');
  });

  it('shows every registered participant as an automatic pilot participant', () => {
    expect(servicePointsPage).toContain('<strong>{rewardsPilotActiveCount}人全員</strong>');
    expect(servicePointsPage).toContain('新しく登録した一般参加者も自動で追加されます。');
    expect(servicePointsPage).not.toContain('試験利用者を選ぶ');
    expect(servicePointsPage).toContain('/admin/groups/${service.serviceId}/features');
  });

  it('lets a phone operator set four weeks without selecting members', () => {
    expect(servicePointsPage).toContain('startFourWeekPilot');
    expect(servicePointsPage).toContain('startFourWeekRewardsPilot');
    expect(servicePointsPage).toContain('今日から4週間に設定する');
    expect(servicePointsPage).toContain('全員が自動で対象になります。');
    expect(servicePointsPage).not.toContain('replacePilotMembers');
    expect(servicePointsPage).not.toContain('name="membershipIds"');
    expect(servicePointsPage).not.toContain('期間の設定はシステム管理者へ依頼してください。');
  });

  it('shows operators whether the 4-week pilot is ready to start', () => {
    expect(servicePointsPage).toContain('buildRewardsPilotReadiness');
    expect(servicePointsPage).toContain('4週間の試験を始める前の確認');
    expect(servicePointsPage).toContain('準備完了です。試験を開始できます。');
    expect(servicePointsPage).toContain('あと{pilotReadiness.missingCount}項目の設定が必要です。');
    expect(servicePointsPage).toContain('この設定を直す');
    expect(servicePointsPage).toContain("'#point-control'");
    expect(servicePointsPage).toContain("'#point-rules'");
    expect(servicePointsPage).toContain('configuredPilotPeriodLabel ?? pilotPeriodLabel');
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

  it('warns operators about service expiration', () => {
    expect(servicePointsPage).toContain('サービスの試験利用終了日が近づいています');
    expect(servicePointsPage).not.toContain('参加者の試験利用終了日が近づいています');
  });
});
