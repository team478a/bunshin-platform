import Link from 'next/link';
import { PendingSubmitButton } from '../../../../../ui/pending-submit-button';
import { notFound } from 'next/navigation';
import {
  serviceLineLinkScope,
  ServiceLineLinkUnavailable,
} from '../../../../../../src/http/service-line-link';
import { isRouteNotFound } from '../../../../../../src/navigation/route-not-found';
import { LineConnectionForm } from './line-connection-form';

export const dynamic = 'force-dynamic';
export default async function ServiceLinePage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceSlug: string; bunshinId: string }>;
  searchParams: Promise<{ lineResult?: string }>;
}) {
  const { serviceSlug, bunshinId } = await params;
  const scope = await serviceLineLinkScope(serviceSlug, bunshinId).catch((error: unknown) => {
    if (error instanceof ServiceLineLinkUnavailable || isRouteNotFound(error)) return null;
    throw error;
  });
  if (!scope) notFound();
  const [connection, renders] = await Promise.all([
    scope.db.prisma.groupLineConnection.findUnique({
      where: {
        configurationId_userId: {
          configurationId: scope.configuration.id,
          userId: scope.actor.userId,
        },
      },
      select: { status: true, friendshipStatus: true, notificationConsentAt: true },
    }),
    scope.db.prisma.videoRender.findMany({
      where: {
        workspaceId: scope.service.workspaceId,
        groupId: scope.service.serviceId,
        ownerUserId: scope.actor.userId,
        project: { bunshinId },
        status: 'SUCCEEDED',
        deletedAt: null,
      },
      orderBy: { completedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        notificationStatus: true,
        notificationErrorCode: true,
        notifiedAt: true,
        completedAt: true,
        expiresAt: true,
        outputStorageKey: true,
        project: { select: { title: true } },
      },
    }),
  ]);
  const messages: Record<string, { title: string; body: string }> = {
    'request-invalid': {
      title: 'この画面を更新してください',
      body: '安全確認の期限が切れました。画面を更新してから、もう一度お試しください。',
    },
    'consent-required': {
      title: '同意欄へのチェックが必要です',
      body: '下の四角を押してチェックを付けると、青い接続ボタンを押せます。',
    },
    'configuration-unavailable': {
      title: '現在LINEへ接続できません',
      body: 'ログイン状態またはサービスのLINE設定を確認できませんでした。画面を更新しても直らない場合は運営者へご連絡ください。',
    },
    'session-expired': {
      title: 'LINEの本人確認が期限切れになりました',
      body: 'この画面とLINEの本人確認で別のブラウザが開いた可能性があります。この画面から、もう一度接続を始めてください。',
    },
    'session-changed': {
      title: 'ログイン状態が変わりました',
      body: 'ワタシワークスへログインし直してから、もう一度接続を始めてください。',
    },
    'verification-failed': {
      title: 'LINEの本人確認を完了できませんでした',
      body: '公式LINEを友だち追加していることを確認し、この画面からもう一度お試しください。繰り返し失敗する場合はLINE設定を運営者が確認します。',
    },
    'destination-in-use': {
      title: 'このLINEは別の登録で使用されています',
      body: '現在ログインしているワタシワークスのアカウントをご確認ください。心当たりがない場合は運営者へご連絡ください。',
    },
    'save-failed': {
      title: 'LINE接続の保存を完了できませんでした',
      body: '本人確認は進みましたが、接続情報を保存できませんでした。少し待ってから、もう一度お試しください。',
    },
    connected: {
      title: 'LINE接続が完了しました',
      body: 'LINEを接続し、通知を有効にしました。',
    },
    'follow-required': {
      title: '公式LINEの友だち追加が必要です',
      body: 'LINEを確認しました。公式アカウントを友だち追加し、接続をもう一度確認してください。',
    },
    queued: {
      title: '通知を受け付けました',
      body: '完成通知の送信を受け付けました。少し待って画面を更新してください。',
    },
    failed: {
      title: 'LINE接続は完了していません',
      body: 'LINEの本人確認を途中で閉じた場合は、この画面からもう一度接続を始めてください。',
    },
  };
  const result = (await searchParams).lineResult;
  const connected = Boolean(
    connection?.status === 'ACTIVE' &&
    connection.friendshipStatus === 'FOLLOWING' &&
    connection.notificationConsentAt,
  );
  return (
    <main className="app-page line-link-page">
      <header className="app-page__heading">
        <p className="eyebrow">{scope.bunshin.name}</p>
        <h1>LINEの接続と動画の完成通知</h1>
        <p>現在のアカウントに、このサービスからのお知らせを受け取るLINEを接続します。</p>
      </header>
      {result &&
        messages[result] &&
        !['connected', 'follow-required', 'queued'].includes(result) && (
          <section className="settings-card line-link-status line-link-status--error" role="alert">
            <h2>{messages[result].title}</h2>
            <p className="form-error">{messages[result].body}</p>
            <a className="button button--secondary button--full" href="#line-connect-form">
              接続をやり直す
            </a>
          </section>
        )}
      {result && ['connected', 'follow-required', 'queued'].includes(result) && messages[result] ? (
        <p className="success-message line-link-result" role="status">
          {messages[result].body}
        </p>
      ) : null}
      <section
        className={`settings-card line-link-status ${connected ? 'line-link-status--connected' : ''}`}
      >
        <h2>{connected ? 'LINE接続は完了しています' : 'LINEを接続する'}</h2>
        <p>
          接続状態：<strong>{connected ? '接続済み' : '未完了'}</strong>
        </p>
        {connected ? (
          <Link
            className="button button--primary button--full"
            href={`/s/${serviceSlug}/bunshins/${bunshinId}`}
          >
            投稿パートナーの設定へ進む
          </Link>
        ) : (
          <LineConnectionForm serviceSlug={serviceSlug} bunshinId={bunshinId} />
        )}
      </section>
      <section className="line-link-videos" aria-labelledby="completed-videos-title">
        <header>
          <p className="eyebrow">通知履歴</p>
          <h2 id="completed-videos-title">完成した動画</h2>
        </header>
        {renders.length === 0 && <p className="settings-card">完成した動画はまだありません。</p>}
        {renders.map((render) => (
          <article className="settings-card line-link-video" key={render.id}>
            <h3>{render.project.title}</h3>
            <p>
              通知：
              <strong>
                {render.notificationStatus === 'SENT'
                  ? '送信済み'
                  : render.notificationStatus === 'PENDING'
                    ? '送信待ち'
                    : '未送信'}
              </strong>
            </p>
            {render.notificationStatus === 'CANCELLED' &&
            render.notificationErrorCode === 'NOTIFICATION_SUPPRESSED' &&
            !render.notifiedAt &&
            render.outputStorageKey &&
            (!render.expiresAt || render.expiresAt.getTime() > Date.now()) &&
            render.completedAt &&
            Date.now() - render.completedAt.getTime() < 23 * 60 * 60_000 ? (
              <form action="/auth/service-line/retry-video" method="post">
                <input type="hidden" name="serviceSlug" value={serviceSlug} />
                <input type="hidden" name="bunshinId" value={bunshinId} />
                <input type="hidden" name="renderId" value={render.id} />
                <PendingSubmitButton
                  className="button button--secondary button--full"
                  pendingLabel="通知を送っています…"
                >
                  この動画の完成通知を送る
                </PendingSubmitButton>
              </form>
            ) : null}
          </article>
        ))}
      </section>
      <Link className="line-link-back" href={`/s/${serviceSlug}/bunshins/${bunshinId}`}>
        ← 投稿パートナーの設定へ戻る
      </Link>
    </main>
  );
}
