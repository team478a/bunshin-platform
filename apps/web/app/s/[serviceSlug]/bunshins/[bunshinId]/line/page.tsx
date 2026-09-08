import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  serviceLineLinkScope,
  ServiceLineLinkUnavailable,
} from '../../../../../../src/http/service-line-link';
import { isRouteNotFound } from '../../../../../../src/navigation/route-not-found';

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
  return (
    <main className="app-page">
      <h1>LINEの接続と動画の完成通知</h1>
      <p>{scope.bunshin.name}</p>
      <p>現在のアカウントに、このサービスからのお知らせを受け取るLINEを接続します。</p>
      {result && messages[result] ? <p role="status">{messages[result]}</p> : null}
      <p>
        接続状態：
        {connection?.status === 'ACTIVE' &&
        connection.friendshipStatus === 'FOLLOWING' &&
        connection.notificationConsentAt
          ? '接続済み'
          : '確認が必要'}
      </p>
      <form action="/auth/service-line/start" method="post">
        <input type="hidden" name="serviceSlug" value={serviceSlug} />
        <input type="hidden" name="bunshinId" value={bunshinId} />
        <label>
          <input type="checkbox" name="consent" value="yes" required />
          このサービスのLINE通知を受け取ることに同意する
        </label>
        <button type="submit">本人確認してLINEを接続する</button>
      </form>
      <h2>完成した動画</h2>
      {renders.map((render) => (
        <section key={render.id}>
          <h3>{render.project.title}</h3>
          <p>
            通知：
            {render.notificationStatus === 'SENT'
              ? '送信済み'
              : render.notificationStatus === 'PENDING'
                ? '送信待ち'
                : '未送信'}
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
              <button type="submit">この動画の完成通知を送る</button>
            </form>
          ) : null}
        </section>
      ))}
      <Link href={`/s/${serviceSlug}/bunshins/${bunshinId}`}>投稿パートナーの設定へ戻る</Link>
    </main>
  );
}
