import type { Route } from 'next';
import Link from 'next/link';
import { PublicShell } from '../../../ui/public-shell';
import type { ServiceManagementHomeModel } from './service-management-home-data';

export function ServiceManagementHomeView({ model }: { model: ServiceManagementHomeModel }) {
  const {
    configuration,
    isBusinessDailyService,
    participantCount,
    readyCount,
    readiness,
    sentLineDeliveries,
    postedMissions,
    missionsCreated,
    acceptedMissions,
    rejectedMissions,
    copiedMissions,
    trendMissions,
    successfulAiCalls,
    failedAiCalls,
    failedLineDeliveries,
    businessMetrics,
    businessOutcomes,
    sideHustleFunnel,
    feedbackSummary,
    operationActions,
    visibleSections,
  } = model;

  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <p className="eyebrow">サービス管理者</p>
          <h1>{configuration.displayName}の開始準備と運営</h1>
          <p>開始準備の確認と、日々の運営に必要な設定をまとめました。</p>
          <Link href={`/s/${configuration.slug}/help` as Route}>運営マニュアル・ヘルプを見る</Link>
        </header>
        {isBusinessDailyService ? (
          <section className="settings-card">
            <h2>企業向け無料の限定運用</h2>
            <p>
              初期運用では、完成した投稿文章を1日1件LINEで届けます。画像・動画の自動生成、商品配布、紹介報酬は使用しません。
            </p>
            <ol>
              <li>
                開始準備：{readyCount} / {readiness.length}項目完了
              </li>
              <li>社内受信：直近7日間にLINE送信 {sentLineDeliveries}件</li>
              <li>投稿確認：直近7日間に投稿完了 {postedMissions}件</li>
              <li>限定テスト：現在の参加者 {participantCount}名（最初の目安は3〜5社）</li>
            </ol>
            <p>
              開始準備をすべて完了し、社内アカウントで受信と投稿を確認してから、3〜5社の7日間テストへ進みます。
            </p>
          </section>
        ) : null}
        <section className="settings-card">
          <h2>直近7日間の活動</h2>
          <p>参加者の本文や個別の利用履歴は表示せず、サービス全体の件数だけを確認できます。</p>
          <dl className="settings-status-list">
            <div className="settings-status-item">
              <dt>作られた投稿案</dt>
              <dd>{missionsCreated}件</dd>
            </div>
            <div className="settings-status-item">
              <dt>採用 / 今回は使わない</dt>
              <dd>
                {acceptedMissions}件 / {rejectedMissions}件
              </dd>
            </div>
            <div className="settings-status-item">
              <dt>コピー / 投稿完了</dt>
              <dd>
                {copiedMissions}回 / {postedMissions}件
              </dd>
            </div>
            {!isBusinessDailyService ? (
              <div className="settings-status-item">
                <dt>話題を使った投稿案</dt>
                <dd>{trendMissions}件</dd>
              </div>
            ) : null}
            <div className="settings-status-item">
              <dt>AIの処理</dt>
              <dd>
                成功 {successfulAiCalls}回 / 要確認 {failedAiCalls}回
              </dd>
            </div>
            <div className="settings-status-item">
              <dt>公式LINEの通知</dt>
              <dd>
                送信 {sentLineDeliveries}件 / 要確認 {failedLineDeliveries}件
              </dd>
            </div>
          </dl>
          <p>
            話題の調査を使うかは「サービスの見た目・登録」で設定できます。調査サービス・原価・APIキーはシステム管理者が管理します。
          </p>
          <a
            className="button button--secondary"
            href={`/api/services/${configuration.slug}/operations-report`}
          >
            この集計をCSVでダウンロード
          </a>
        </section>
        {isBusinessDailyService ? (
          <section className="settings-card">
            <h2>無料運用の利用率・継続率</h2>
            <p>個人名や投稿本文を表示せず、サービス全体の割合だけを確認できます。</p>
            <dl className="settings-status-list">
              <div className="settings-status-item">
                <dt>LINEを開いた割合</dt>
                <dd>
                  {businessMetrics.openRate === null ? '集計前' : `${businessMetrics.openRate}%`}
                </dd>
              </div>
              <div className="settings-status-item">
                <dt>投稿案を見た割合</dt>
                <dd>
                  {businessMetrics.viewRate === null ? '集計前' : `${businessMetrics.viewRate}%`}
                </dd>
              </div>
              <div className="settings-status-item">
                <dt>採用 / コピー / 投稿完了</dt>
                <dd>
                  {businessMetrics.acceptanceRate ?? 0}% / {businessMetrics.copyRate ?? 0}% /{' '}
                  {businessMetrics.postRate ?? 0}%
                </dd>
              </div>
              <div className="settings-status-item">
                <dt>7日後も利用</dt>
                <dd>
                  {businessMetrics.sevenDayRetention.percent === null
                    ? '対象者がまだいません'
                    : `${businessMetrics.sevenDayRetention.percent}%（${businessMetrics.sevenDayRetention.retained}/${businessMetrics.sevenDayRetention.eligible}名）`}
                </dd>
              </div>
              <div className="settings-status-item">
                <dt>30日後も利用</dt>
                <dd>
                  {businessMetrics.thirtyDayRetention.percent === null
                    ? '対象者がまだいません'
                    : `${businessMetrics.thirtyDayRetention.percent}%（${businessMetrics.thirtyDayRetention.retained}/${businessMetrics.thirtyDayRetention.eligible}名）`}
                </dd>
              </div>
              <div className="settings-status-item">
                <dt>直近7日で3日以上利用</dt>
                <dd>{businessMetrics.threeDayActiveUsers}名</dd>
              </div>
            </dl>
          </section>
        ) : null}
        {isBusinessDailyService ? (
          <section className="settings-card">
            <h2>投稿から生まれたお客様の反応</h2>
            <p>参加者が投稿後に自己申告した、直近30日間の合計です。</p>
            <dl className="settings-status-list">
              <div className="settings-status-item">
                <dt>問い合わせ</dt>
                <dd>{businessOutcomes.inquiries}件</dd>
              </div>
              <div className="settings-status-item">
                <dt>予約</dt>
                <dd>{businessOutcomes.reservations}件</dd>
              </div>
              <div className="settings-status-item">
                <dt>来店</dt>
                <dd>{businessOutcomes.visits}件</dd>
              </div>
              <div className="settings-status-item">
                <dt>購入・申込</dt>
                <dd>{businessOutcomes.orders}件</dd>
              </div>
              <div className="settings-status-item">
                <dt>その他</dt>
                <dd>{businessOutcomes.other}件</dd>
              </div>
            </dl>
          </section>
        ) : null}
        {configuration.registration.referralEnabled ? (
          <section className="settings-card">
            <h2>直近7日間の商品投稿の流れ</h2>
            <p>投稿本文は表示せず、専用URLが入った投稿案の進み方だけを確認します。</p>
            <dl className="settings-status-list">
              {sideHustleFunnel.stages.map((stage) => (
                <div className="settings-status-item" key={stage.key}>
                  <dt>{stage.label}</dt>
                  <dd>{stage.count}件</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
        <section className="settings-card">
          <h2>次週の投稿改善に使える感想</h2>
          <p>直近28日間の投稿完了に対する集計です。投稿本文や参加者ごとの回答は表示しません。</p>
          <dl className="settings-status-list">
            <div className="settings-status-item">
              <dt>感想入力率</dt>
              <dd>{feedbackSummary.coveragePercent}%</dd>
            </div>
            <div className="settings-status-item">
              <dt>自分らしい / 普通 / 違う</dt>
              <dd>
                {feedbackSummary.good}件 / {feedbackSummary.neutral}件 / {feedbackSummary.bad}件
              </dd>
            </div>
            <div className="settings-status-item">
              <dt>未入力</dt>
              <dd>{feedbackSummary.unrated}件</dd>
            </div>
          </dl>
          <p>入力された集計は、次に作る週間計画の形式と切り口の改善に使われます。</p>
        </section>
        {operationActions.length > 0 ? (
          <section className="settings-card">
            <h2>いま確認すること</h2>
            <p>止まっている作業や、確認が必要なものだけを表示しています。</p>
            <ul className="settings-status-list">
              {operationActions.map((item) => (
                <li className="settings-status-item" key={item.title}>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.detail}</p>
                  </div>
                  {item.href && item.label ? (
                    <Link className="button button--secondary" href={item.href as Route}>
                      {item.label}
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <section className="settings-card">
          <h2>
            {readyCount} / {readiness.length} 項目が準備できています
          </h2>
          <p>
            {readyCount === readiness.length
              ? '必要な設定がそろいました。参加者のテストを始められます。'
              : '「設定する」と表示されている項目を確認してください。'}
          </p>
        </section>
        <section className="settings-card">
          <h2>開始準備</h2>
          <div className="settings-status-list">
            {readiness.map((item) => (
              <article className="settings-status-item" key={item.key}>
                <div>
                  <p>{item.ready ? '✓ 準備できています' : '● 設定が必要です'}</p>
                  <h3>{item.label}</h3>
                  <p>{item.detail}</p>
                </div>
                <Link className="button button--secondary" href={item.path as Route}>
                  {item.ready ? '確認する' : '設定する'}
                </Link>
              </article>
            ))}
          </div>
        </section>
        <section className="settings-card">
          <h2>運営メニュー</h2>
          <ul className="settings-status-list">
            {visibleSections.map((section) => (
              <li className="settings-status-item" key={section.href}>
                <h3>{section.title}</h3>
                <p>{section.description}</p>
                <Link
                  className="button button--secondary"
                  href={`/s/${configuration.slug}/manage/${section.href}` as Route}
                >
                  開く
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <Link href={`/s/${configuration.slug}/home` as Route}>← 参加者向けのホームを見る</Link>
      </main>
    </PublicShell>
  );
}
