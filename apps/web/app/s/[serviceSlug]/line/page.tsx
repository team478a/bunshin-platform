import type { Route } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { isRouteNotFound } from '../../../../src/navigation/route-not-found';
import { loadServiceLineSettings } from '../../../../src/services/service-line-settings';
import { PublicShell } from '../../../ui/public-shell';
import { LineConnectionForm } from '../bunshins/[bunshinId]/line/line-connection-form';

export const dynamic = 'force-dynamic';

export default async function ServiceLineSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceSlug: string }>;
  searchParams: Promise<{ lineResult?: string }>;
}) {
  const { serviceSlug } = await params;
  const lineResult = (await searchParams).lineResult;
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
  if (settings.learningService) {
    const result = lineResult;
    const ready = mode === 'DEDICATED' && available && consented;
    return (
      <PublicShell showPlatformBrand={false}>
        <main className="app-page line-link-page">
          <header className="app-page__heading">
            <p className="eyebrow">{service.configuration.displayName}</p>
            <h1>学習用LINEの接続</h1>
            <p>
              現在のアカウントに、このサービスの公式LINEを接続します。投稿パートナーの作成は不要です。
            </p>
          </header>
          <section className="settings-card form-stack">
            {result === 'follow-required' ? (
              <p role="status">公式LINEを友だち追加してから、もう一度接続を確認してください。</p>
            ) : result === 'DEDICATED_LINE_REQUIRED' ? (
              <p role="status">
                LINEログインの連携は完了しました。通知を受け取るには、この画面から学習用公式LINEの接続と友だち状態を別途確認してください。
              </p>
            ) : result === 'ENABLED' ? (
              <p role="status">
                LINEログインの連携は完了しました。学習用LINEの接続は、この画面で別途確認してください。
              </p>
            ) : result && result !== 'connected' ? (
              <p role="alert">
                LINE接続を完了できませんでした。この画面からもう一度お試しください。繰り返す場合は運営者へお問い合わせください。
              </p>
            ) : null}
            {!consented ? (
              <>
                <p>サービスへの参加同意を確認してください。</p>
                <Link href={`/s/${slug}/legal-consent` as Route}>利用規約などを確認する</Link>
              </>
            ) : !ready ? (
              <p role="status">現在、学習用LINEへ接続できません。運営者へお問い合わせください。</p>
            ) : connected ? (
              <p role="status">公式LINEへの接続と友だち追加を確認しました。</p>
            ) : (
              <LineConnectionForm serviceSlug={slug} />
            )}
            <p>
              LINE接続だけで学習への参加や通知配信は開始しません。学習通知の開始は別途ご案内します。
            </p>
          </section>
          <Link
            className="button button--primary button--full"
            href={`/s/${slug}/programs` as Route}
          >
            学習を始める・続ける
          </Link>
          <Link href={`/account?service=${slug}` as Route}>アカウントへ戻る</Link>
        </main>
      </PublicShell>
    );
  }
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page line-link-page">
        <header className="app-page__heading">
          <p className="eyebrow">{service.configuration.displayName}</p>
          <h1>LINEの接続・お知らせ設定</h1>
          <p>このサービスからのお知らせを受け取るLINEを確認できます。</p>
        </header>
        <section className="settings-card">
          {lineResult === 'ENABLED' ? (
            <p role="status">
              このサービス内の投稿パートナー全員について、LINE通知を有効にしました。
            </p>
          ) : lineResult === 'FRIENDSHIP_NOT_CONFIRMED' ? (
            <p role="status">
              LINE連携は完了しました。公式LINEを友だち追加後、この画面から通知設定を確認してください。
            </p>
          ) : lineResult === 'DEDICATED_LINE_REQUIRED' ? (
            <p role="status">
              このサービスは専用LINEを使用します。各投稿パートナーの接続画面で専用LINEの友だち状態を確認してください。
            </p>
          ) : lineResult === 'LEGAL_CONSENT_REQUIRED' ? (
            <p role="status">先にこのサービスの利用規約などへの同意が必要です。</p>
          ) : lineResult === 'LINE_DISABLED' ? (
            <p role="status">このサービスではLINE通知を利用していません。</p>
          ) : lineResult === 'NO_BUNSHINS' ? (
            <p role="status">
              LINE連携は完了しました。通知を受け取る投稿パートナーを作成してください。
            </p>
          ) : lineResult === 'BUNSHIN_NOT_READY' ? (
            <p role="status">
              LINE連携は完了しました。一部の投稿パートナーで投稿設定が未完了のため、通知は有効化していません。設定を確認してください。
            </p>
          ) : lineResult === 'ACTIVATION_FAILED' ? (
            <p role="status">
              LINE連携は完了しましたが、通知設定を確認できませんでした。この画面から接続状態を確認してください。
            </p>
          ) : lineResult === 'SCHEDULING_RETRY_REQUIRED' ? (
            <p role="status">
              通知設定は保存されましたが、日々のお知らせの準備登録が完了しませんでした。ボタンをもう一度押して再試行してください。
            </p>
          ) : null}
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
            <>
              <p>サービスへの参加同意を確認できません。現在の文書への同意を確認してください。</p>
              <Link href={`/s/${slug}/legal-consent` as Route}>利用規約などを確認する</Link>
            </>
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
          {mode === 'SHARED' && partners.length > 0 ? (
            <form
              action={`/api/services/${encodeURIComponent(slug)}/line-notifications/enable`}
              method="post"
              className="form-stack"
            >
              <label>
                <input name="lineNotifications" type="checkbox" value="all" required />
                このサービス内の全ての投稿パートナーについて、LINEで日々のお知らせを受け取る
              </label>
              <button className="button button--primary button--full" type="submit">
                全ての投稿パートナーでLINE通知を有効にする
              </button>
            </form>
          ) : null}
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
