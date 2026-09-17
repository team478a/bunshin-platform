import Link from 'next/link';
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
  const messages: Record<string, string> = {
    connected: 'LINEを接続し、通知を有効にしました。',
    'follow-required':
      'LINEを確認しました。公式アカウントを友だち追加し、接続をもう一度確認してください。',
    queued: '完成通知の送信を受け付けました。少し待って画面を更新してください。',
    failed:
      '処理を完了できませんでした。ログイン状態、公式LINEの友だち追加、通知しない時間帯を確認してください。接続の途中で失敗した場合は、もう一度接続を始めてください。',
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
      {result === 'failed' && (
        <section className="settings-card line-link-status line-link-status--error" role="alert">
          <h2>LINE接続は完了していません</h2>
          <p className="form-error">{messages.failed}</p>
          <p>下の同意欄にチェックを付けてから、もう一度青いボタンを押してください。</p>
        </section>
      )}
      {result && result !== 'failed' && messages[result] ? (
        <p className="success-message line-link-result" role="status">
          {messages[result]}
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
                <button className="button button--secondary button--full" type="submit">
                  この動画の完成通知を送る
                </button>
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
