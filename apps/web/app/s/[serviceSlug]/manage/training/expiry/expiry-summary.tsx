import type { Route } from 'next';
import Link from 'next/link';
import type { TrainingEnrollmentExpiryAdminPreviewResult } from '@bunshin/capability-training';

export function TrainingEnrollmentExpirySummary({
  serviceSlug,
  checkedAt,
  result,
}: {
  serviceSlug: string;
  checkedAt: Date;
  result: TrainingEnrollmentExpiryAdminPreviewResult | { outcome: 'UNAVAILABLE' };
}) {
  const summary = result.outcome === 'PREVIEW' ? result.summary : null;
  return (
    <>
      <header className="app-page__heading">
        <p className="eyebrow">サービス管理者・読み取り専用</p>
        <h1>AI研修の期限終了対象</h1>
        <p>無料・手動登録のうち、受講期間を過ぎた対象件数だけを確認します。</p>
        <Link href={`/s/${serviceSlug}/manage/training` as Route}>← AI研修の管理へ戻る</Link>
      </header>
      <section className="settings-card">
        <h2>確認だけを行います</h2>
        <p>この画面を開いても、受講状態の変更、評価停止、通知、Provider呼び出しは行いません。</p>
        <p>
          確認時刻：
          <time dateTime={checkedAt.toISOString()}>
            {new Intl.DateTimeFormat('ja-JP', {
              dateStyle: 'medium',
              timeStyle: 'short',
              timeZone: 'Asia/Tokyo',
            }).format(checkedAt)}
            （日本時間）
          </time>
        </p>
        <a href={`/s/${serviceSlug}/manage/training/expiry`}>最新の件数を再確認する</a>
      </section>
      {summary ? (
        <section className="settings-card">
          <h2>期限終了の対象件数</h2>
          <div className="weekly-report__metrics">
            <article>
              <strong>{summary.eligible}</strong>
              <span>対象の受講記録</span>
            </article>
            <article>
              <strong>{summary.batchLimit}</strong>
              <span>1回の処理上限</span>
            </article>
            <article>
              <strong>{summary.requiredBatches}</strong>
              <span>必要な処理回数</span>
            </article>
          </div>
          {summary.hasMore && (
            <p role="status">1回の上限を超えています。連続実行の承認なしに処理を開始しません。</p>
          )}
          <p>
            対象は、受講中・開始日時確定・期限到達・AI研修・一般参加者で、有料購入に紐づかない受講です。
          </p>
          <p>
            人数ではなく受講記録の件数です。表示結果は確認時点のスナップショットで、実行時の再検証を省略できません。
          </p>
        </section>
      ) : (
        <section className="settings-card" role="alert">
          <h2>件数を確認できませんでした</h2>
          <p>0件とは判定していません。時間をおいて再確認するか、運営担当者へ確認してください。</p>
        </section>
      )}
      <section className="settings-card">
        <h2>この画面に含まれないこと</h2>
        <ul>
          <li>本番の期限終了処理や定期実行の有効化</li>
          <li>回答・評価・仕事情報・参加者名の表示</li>
          <li>課金済み受講の終了、返金、契約期間の変更</li>
          <li>保持期限による研修データの削除</li>
        </ul>
      </section>
    </>
  );
}
