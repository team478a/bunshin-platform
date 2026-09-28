import type { Route } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { isRouteNotFound } from '../../../../src/navigation/route-not-found';
import { loadServiceLineSettings } from '../../../../src/services/service-line-settings';
import { PublicShell } from '../../../ui/public-shell';

export const dynamic = 'force-dynamic';

export default async function ServiceLineSettingsPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect(`/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/line`)}` as Route);
  const settings = await loadServiceLineSettings(serviceSlug, actor.userId).catch(
    (error: unknown) => {
      if (isRouteNotFound(error)) notFound();
      throw error;
    },
  );
  const { service, mode, partners, available, connected, consented } = settings;
  const slug = service.configuration.slug;
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page line-link-page">
        <header className="app-page__heading">
          <p className="eyebrow">{service.configuration.displayName}</p>
          <h1>LINEの接続・お知らせ設定</h1>
          <p>このサービスからのお知らせを受け取るLINEを確認できます。</p>
        </header>
        <section className="settings-card">
          {mode === 'DISABLED' ? (
            <p>このサービスではLINE配信を利用していません。</p>
          ) : mode === 'SHARED' ? (
            <p>
              このサービスは共通LINEでお知らせを届けます。投稿パートナーの画面で通知設定を確認してください。
            </p>
          ) : !available ? (
            <p role="status">
              現在、サービスのLINE配信を利用できません。運営者へお問い合わせください。
            </p>
          ) : !consented ? (
            <p>
              サービスへの参加同意を確認できません。サービスのホームで参加手続きを確認してください。
            </p>
          ) : (
            <>
              <h2>{connected ? 'LINE接続済み' : 'LINE接続は未完了です'}</h2>
              <p>
                {connected
                  ? 'LINE接続、通知への同意、友だち追加を確認できています。投稿案の受け取り日・時刻は投稿パートナーの画面で確認してください。'
                  : '公式LINEから参加登録した場合も、このサービスのLINE接続が必要です。下のボタンから接続を確認してください。'}
              </p>
            </>
          )}
          {mode !== 'DISABLED' && (mode === 'SHARED' || (available && consented)) ? (
            partners.length === 0 ? (
              <>
                <p>接続・通知設定を進めるには、最初に投稿パートナーを作成してください。</p>
                <Link
                  className="button button--primary button--full"
                  href={`/s/${slug}/bunshins` as Route}
                >
                  投稿パートナーを作る
                </Link>
              </>
            ) : (
              partners.map((partner) => (
                <div key={partner.id} className="form-stack">
                  {partners.length > 1 ? <h3>{partner.name}</h3> : null}
                  <Link
                    className="button button--primary button--full"
                    href={
                      (mode === 'DEDICATED'
                        ? `/s/${slug}/bunshins/${partner.id}/line`
                        : `/s/${slug}/bunshins/${partner.id}`) as Route
                    }
                  >
                    {mode === 'SHARED'
                      ? 'お知らせ設定を確認する'
                      : connected
                        ? 'LINEの接続状態を確認する'
                        : 'LINEへ接続する'}
                  </Link>
                  {mode === 'DEDICATED' ? (
                    <Link href={`/s/${slug}/bunshins/${partner.id}` as Route}>
                      投稿案の受け取り設定を確認する
                    </Link>
                  ) : null}
                </div>
              ))
            )
          ) : null}
        </section>
        <Link href={`/account?service=${slug}` as Route}>アカウントへ戻る</Link>
      </main>
    </PublicShell>
  );
}
