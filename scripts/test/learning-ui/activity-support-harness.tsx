import { ActivityBarrierCard } from '../../../apps/web/app/s/[serviceSlug]/bunshins/[bunshinId]/activity-barrier-card';
import { supportFixture } from './activity-support-fixture';
export function ActivitySupportHarness() {
  const query = new URLSearchParams(location.search);
  // Synthetic offered snapshots, matching the owner API. Rule selection is covered by domain/SQL tests.
  const definitions = {
    image: {
      category: 'MEDIA',
      label: '画像の利用枠と残り回数を確認したい',
      key: 'IMAGE_CREDIT_REVIEW',
      title: '画像作成の利用枠を確認する',
    },
    multi: {
      category: 'EFFORT',
      label: '複数SNSの投稿準備を整理したい',
      key: 'MULTI_PLATFORM_PREPARATION',
      title: '複数SNSの投稿準備をまとめる',
    },
    referral: {
      category: 'EFFECT',
      label: '紹介状況と特典の条件を確認したい',
      key: 'REFERRAL_BENEFIT_REVIEW',
      title: '紹介の状況と特典を確認する',
    },
  } as const;
  const kind = query.get('usage');
  const definition =
    kind === 'image' || kind === 'multi' || kind === 'referral' ? definitions[kind] : null;
  const guide = definition
    ? {
        id: supportFixture.id,
        status: query.has('accepted') ? ('ACCEPTED' as const) : ('OFFERED' as const),
        support: {
          key: definition.key,
          title: definition.title,
          reason: '本人が確認するための無料ガイドです。',
          steps: ['ご自身で確認する'],
        },
      }
    : null;
  const card = (
    <ActivityBarrierCard
      endpoint="/api/synthetic/activity-support"
      postingHref="#today-post"
      creditsHref="#credits"
      referralHref="#referrals"
      metricsHref="#sns-numbers"
      initialSupport={query.has('offered') ? (guide ?? supportFixture) : null}
      initialQuestion={{
        caseIds: ['22222222-2222-4222-8222-222222222222'],
        ...(definition ? { evidenceKey: 'synthetic-usage-evidence-v1' } : {}),
        title: definition
          ? '今の利用状況に合わせた案内を確認しますか？'
          : '投稿する作業に負担がありますか？',
        description: '今の状況を教えてください。',
        options: [
          {
            caseId: '22222222-2222-4222-8222-222222222222',
            category: definition?.category ?? 'TIME',
            label: definition?.label ?? '投稿する時間がない',
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

      <section id="credits">画像作成回数</section>
      <section id="referrals">自分の紹介状況</section>
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
