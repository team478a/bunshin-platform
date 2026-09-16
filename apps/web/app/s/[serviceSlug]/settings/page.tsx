import { PublicShell } from '../../../ui/public-shell';
import { fortuneDailyReadingService } from '../../../../src/fortune/runtime';
import { resolveFortunePage } from '../../../../src/fortune/page-context';
import { FortuneNav } from '../fortune-ui';

export const dynamic = 'force-dynamic';
export default async function FortuneSettingsPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const { actor, setting } = await resolveFortunePage(serviceSlug, `/s/${serviceSlug}/settings`);
  const today = await (
    await fortuneDailyReadingService()
  ).today({ serviceSlug, actorUserId: actor.userId });
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page fortune-page">
        <header className="app-page__heading">
          <h1>占いの設定</h1>
          <p>現在の利用状況を確認できます。</p>
        </header>
        <section className="settings-card">
          <h2>年齢確認</h2>
          <p>
            {today.participant
              ? `${setting.minimumAge}歳以上であることを確認済みです。`
              : 'まだ年齢確認が終わっていません。'}
          </p>
        </section>
        <section className="settings-card">
          <h2>お知らせ</h2>
          <p>
            {setting.weeklyNotificationEnabled
              ? '週1回のお知らせが設定されています。'
              : 'お知らせは送られません。'}
          </p>
        </section>
        <section className="settings-card">
          <h2>結果の保存期間</h2>
          <p>
            占い結果は{setting.historyRetentionDays}
            日間確認できます。結果画面からいつでも削除できます。
          </p>
        </section>
        <FortuneNav serviceSlug={serviceSlug} />
      </main>
    </PublicShell>
  );
}
