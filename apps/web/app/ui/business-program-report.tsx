import type { BusinessProgramReport } from '../../src/services/business-program-report-data';
import {
  SOCIAL_INSIGHT_METRIC_KEYS,
  socialInsightLabels,
} from '../../src/services/social-insights';

const dateLabel = (value: string) =>
  new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' }).format(
    new Date(`${value}T00:00:00.000Z`),
  );

export function BusinessProgramReportView({ report }: { report: BusinessProgramReport }) {
  return (
    <div className="business-program-report">
      <section className="service-entry__card business-program-report__hero">
        <p className="eyebrow">90日集客レポート・第{report.cycleNumber}期</p>
        <h2>
          {report.complete ? '90日間の結果がまとまりました' : `${report.day}日目までの成果です`}
        </h2>
        <p>
          {dateLabel(report.startedOn)}〜
          {dateLabel(report.complete ? report.endedOn : report.reportThrough)}
        </p>
        <div
          className="business-roadmap__progress"
          role="progressbar"
          aria-label="90日間の進み具合"
          aria-valuemin={1}
          aria-valuemax={90}
          aria-valuenow={report.day}
        >
          <span style={{ width: `${report.progressPercent}%` }} />
        </div>
      </section>

      <section className="service-entry__card" aria-labelledby="program-actions">
        <h2 id="program-actions">続けてできたこと</h2>
        <div className="weekly-report__metrics">
          <article>
            <strong>{report.totals.posts}</strong>
            <span>投稿</span>
          </article>
          <article>
            <strong>{report.totals.activeDays}</strong>
            <span>活動した日</span>
          </article>
          <article>
            <strong>{report.totals.materials}</strong>
            <span>追加した素材</span>
          </article>
          <article>
            <strong>{report.totals.pointsEarned}</strong>
            <span>獲得ポイント</span>
          </article>
          <article>
            <strong>{report.totals.pointsUsed}</strong>
            <span>利用ポイント</span>
          </article>
          <article>
            <strong>{report.totals.badges.length}</strong>
            <span>獲得バッジ</span>
          </article>
        </div>
        {report.totals.badges.length ? (
          <ul className="weekly-report__badges">
            {report.totals.badges.map((badge) => (
              <li key={badge}>🏅 {badge}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="service-entry__card" aria-labelledby="program-outcomes">
        <p className="eyebrow">お客様につながった結果</p>
        <h2 id="program-outcomes">集客成果 {report.totals.outcomeTotal}件</h2>
        <div className="weekly-report__metrics">
          <article>
            <strong>{report.totals.outcomes.inquiries}</strong>
            <span>問い合わせ</span>
          </article>
          <article>
            <strong>{report.totals.outcomes.reservations}</strong>
            <span>予約</span>
          </article>
          <article>
            <strong>{report.totals.outcomes.visits}</strong>
            <span>来店</span>
          </article>
          <article>
            <strong>{report.totals.outcomes.repeatReservations}</strong>
            <span>再予約</span>
          </article>
          <article>
            <strong>{report.totals.outcomes.repeatVisits}</strong>
            <span>再来店</span>
          </article>
          <article>
            <strong>{report.totals.outcomes.orders}</strong>
            <span>購入・申込</span>
          </article>
          <article>
            <strong>{report.totals.outcomes.other}</strong>
            <span>その他</span>
          </article>
        </div>
        {report.totals.outcomeTotal === 0 ? (
          <p>成果が0件でも問題ありません。記録が、次に試す内容を決める材料になります。</p>
        ) : null}
      </section>

      <section className="service-entry__card" aria-labelledby="program-topics">
        <h2 id="program-topics">反応があった投稿テーマ</h2>
        {report.successfulTopics.length ? (
          <ol className="business-program-report__topics">
            {report.successfulTopics.map((item) => (
              <li key={item.topic}>
                <strong>{item.topic}</strong>
                <span>
                  投稿 {item.posts}件／お客様の反応 {item.outcomes}件
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p>投稿後の反応を記録すると、ここに続けたいテーマが表示されます。</p>
        )}
      </section>

      <section className="service-entry__card" aria-labelledby="program-sns">
        <p className="eyebrow">開始時からの変化</p>
        <h2 id="program-sns">SNSの数字</h2>
        {report.socialInsight ? (
          <>
            <p>
              {report.socialInsight.start.observedOn.replaceAll('-', '/')} と{' '}
              {report.socialInsight.latest.observedOn.replaceAll('-', '/')} の記録を比べています。
            </p>
            <div className="business-program-report__comparison">
              {SOCIAL_INSIGHT_METRIC_KEYS.map((key) => {
                const start = report.socialInsight?.start[key] ?? null;
                const latest = report.socialInsight?.latest[key] ?? null;
                if (start === null && latest === null) return null;
                const change = report.socialInsight?.changes[key] ?? null;
                return (
                  <article key={key}>
                    <span>{socialInsightLabels[key]}</span>
                    <strong>
                      {start === null ? '記録なし' : start.toLocaleString('ja-JP')} →{' '}
                      {latest === null ? '記録なし' : latest.toLocaleString('ja-JP')}
                    </strong>
                    <small>
                      {change === null
                        ? '比較できません'
                        : `${change >= 0 ? '+' : ''}${change.toLocaleString('ja-JP')}`}
                    </small>
                  </article>
                );
              })}
            </div>
          </>
        ) : (
          <p>開始時と現在の数字を1回ずつ記録すると、ここで変化を確認できます。</p>
        )}
      </section>

      <section
        className="service-entry__card business-program-report__next"
        aria-labelledby="program-next"
      >
        <p className="eyebrow">次の90日で続けること</p>
        <h2 id="program-next">この3つを繰り返します</h2>
        <ol>
          <li>
            <strong>{report.nextPlan.weekdays}</strong>を目安に投稿案を使う
          </li>
          <li>
            「<strong>{report.nextPlan.topic}</strong>」を写真や言葉を変えて伝える
          </li>
          <li>
            投稿の最後に「<strong>{report.nextPlan.destination}</strong>」への案内を入れる
          </li>
        </ol>
      </section>
    </div>
  );
}
