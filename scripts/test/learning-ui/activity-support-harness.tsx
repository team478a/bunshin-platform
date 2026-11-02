import { ActivityBarrierCard } from '../../../apps/web/app/s/[serviceSlug]/bunshins/[bunshinId]/activity-barrier-card';
import { supportFixture } from './activity-support-fixture';
export function ActivitySupportHarness() {
  const query = new URLSearchParams(location.search);
  const card = (
    <ActivityBarrierCard
      endpoint="/api/synthetic/activity-support"
      postingHref="#today-post"
      metricsHref="#sns-numbers"
      initialSupport={query.has('offered') ? supportFixture : null}
      initialQuestion={{
        caseIds: ['22222222-2222-4222-8222-222222222222'],
        title: '投稿する作業に負担がありますか？',
        description: '今の状況を教えてください。',
        options: [
          {
            caseId: '22222222-2222-4222-8222-222222222222',
            category: 'TIME',
            label: '投稿する時間がない',
          },
        ],
        noneLabel: '投稿はしています',
      }}
    />
  );
  return (
    <main className="app-page">
      {query.has('hidden') ? (
        <details>
          <summary>サポートを開く</summary>
          {card}
        </details>
      ) : (
        card
      )}

      <section id="today-post">
        <h2>今日の投稿案</h2>
      </section>
      <details>
        <summary>投稿結果</summary>
        <section id="sns-numbers">数値を記録する</section>
      </details>
    </main>
  );
}
