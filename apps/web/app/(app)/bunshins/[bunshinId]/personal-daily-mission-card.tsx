'use client';

import type { MissionProgressView } from '../../../../src/activity-progress';
import { platformLabels, type DailyMissionView } from './daily-mission-content';
import type { PersonalDailyMissionController } from './personal-daily-mission-controller';
import { PersonalDailyMissionDetail } from './personal-daily-mission-detail';

const formatLabel = (format: DailyMissionView['format']) => {
  if (format === 'TEXT') return '文章';
  if (format === 'SLIDE') return 'スライド';
  if (format === 'IMAGE') return '画像';
  if (format === 'LIVE_ACTION') return '自分で撮る動画';
  return 'AI動画の作り方';
};

export function PersonalDailyMissionCard({
  workspaceId,
  mission,
  progress,
  localDate,
  controller,
}: {
  workspaceId: string;
  mission: DailyMissionView;
  progress: MissionProgressView;
  localDate: string;
  controller: PersonalDailyMissionController;
}) {
  const activitySaved = progress.weekly.days.some(
    (day) => day.dailyMissionId === mission.id && day.status !== 'UNSEEN',
  );
  const expanded = controller.expanded === mission.id;

  return (
    <li className="mission-card">
      <h3>
        {mission.missionDate} — {mission.topic}
      </h3>
      <div className="mission-meta">
        <span>{mission.platform ? platformLabels[mission.platform] : 'SNS'}</span>
        <span>{formatLabel(mission.format)}</span>
        <span>約{mission.estimatedMinutes}分</span>
        {mission.classification !== 'ORGANIC' ? (
          <span>
            {mission.classification === 'ADVERTISEMENT'
              ? '商品を紹介する企画（PR）'
              : '商品に関係する企画'}
          </span>
        ) : null}
      </div>
      <p className="mission-reason">{mission.reason}</p>
      {controller.active && mission.missionDate === localDate && !activitySaved ? (
        <div className="mission-continuity-actions">
          <button
            className="button button--primary"
            type="button"
            disabled={controller.busy}
            onClick={() => void controller.continuity(mission.id, 'CONFIRMED')}
          >
            確認しました
          </button>
          <button
            className="button button--secondary"
            type="button"
            disabled={controller.busy}
            onClick={() => void controller.continuity(mission.id, 'RESTED')}
          >
            今日は休む
          </button>
        </div>
      ) : null}
      {mission.missionDate === localDate && activitySaved ? (
        <p className="mission-continuity-saved" role="status">
          今日の活動を保存しました
        </p>
      ) : null}
      <button
        type="button"
        disabled={controller.busy}
        onClick={() => void controller.view(mission)}
      >
        {expanded ? '閉じる' : '内容を見る'}
      </button>{' '}
      {controller.active && ['GENERATED', 'VIEWED'].includes(mission.status) ? (
        <button
          type="button"
          disabled={controller.busy}
          onClick={() => void controller.transition(mission.id, 'started')}
        >
          開始する
        </button>
      ) : null}{' '}
      {controller.active && ['GENERATED', 'VIEWED', 'STARTED'].includes(mission.status) ? (
        <>
          <button
            type="button"
            disabled={controller.busy}
            onClick={() => void controller.transition(mission.id, 'completed')}
          >
            完了
          </button>{' '}
          <button
            type="button"
            disabled={controller.busy}
            onClick={() => void controller.transition(mission.id, 'skipped')}
          >
            今日は見送る
          </button>
        </>
      ) : null}
      {expanded ? (
        <PersonalDailyMissionDetail
          workspaceId={workspaceId}
          mission={mission}
          controller={controller}
        />
      ) : null}
    </li>
  );
}
