import type { Metadata } from 'next';
import { PublicShell } from '../../../ui/public-shell';
import { fortuneDailyReadingService } from '../../../../src/fortune/runtime';
import { resolveFortunePage } from '../../../../src/fortune/page-context';
import { FortuneNav, ReadingCard } from '../fortune-ui';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '過去の占い結果' };
export default async function FortuneHistoryPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const { actor, setting } = await resolveFortunePage(serviceSlug, `/s/${serviceSlug}/history`);
  const fortune = await fortuneDailyReadingService();
  const today = await fortune.today({ serviceSlug, actorUserId: actor.userId });
  const readings = today.participant
    ? await fortune.history({ serviceSlug, actorUserId: actor.userId })
    : [];
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page fortune-page">
        <header className="app-page__heading">
          <h1>過去の結果</h1>
          <p>最近{setting.historyRetentionDays}日分の占いを確認できます。</p>
        </header>
        {readings.length === 0 ? (
          <section className="settings-card">
            <h2>まだ結果はありません</h2>
            <p>「今日の占い」から最初のカードを引いてみましょう。</p>
          </section>
        ) : (
          <div className="fortune-history">
            {readings.map((reading) => (
              <ReadingCard key={reading.id} reading={reading} serviceSlug={serviceSlug} linked />
            ))}
          </div>
        )}
        <FortuneNav serviceSlug={serviceSlug} />
      </main>
    </PublicShell>
  );
}
