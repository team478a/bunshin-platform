import { PublicShell } from '../../../ui/public-shell';
import { fortuneDailyReadingService } from '../../../../src/fortune/runtime';
import { resolveFortunePage } from '../../../../src/fortune/page-context';
import { FortuneNav } from '../fortune-ui';
import { FortuneNotificationSetting } from '../fortune-notification-setting';
import { FortuneWithdrawButton } from '../fortune-actions';

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
          {!setting.weeklyNotificationEnabled ? (
            <p>現在、このサービスでは週1回のお知らせを配信していません。</p>
          ) : !today.participant ? (
            <p>年齢確認を終えると、LINE通知を設定できます。</p>
          ) : (
            <FortuneNotificationSetting serviceSlug={serviceSlug} />
          )}
        </section>
        <section className="settings-card">
          <h2>結果の保存期間</h2>
          <p>
            占い結果は{setting.historyRetentionDays}
            日間確認できます。結果画面からいつでも削除できます。
          </p>
        </section>
        <section className="settings-card">
          <h2>この占いサービスの退会</h2>
          <p>
            この占いサービスだけを退会します。他のサービスとワタシワークスのアカウントは残ります。
          </p>
          <FortuneWithdrawButton serviceSlug={serviceSlug} />
        </section>
        <FortuneNav serviceSlug={serviceSlug} />
      </main>
    </PublicShell>
  );
}
