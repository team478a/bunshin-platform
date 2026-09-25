'use client';

import {
  copyOptions,
  missionWithSelectedVariant,
  type DailyMissionView,
} from './daily-mission-content';
import type { PersonalDailyMissionController } from './personal-daily-mission-controller';

const feedbackOptions = [
  ['GOOD', '👍 自分らしい'],
  ['NEUTRAL', '😐 普通'],
  ['BAD', '👎 違う'],
] as const;

export function PersonalDailyMissionAccepted({
  mission,
  controller,
}: {
  mission: DailyMissionView;
  controller: PersonalDailyMissionController;
}) {
  const selected = controller.assistanceSelections[mission.id] ?? mission.assistanceLevel;

  return (
    <div className="mission-accepted">
      <p className="mission-step-complete">✓ 採用しました</p>
      {selected !== 'READY_TO_USE' ? <p>完成版を見ると、文章や台本をコピーできます。</p> : null}
      {selected === 'READY_TO_USE'
        ? copyOptions(missionWithSelectedVariant(mission)).map((option, index) => (
            <span key={`${option.type}-${index}`}>
              <button
                type="button"
                disabled={controller.busy}
                onClick={() =>
                  void controller.copy(
                    mission.id,
                    option.value,
                    option.type,
                    'metadata' in option ? option.metadata : undefined,
                  )
                }
              >
                {option.label}
              </button>{' '}
            </span>
          ))
        : null}
      {mission.postedAt === null ? (
        <div className="mission-post-action">
          <p className="mission-self-report-notice">
            SNSへ実際に投稿した後で押してください。投稿したかどうかは自動では確認されず、自己申告で記録されます。
          </p>
          <button
            type="button"
            disabled={controller.busy || mission.platform === null}
            onClick={() => void controller.markPosted(mission)}
          >
            投稿しました
          </button>
          {mission.platform === null ? (
            <p>投稿したことを記録するには、使うSNSを先に決めてください。</p>
          ) : null}
        </div>
      ) : (
        <div className="mission-feedback">
          <p className="mission-step-complete">✓ 投稿済み</p>
          <p>この投稿はあなたらしかったですか？</p>
          {feedbackOptions.map(([rating, label]) => (
            <button
              key={rating}
              type="button"
              aria-pressed={mission.feedback === rating}
              disabled={controller.busy || mission.feedback === rating}
              onClick={() => void controller.feedback(mission.id, rating)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
