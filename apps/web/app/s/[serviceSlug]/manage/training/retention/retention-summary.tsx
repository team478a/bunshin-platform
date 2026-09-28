import Link from 'next/link';
import type { Route } from 'next';
import {
  TRAINING_RETENTION_MAX_ENROLLMENTS,
  type TrainingRetentionPreviewResult,
} from '@bunshin/capability-training';

export function TrainingRetentionSummary({
  serviceSlug,
  checkedAt,
  result,
}: {
  serviceSlug: string;
  checkedAt: Date;
  result: TrainingRetentionPreviewResult | { outcome: 'UNAVAILABLE' };
}) {
  const summary = result.outcome === 'PREVIEW' ? result.summary : null;
  const metrics = summary
    ? ([
        ['対象の受講記録', summary.enrollments],
        ['回答・評価の期限対象（回答件数）', summary.answersAndEvaluationsDue],
        ['仕事情報の期限対象（プロフィール件数）', summary.workProfilesDue],
        ['点数の期限対象（プロフィール件数）', summary.scoreProfilesDue],
        ['進捗の期限対象（スナップショット件数）', summary.progressSnapshotsDue],
        ['保存Toolkit（保持件数）', summary.retainedToolkit],
      ] as const)
    : [];
  return (
    <>
      <header className="app-page__heading">
        <p className="eyebrow">サービス管理者・読み取り専用</p>
        <h1>AI研修データの保持期限</h1>
        <p>このサービスの期限対象と、判定できない受講記録を件数で確認します。</p>
        <Link href={`/s/${serviceSlug}/manage/training` as Route}>← AI研修の管理へ戻る</Link>
      </header>
      <section className="settings-card">
        <h2>確認だけを行います</h2>
        <p>この画面を開いても、データの削除・終了日時の補完・定期実行の開始は行いません。</p>
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
        <a href={`/s/${serviceSlug}/manage/training/retention`}>最新の件数を再確認する</a>
      </section>
      {summary ? (
        <>
          <section className="settings-card">
            <h2>保持期限の対象件数</h2>
            <div className="weekly-report__metrics">
              {metrics.map(([label, count]) => (
                <article key={label}>
                  <strong>{count}</strong>
                  <span>{label}</span>
                </article>
              ))}
            </div>
            <p>
              停止・退会済みの参加者を含む、AI研修の受講記録を集計しています。人数ではありません。
            </p>
            <p>
              仕事情報と点数は同じプロフィールに含まれます。各件数を合算して削除行数と扱わないでください。
            </p>
            <p>保存Toolkitは期限対象の回答から保存したものだけでなく、保持する全件の数です。</p>
          </section>
          <section className="settings-card">
            <h2>判定を保留している受講記録</h2>
            <dl>
              <div>
                <dt>終了日が不明</dt>
                <dd>{summary.endDateUnresolved}件</dd>
              </div>
              <div>
                <dt>所有境界を確認できない</dt>
                <dd>{summary.ownershipUnresolved}件</dd>
              </div>
            </dl>
            <p>
              終了日が不明な記録は、仕事情報・進捗・点数の期限を判定しません。回答の90日期限は独立して判定します。
            </p>
            <p>所有境界を確認できない記録は、個人データの対象件数から除外しています。</p>
            {(summary.endDateUnresolved > 0 || summary.ownershipUnresolved > 0) && (
              <p role="status">
                判定保留があります。対象件数が0件でも、すべての期限を確認できたことにはなりません。
              </p>
            )}
          </section>
        </>
      ) : (
        <section className="settings-card" role="alert">
          <h2>件数を確認できませんでした</h2>
          <p>
            {result.outcome === 'TOO_LARGE'
              ? `集計上限（受講記録${TRAINING_RETENTION_MAX_ENROLLMENTS}件・プログラム1000件）を超えています。部分的な件数は表示しません。運営担当者へ確認してください。`
              : 'データの取得に失敗しました。0件とは判定していません。時間をおいて再確認してください。'}
          </p>
        </section>
      )}
      <section className="settings-card">
        <h2>保持期限のルール</h2>
        <ul>
          <li>回答本文・評価：回答の作成から90日</li>
          <li>仕事情報：確定した研修終了から90日</li>
          <li>学習進捗・点数：確定した研修終了から暦年の1年</li>
          <li>本人が保存したToolkit：期限処理では保持</li>
        </ul>
        <p>
          確定した終了記録を使用します。期限終了の過去の予定終了日を除き、予定終了日や更新日時から実際の終了日を推定しません。
        </p>
        <p>
          本文・評価・仕事情報・点数・Toolkitの内容や個人名は表示しません。バックアップ、外部Provider、端末に保存したExportの消去を保証する確認ではありません。
        </p>
      </section>
    </>
  );
}
