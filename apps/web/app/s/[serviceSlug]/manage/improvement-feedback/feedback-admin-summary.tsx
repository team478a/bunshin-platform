import type { FeedbackAdminPreview } from '../../../../../src/services/improvement-feedback-admin-preview';
import { FeedbackReviewControl } from './feedback-review-control';

export function FeedbackAdminSummary({
  preview,
  reviewEndpoint,
}: {
  preview: FeedbackAdminPreview;
  reviewEndpoint?: string;
}) {
  return (
    <section className="settings-card">
      <h2>
        {preview.week}〜{preview.endDate}の保存報告
      </h2>
      <p>日本時間の月曜0時から翌月曜0時まで。読取上限は1,000件です。</p>
      {preview.state === 'INCOMPLETE' ? (
        <p>
          読取が不完全のため判定保留です。全体件数・詳細は表示しません。0件とは判定していません。
        </p>
      ) : preview.state === 'SUPPRESSED' ? (
        <p>
          少人数の集計を含むため、件数と詳細を伏せています。報告がない、または問題が解決したという意味ではありません。
        </p>
      ) : preview.state === 'EMPTY' ? (
        <p>この週の保存報告はありません。利用者が困っていないことの証明ではありません。</p>
      ) : (
        <>
          <p>
            保存報告 {preview.totals?.reports}件／報告者 {preview.totals?.reporters}人
          </p>
          <ul>
            {preview.buckets.map((bucket, index) => (
              <li key={index}>
                <h3>
                  {bucket.category}・{bucket.surface}・{bucket.impact}
                </h3>
                {reviewEndpoint && bucket.reviewHandle && (
                  <FeedbackReviewControl
                    key={bucket.reviewHandle}
                    endpoint={reviewEndpoint}
                    selectionHandle={bucket.reviewHandle}
                  />
                )}
                <p>
                  {bucket.reports}件／{bucket.reporters}人 — {bucket.decision}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
      <p>
        原因・技術的な再現・外部サービスの障害は未確認です。利用者の母集団、発生率、解決率、原価は未測定です。
      </p>
      <p>
        5人未満の集計が1つでもあれば全体を伏せます。この基準や固定の週は、匿名化や再識別防止を保証するものではありません。
      </p>
      <p>
            受付ID、個人名、本文、写真、Memoryは表示しません。実装承認・自動修正・通知・CSV出力は行いません。
      </p>
      <small>
        表示方針: {preview.policyVersion}／確認ルール: {preview.ruleVersion}
      </small>
    </section>
  );
}
