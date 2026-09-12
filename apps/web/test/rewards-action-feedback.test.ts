import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const personalPage = source('../app/(app)/bunshins/[bunshinId]/page.tsx');
const personalMission = source('../app/(app)/bunshins/[bunshinId]/daily-mission-section.tsx');
const servicePage = source('../app/s/[serviceSlug]/bunshins/[bunshinId]/page.tsx');
const serviceMission = source(
  '../app/s/[serviceSlug]/bunshins/[bunshinId]/service-daily-mission-section.tsx',
);
const feedback = source('../app/ui/rewards-action-feedback.tsx');

describe('rewards action feedback', () => {
  it.each([personalPage, servicePage])('checks the active pilot on the server', (page) => {
    expect(page).toContain('getActiveRewardsPilotAccess');
    expect(page).toContain('.catch(() => null)');
    expect(page).toContain('rewardsPilotActive={rewardsPilotActive}');
  });

  it.each([personalMission, serviceMission])(
    'shows feedback only after a recorded eligible action',
    (mission) => {
      expect(mission).toContain("setPointNotice('VIEWED')");
      expect(mission).toContain("setPointNotice('POSTED')");
      expect(mission).toContain('recorded && rewardsPilotActive');
      expect(mission).toContain('RewardsActionFeedback');
    },
  );

  it('explains delayed reflection and links to the correct workspace balance', () => {
    expect(feedback).toContain('ポイント対象として記録しました。');
    expect(feedback).toContain('通常1分以内に反映されます');
    expect(feedback).toContain('1日1回まで');
    expect(feedback).toContain('/points?workspaceId=');
    expect(serviceMission).toContain('serviceSlug={serviceSlug}');
    expect(serviceMission).toContain('&serviceSlug=');
  });
});
