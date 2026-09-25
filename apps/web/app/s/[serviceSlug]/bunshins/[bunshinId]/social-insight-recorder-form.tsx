'use client';

import {
  SOCIAL_INSIGHT_METRIC_KEYS,
  socialInsightLabels,
  type SocialInsightMetricKey,
} from '../../../../../src/services/social-insights';
import {
  POST_PERFORMANCE_METRIC_KEYS,
  postPerformanceLabels,
  type PostPerformanceMetricKey,
} from '../../../../../src/services/post-performance';
import {
  platformLabels,
  type PostedMissionOption,
  type SocialProfileOption,
} from './social-insight-recorder-types';
import type { SocialInsightRecorderController } from './use-social-insight-recorder';

export function SocialInsightRecorderForm({
  profiles,
  postedMissions,
  controller,
}: {
  profiles: SocialProfileOption[];
  postedMissions: PostedMissionOption[];
  controller: SocialInsightRecorderController;
}) {
  const { draft, mode, busy } = controller;
  const metricKeys = mode === 'POST' ? POST_PERFORMANCE_METRIC_KEYS : SOCIAL_INSIGHT_METRIC_KEYS;

  return (
    <>
      <div className="social-insight-recorder__mode" role="group" aria-label="記録する数字">
        <button
          type="button"
          aria-pressed={mode === 'POST'}
          disabled={!postedMissions.length || busy !== null}
          onClick={() => controller.selectMode('POST')}
        >
          投稿ごとの反応
        </button>
        <button
          type="button"
          aria-pressed={mode === 'ACCOUNT'}
          disabled={busy !== null}
          onClick={() => controller.selectMode('ACCOUNT')}
        >
          フォロワーなど全体の数字
        </button>
      </div>
      {mode === 'POST' && postedMissions.length ? (
        <label className="social-insight-recorder__post-select">
          どの投稿の数字ですか？
          <select
            value={controller.selectedMissionId}
            onChange={(event) => controller.setSelectedMissionId(event.target.value)}
          >
            {postedMissions.map((mission) => (
              <option key={mission.id} value={mission.id}>
                {mission.postedAt.slice(0, 10).replaceAll('-', '/')}・{mission.topic}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {profiles.length === 0 ? (
        <p>先に「細かい設定」から、使うSNSを登録してください。</p>
      ) : (
        <>
          <label className="social-insight-recorder__file">
            スクリーンショットを選ぶ
            <input
              ref={controller.file}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy !== null}
              onChange={(event) => void controller.selectImage(event.target.files?.[0])}
            />
          </label>
          {controller.image ? (
            <button
              className="button button--primary button--full"
              type="button"
              disabled={busy !== null}
              onClick={() => void controller.extract()}
            >
              {busy === 'READING' ? '読み取り中…' : '画像の数字を読み取る'}
            </button>
          ) : null}
          <button
            className="social-insight-recorder__manual"
            type="button"
            disabled={busy !== null}
            onClick={controller.startManualEntry}
          >
            画像がない場合は手で入力する
          </button>
        </>
      )}
      {controller.message ? (
        <p className="social-insight-recorder__message" role="status">
          {controller.message}
        </p>
      ) : null}

      {draft ? (
        <div className="social-insight-recorder__confirm">
          <h3>読み取った数字を確認</h3>
          <p>違う数字があれば、ここで直せます。空欄のままでも保存できます。</p>
          {draft.confidence !== null && draft.confidence < 75 ? (
            <p className="notice notice--warning">
              画像が少し読みにくかったため、数字をよく確認してください。
            </p>
          ) : null}
          {draft.note ? <p className="notice notice--warning">{draft.note}</p> : null}
          {mode === 'ACCOUNT' ? (
            <label>
              SNS
              <select
                value={controller.selectedProfileId}
                onChange={(event) => controller.setSelectedProfileId(event.target.value)}
              >
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {platformLabels[profile.platform] ?? profile.platform}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            記録日
            <input
              type="date"
              value={draft.observedOn}
              onChange={(event) =>
                controller.setDraft({ ...draft, observedOn: event.target.value })
              }
            />
          </label>
          {mode === 'ACCOUNT' ? (
            <div className="social-insight-recorder__period">
              <label>
                集計の開始日（分かる場合）
                <input
                  type="date"
                  value={draft.periodStart}
                  onChange={(event) =>
                    controller.setDraft({ ...draft, periodStart: event.target.value })
                  }
                />
              </label>
              <label>
                集計の終了日（分かる場合）
                <input
                  type="date"
                  value={draft.periodEnd}
                  onChange={(event) =>
                    controller.setDraft({ ...draft, periodEnd: event.target.value })
                  }
                />
              </label>
            </div>
          ) : null}
          <div className="social-insight-recorder__metrics">
            {metricKeys.map((key) => (
              <label key={key}>
                {mode === 'POST'
                  ? postPerformanceLabels[key as PostPerformanceMetricKey]
                  : socialInsightLabels[key as SocialInsightMetricKey]}
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={2_000_000_000}
                  value={draft[key] ?? ''}
                  placeholder="分からなければ空欄"
                  onChange={(event) => controller.updateMetric(key, event.target.value)}
                />
              </label>
            ))}
          </div>
          <button
            className="button button--primary button--full"
            type="button"
            disabled={
              busy !== null ||
              (mode === 'POST' ? !controller.selectedMissionId : !controller.selectedProfileId) ||
              !draft.observedOn ||
              metricKeys.every((key) => draft[key] === null)
            }
            onClick={() => void controller.save()}
          >
            {busy === 'SAVING' ? '保存中…' : 'この内容で記録する'}
          </button>
        </div>
      ) : null}
    </>
  );
}
