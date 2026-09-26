'use client';

import { emptyBusinessOutcomes } from '../../../../../src/services/business-outcomes';
import {
  copyOptions,
  missionWithSelectedVariant,
  type DailyMissionView,
} from '../../../../(app)/bunshins/[bunshinId]/daily-mission-section';
import type { ServiceDailyMissionController } from './service-daily-mission-controller';

const feedbackOptions = [
  ['GOOD', '👍 自分らしい'],
  ['NEUTRAL', '😐 普通'],
  ['BAD', '👎 違う'],
] as const;

const businessOutcomeOptions = [
  ['inquiries', '問い合わせ'],
  ['reservations', '予約'],
  ['visits', '来店'],
  ['orders', '購入・申込'],
  ['other', 'その他の反応'],
] as const;

export function ServiceDailyMissionAccepted({
  mission,
  controller,
  businessFree,
}: {
  mission: DailyMissionView;
  controller: ServiceDailyMissionController;
  businessFree: boolean;
}) {
  const outcomes = controller.businessOutcomes[mission.id] ?? emptyBusinessOutcomes();

  return (
    <div className="mission-accepted">
      <p className="mission-step-complete">✓ 採用しました</p>
      {copyOptions(missionWithSelectedVariant(mission)).map((option, index) => (
        <button
          key={`${option.type}:${index}`}
          type="button"
          disabled={controller.pendingAction !== null}
          onClick={() =>
            void controller.copy(
              mission,
              option.value,
              option.type,
              'metadata' in option ? option.metadata : undefined,
            )
          }
        >
          {option.label}
        </button>
      ))}
      {mission.postedAt === null ? (
        <div className="mission-post-action">
          <p className="mission-self-report-notice">
            SNSへ実際に投稿した後で押してください。投稿したかどうかは自動では確認されず、自己申告で記録されます。
          </p>
          <button
            type="button"
            disabled={controller.pendingAction !== null || mission.platform === null}
            onClick={() => void controller.markPosted(mission)}
          >
            投稿しました
          </button>
          {mission.platform === null && (
            <p>投稿したことを記録するには、使うSNSを先に決めてください。</p>
          )}
        </div>
      ) : (
        <div className="mission-feedback">
          <p className="mission-step-complete">✓ 投稿済み</p>
          <p>この投稿は、あなたらしかったですか？</p>
          <small>回答は、次週の投稿形式や切り口をあなたに合わせるために使います。</small>
          {feedbackOptions.map(([rating, label]) => (
            <button
              key={rating}
              type="button"
              aria-pressed={mission.feedback === rating}
              disabled={controller.pendingAction !== null || mission.feedback === rating}
              onClick={() => void controller.feedback(mission.id, rating)}
            >
              {label}
            </button>
          ))}
          {businessFree ? (
            <section className="mission-business-outcomes">
              <h4>この投稿から、お客様の反応はありましたか？</h4>
              <p>なければ0のままで大丈夫です。お客様の名前は入力しません。</p>
              {businessOutcomeOptions.map(([key, label]) => (
                <label key={key}>
                  {label}の件数
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={999}
                    value={outcomes[key]}
                    onChange={(event) => {
                      const count = Math.max(
                        0,
                        Math.min(999, Number.parseInt(event.target.value || '0', 10) || 0),
                      );
                      controller.setBusinessOutcomes((current) => ({
                        ...current,
                        [mission.id]: {
                          ...(current[mission.id] ?? emptyBusinessOutcomes()),
                          [key]: count,
                        },
                      }));
                    }}
                  />
                </label>
              ))}
              <button
                type="button"
                disabled={controller.pendingAction !== null}
                onClick={() => void controller.saveBusinessOutcomes(mission.id)}
              >
                お客様の反応を保存する
              </button>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
