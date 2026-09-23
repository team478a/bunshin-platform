'use client';

import { RewardsActionFeedback } from '../../../ui/rewards-action-feedback';
import type {
  ActivityMotivationView,
  MissionProgressView,
} from '../../../../src/activity-progress';
import type { DailyMissionView } from './daily-mission-content';
import { PersonalDailyMissionList } from './personal-daily-mission-list';
import {
  usePersonalDailyMissionController,
  type PersonalSocialProfileView,
} from './personal-daily-mission-controller';
import {
  PersonalDailyMissionGenerator,
  PersonalDailyMissionProgress,
} from './personal-daily-mission-overview';

export * from './daily-mission-content';

export function DailyMissionSection({
  workspaceId,
  bunshinId,
  capabilityStatus,
  profiles,
  missions,
  variantPointCost,
  rewardsPilotActive,
  progress,
  motivation,
  localDate,
}: {
  workspaceId: string;
  bunshinId: string;
  capabilityStatus: 'ACTIVE' | 'SUSPENDED' | 'LOCKED' | null;
  profiles: PersonalSocialProfileView[];
  missions: DailyMissionView[];
  variantPointCost: number | null;
  rewardsPilotActive: boolean;
  progress: MissionProgressView;
  motivation: ActivityMotivationView;
  localDate: string;
}) {
  const controller = usePersonalDailyMissionController({
    workspaceId,
    bunshinId,
    capabilityStatus,
    profiles,
    variantPointCost,
    rewardsPilotActive,
  });
  const { active, pendingAction, error, pointNotice, resubmitMissionId, busy } = controller;

  return (
    <section className="mission-experience">
      <header className="mission-experience__header">
        <p className="eyebrow">今日のおすすめ</p>
        <h2>今日やること</h2>
        <p>投稿案を確認して、使いたいものを選びましょう。</p>
      </header>
      <PersonalDailyMissionProgress progress={progress} motivation={motivation} />
      {active && <PersonalDailyMissionGenerator missions={missions} controller={controller} />}
      {pendingAction && (
        <div className="notice" role="status">
          操作を保存しています…
        </div>
      )}
      {error && (
        <div className="notice notice--danger" role="alert">
          {error}
        </div>
      )}
      <RewardsActionFeedback action={pointNotice} workspaceId={workspaceId} />
      {resubmitMissionId && (
        <div className="notice">
          <p>案内を確認したら、運営者へもう一度確認をお願いできます。</p>
          <button
            className="button button--secondary"
            type="button"
            disabled={busy}
            onClick={() => void controller.resubmitForApproval(resubmitMissionId)}
          >
            もう一度確認をお願いする
          </button>
        </div>
      )}
      <PersonalDailyMissionList
        workspaceId={workspaceId}
        missions={missions}
        progress={progress}
        localDate={localDate}
        controller={controller}
      />
    </section>
  );
}
