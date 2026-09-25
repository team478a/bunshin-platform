'use client';

import type { MissionProgressView } from '../../../../src/activity-progress';
import type { DailyMissionView } from './daily-mission-content';
import { PersonalDailyMissionCard } from './personal-daily-mission-card';
import type { PersonalDailyMissionController } from './personal-daily-mission-controller';

export type PersonalDailyMissionListProps = {
  workspaceId: string;
  missions: DailyMissionView[];
  progress: MissionProgressView;
  localDate: string;
  controller: PersonalDailyMissionController;
};

export function PersonalDailyMissionList({
  workspaceId,
  missions,
  progress,
  localDate,
  controller,
}: PersonalDailyMissionListProps) {
  if (missions.length === 0) {
    return (
      <div className="mission-empty">
        <strong>今日の投稿案はまだありません</strong>
        <p>SNS設定と週間計画を準備すると、投稿案を作成できます。</p>
      </div>
    );
  }

  return (
    <ul className="mission-list">
      {missions.map((mission) => (
        <PersonalDailyMissionCard
          key={mission.id}
          workspaceId={workspaceId}
          mission={mission}
          progress={progress}
          localDate={localDate}
          controller={controller}
        />
      ))}
    </ul>
  );
}
