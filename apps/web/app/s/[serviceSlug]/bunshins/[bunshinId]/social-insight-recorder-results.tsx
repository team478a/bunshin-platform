import {
  SOCIAL_INSIGHT_METRIC_KEYS,
  socialInsightChanges,
  socialInsightLabels,
  type SocialInsightSnapshotView,
} from '../../../../../src/services/social-insights';
import {
  buildPostPerformanceInsight,
  type PostPerformanceView,
} from '../../../../../src/services/post-performance';
import {
  changeText,
  numberText,
  platformLabels,
  type SocialInsightRecorderMode,
} from './social-insight-recorder-types';

export function SocialInsightRecorderResults({
  mode,
  snapshots,
  postPerformances,
}: {
  mode: SocialInsightRecorderMode;
  snapshots: SocialInsightSnapshotView[];
  postPerformances: PostPerformanceView[];
}) {
  const latest = snapshots[0] ?? null;
  const previous =
    snapshots.find(
      (item) => latest && item.socialProfileId === latest.socialProfileId && item.id !== latest.id,
    ) ?? null;
  const changes = latest ? socialInsightChanges(latest, previous) : null;
  const postInsight = buildPostPerformanceInsight(postPerformances);

  return (
    <>
      {postPerformances.length ? (
        <div className="social-insight-recorder__latest social-insight-recorder__analysis">
          <p className="eyebrow">自動分析</p>
          <h3>{postInsight.title}</h3>
          {postInsight.bestTopic ? <p>反応を比べる基準：{postInsight.bestTopic}</p> : null}
          <p>{postInsight.guidance}</p>
          <div className="social-insight-recorder__post-history">
            {postPerformances.slice(0, 5).map((item) => (
              <article key={item.dailyMissionId}>
                <strong>{item.topic}</strong>
                <span>
                  {item.observedOn.replaceAll('-', '/')}・いいね {numberText(item.likes)}・保存{' '}
                  {numberText(item.saves)}・フォロー {numberText(item.follows)}
                </span>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {mode === 'ACCOUNT' && latest ? (
        <div className="social-insight-recorder__latest">
          <h3>最近の記録</h3>
          <p>
            {latest.observedOn.replaceAll('-', '/')}・
            {platformLabels[latest.platform] ?? latest.platform}
          </p>
          <div className="weekly-report__metrics">
            {SOCIAL_INSIGHT_METRIC_KEYS.map((key) =>
              latest[key] === null ? null : (
                <article key={key}>
                  <strong>{numberText(latest[key])}</strong>
                  <span>
                    {socialInsightLabels[key]}
                    {changeText(changes?.[key])}
                  </span>
                </article>
              ),
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
