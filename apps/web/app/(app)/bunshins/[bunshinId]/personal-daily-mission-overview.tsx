'use client';

import {
  progressStatusLabel,
  weeklyCalendar,
  type ActivityMotivationView,
  type MissionProgressView,
} from '../../../../src/activity-progress';
import { platformLabels, type DailyMissionView } from './daily-mission-content';
import type { PersonalDailyMissionController } from './personal-daily-mission-controller';

export function PersonalDailyMissionProgress({
  progress,
  motivation,
}: {
  progress: MissionProgressView;
  motivation: ActivityMotivationView;
}) {
  const calendar = weeklyCalendar(progress);

  return (
    <section className="activity-progress" aria-labelledby="activity-progress-title">
      {motivation.dormant && motivation.returnMessage && (
        <p className="notice success">{motivation.returnMessage}</p>
      )}
      <div className="activity-progress__summary">
        <div>
          <p className="eyebrow">今週の活動</p>
          <h3 id="activity-progress-title">
            {progress.remainingConfirmations === 0
              ? '今週の目標を達成しました'
              : `あと${progress.remainingConfirmations}回、内容を確認しましょう`}
          </h3>
        </div>
        <strong>
          {progress.weekly.confirmedDays} / {progress.weeklyGoal}回
        </strong>
      </div>
      <div className="activity-motivation">
        <p className="eyebrow">いまの発信ステップ</p>
        <h3>{motivation.stepLabel}</h3>
        {motivation.badges.length > 0 && (
          <ul aria-label="できるようになったこと">
            {motivation.badges.map((badge) => (
              <li key={`${badge.badgeKey}:${badge.ruleVersion}`}>
                <strong>{badge.labelSnapshot}</strong> — {badge.descriptionSnapshot}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="activity-calendar" aria-label="今週の活動カレンダー">
        {calendar.map((day) => (
          <div
            className={`activity-calendar__day activity-calendar__day--${day.status.toLowerCase()}`}
            key={day.missionDate}
          >
            <time dateTime={day.missionDate}>
              {new Intl.DateTimeFormat('ja-JP', { weekday: 'short' }).format(
                new Date(`${day.missionDate}T00:00:00.000Z`),
              )}
            </time>
            <span>{progressStatusLabel[day.status]}</span>
          </div>
        ))}
      </div>
      <p>これまでに活動した日：{progress.cumulative.activeDays}日</p>
    </section>
  );
}

export function PersonalDailyMissionGenerator({
  missions,
  controller,
}: {
  missions: DailyMissionView[];
  controller: PersonalDailyMissionController;
}) {
  const {
    activeProfiles,
    missionDate,
    socialProfileId,
    busy,
    generating,
    setMissionDate,
    setSocialProfileId,
    generate,
  } = controller;

  return (
    <div className="mission-generator">
      <div className="mission-generator__heading">
        <h3>今日の案を準備する</h3>
        <p>投稿先を選んで、今日やることを1つ作ります。</p>
      </div>
      <label className="field">
        <span className="field__label">日付</span>
        <input
          className="field__control"
          type="date"
          value={missionDate}
          onChange={(event) => setMissionDate(event.target.value)}
        />
      </label>{' '}
      <label className="field">
        <span className="field__label">投稿するSNS</span>
        <select
          className="field__control"
          value={socialProfileId}
          onChange={(event) => setSocialProfileId(event.target.value)}
        >
          {activeProfiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {platformLabels[profile.platform]}
            </option>
          ))}
        </select>
      </label>{' '}
      <button
        className="button button--primary button--full"
        type="button"
        disabled={
          busy ||
          !missionDate ||
          !socialProfileId ||
          missions.some((mission) => mission.missionDate === missionDate)
        }
        onClick={() => void generate()}
      >
        {generating ? '考えています…' : '今日の投稿案を作る'}
      </button>
      {activeProfiles.length === 0 && (
        <p className="mission-generator__notice">先に、使いたいSNSを登録してください。</p>
      )}
    </div>
  );
}
